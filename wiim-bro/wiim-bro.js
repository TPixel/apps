#!/usr/bin/env node
// WiiM-bro: lille lokal server der
//  1) serverer Ditzel-apps (vinyl.html m.fl.) på hjemmenetværket, og
//  2) taler med WiiM'ens lokale HTTP-API (selvsigneret cert, ingen CORS) på vegne af browseren.
//
// Kør:   node wiim-bro.js --wiim 192.168.1.50 [--port 8787] [--root ..]
// Åbn:   http://<mac>.local:8787/vinyl.html   (fra iPad på samme netværk)
//
// Ingen afhængigheder — kun Node's indbyggede moduler.

'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- argumenter ----------
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : (process.env['WIIM_' + name.toUpperCase()] || def); }
const WIIM = (arg('wiim', '') || '').replace(/\/+$/, '');
const PORT = parseInt(arg('port', '8787'), 10);
const ROOT = path.resolve(arg('root', path.join(__dirname, '..')));
if (!WIIM) { console.error('Mangler --wiim <ip eller adresse på WiiM>. Find IP i WiiM Home-appen under enhedens indstillinger.'); process.exit(1); }
const WIIM_NAME = WIIM.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');   // fx DITZEL-Ultra.local (anbefalet) eller en IP
const WIIM_BASE = 'https://' + WIIM_NAME;
// Find WiiM'ens aktuelle IP ud fra navnet (mDNS), så den overlever nyt wifi/router/mesh. Slås op igen hvert minut og ved fejl.
let WIIM_IP = WIIM_NAME;
function resolveWiim() {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(WIIM_NAME)) return;
  require('dns').lookup(WIIM_NAME, { family: 4 }, (e, a) => { if (!e && a && a !== WIIM_IP) { console.log('WiiM fundet på ' + a); WIIM_IP = a; } });
}
resolveWiim(); setInterval(resolveWiim, 60000);

// ---------- WiiM-API ----------
function wiim(command) {
  return new Promise((resolve, reject) => {
    const url = 'https://' + WIIM_IP + '/httpapi.asp?command=' + encodeURIComponent(command);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, timeout: 4000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(new Error('WiiM svarer ikke (timeout)')); });
    req.on('error', (e) => { resolveWiim(); reject(e); });
  });
}
function hex2utf8(h) {
  if (!h || !/^[0-9a-fA-F]+$/.test(h) || h.length % 2) return h || '';
  try { return Buffer.from(h, 'hex').toString('utf8'); } catch (e) { return h; }
}
function parseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

const MODES = { '0': 'Ingen', '1': 'AirPlay', '2': 'DLNA', '10': 'Netværk', '11': 'USB', '20': 'API', '31': 'Spotify', '32': 'Tidal', '36': 'Qobuz', '40': 'Line-in', '41': 'Bluetooth', '43': 'Optisk', '45': 'HDMI', '47': 'Phono', '99': 'Multiroom' };

let statusCache = { t: 0, data: null };
let lastStarted = { album: '', artist: '' }; const artistGuess = {};
async function getWiimStatus() {
  if (Date.now() - statusCache.t < 900 && statusCache.data) return statusCache.data;
  const [psRaw, miRaw] = await Promise.all([wiim('getPlayerStatus'), wiim('getMetaInfo').catch(() => '')]);
  const ps = parseJson(psRaw) || {};
  const mi = (parseJson(miRaw) || {}).metaData || {};
  const data = {
    status: ps.status || 'unknown',                      // play | pause | stop | load
    playing: ps.status === 'play',
    title: mi.title || hex2utf8(ps.Title),
    artist: mi.subtitle || mi.artist || hex2utf8(ps.Artist),
    album: mi.album || hex2utf8(ps.Album),
    art: mi.albumArtURI || '',
    pos: parseInt(ps.curpos, 10) || 0,                   // ms
    len: parseInt(ps.totlen, 10) || 0,                   // ms
    vol: parseInt(ps.vol, 10),
    mute: ps.mute === '1',
    source: MODES[String(ps.mode)] || ('mode ' + ps.mode),
    sampleRate: mi.sampleRate || '', bitDepth: mi.bitDepth || '', bitRate: mi.bitRate || '',
    ts: Date.now()
  };
  // WiiM kender ofte ikke kunstneren ved Tidal-køer ("unknow") — brug det vi selv startede, eller slå op på Tidal
  ['title', 'artist', 'album'].forEach((k) => { if (/^unknow?n?$/i.test(String(data[k] || '').trim())) data[k] = ''; });
  if (!data.artist && data.album) {
    if (lastStarted.album && norm(lastStarted.album) === norm(data.album)) data.artist = lastStarted.artist || '';
    else if (artistGuess[data.album] !== undefined) data.artist = artistGuess[data.album];
    else { artistGuess[data.album] = ''; tidalSearch(data.album, 5).then((r) => { const m = r.find((x) => norm(x.album) === norm(data.album)); artistGuess[data.album] = m ? m.artist : ''; }).catch(() => {}); }
  }
  statusCache = { t: Date.now(), data };
  return data;
}

// ---------- TIDAL-appen på Mac'en (via media-control = macOS "Nu spiller") ----------
const { execFile } = require('child_process');
const MC = ['/opt/homebrew/bin/media-control', '/usr/local/bin/media-control'].find((f) => fs.existsSync(f)) || '';
function run(cmd, a, ms) { return new Promise((res) => execFile(cmd, a, { timeout: ms || 4000, maxBuffer: 8e6 }, (e, out) => res(e ? '' : String(out)))); }
let macCache = { t: 0, data: null }, macArt = { key: '', buf: null, mime: 'image/jpeg' }, macVol = { t: 0, v: NaN };
async function getMacStatus() {
  if (!MC) return null;
  if (Date.now() - macCache.t < 900) return macCache.data;
  const j = parseJson(await run(MC, ['get'])) || null;
  let data = null;
  if (j && j.bundleIdentifier === 'com.tidal.desktop' && j.title) {
    const key = (j.album || '') + '|' + (j.artist || '') + '|' + (j.title || '');
    if (j.artworkData && key !== macArt.key) macArt = { key, buf: Buffer.from(j.artworkData, 'base64'), mime: j.artworkMimeType || 'image/jpeg' };
    const ts = Date.parse(j.timestamp || '') || Date.now();
    const el = (j.elapsedTime || 0) + (j.playing ? Math.max(0, (Date.now() - ts) / 1000) * (j.playbackRate || 1) : 0);
    if (Date.now() - macVol.t > 3000) { macVol = { t: Date.now(), v: parseInt(await run('/usr/bin/osascript', ['-e', 'output volume of (get volume settings)']), 10) }; }
    data = { device: 'mac', status: j.playing ? 'play' : 'pause', playing: !!j.playing, title: j.title || '', artist: j.artist || '', album: j.album || '',
      art: macArt.buf ? '/mac/art?k=' + encodeURIComponent(macArt.key).slice(0, 80) : '', pos: Math.round(el * 1000), len: Math.round((j.duration || 0) * 1000),
      vol: macVol.v, mute: false, source: 'TIDAL på Mac', sampleRate: '', bitDepth: '', bitRate: '', ts: Date.now() };
    // Høj-opløseligt cover fra Tidal-kataloget, når vi kan finde albummet
    const ak = norm(data.album) + '|' + norm(data.artist);
    if (macHiRes[ak] === undefined) { macHiRes[ak] = ''; tidalFind(data.artist, data.album).then((a) => { if (a && a.art) macHiRes[ak] = a.art; }).catch(() => {}); }
    if (macHiRes[ak]) data.art = macHiRes[ak];
  }
  macCache = { t: Date.now(), data };
  return data;
}
const macHiRes = {};
async function macCmd(c, v) {
  if (c === 'toggle') { const m = parseJson(await run(MC, ['get'])) || {}; return run(MC, [m.playing ? 'pause' : 'play']); }
  if (c === 'play' || c === 'resume') return run(MC, ['play']);
  if (c === 'pause') return run(MC, ['pause']);
  if (c === 'stop') return run(MC, ['stop']);
  if (c === 'next') return run(MC, ['next-track']);
  if (c === 'prev') return run(MC, ['previous-track']);
  if (c === 'seek') return run(MC, ['seek', String(Math.max(0, parseInt(v, 10) || 0))]);
  if (c === 'vol') { macVol = { t: Date.now(), v: Math.max(0, Math.min(100, parseInt(v, 10) || 0)) }; return run('/usr/bin/osascript', ['-e', 'set volume output volume ' + macVol.v]); }
  if (c === 'mute') return run('/usr/bin/osascript', ['-e', 'set volume ' + (v === '1' || v === 'true' ? 'with' : 'without') + ' output muted']);
  throw new Error('Ukendt kommando: ' + c);
}
async function macPlayTidal(kind, id, index) {
  if (!/^[\w-]+$/.test(String(id))) throw new Error('Ugyldigt Tidal-id');
  await run('/usr/bin/open', ['tidal://' + (kind === 'playlist' ? 'playlist' : 'album') + '/' + id + '?play=true']);
  macCache.t = 0;
  const n = Math.max(1, parseInt(index, 10) || 1);
  if (n > 1) {   // TIDAL-appen kan ikke starte på et bestemt nummer via link → start albummet og spring frem
    let first = '';
    for (let i = 0; i < 20; i++) { await sleep(400); const m = parseJson(await run(MC, ['get'])) || {}; if (m.playing && m.title) { first = m.title; break; } }
    for (let i = 1; i < n; i++) { await run(MC, ['next-track']); await sleep(350); }
  }
  macCache.t = 0;
  return { ok: true, device: 'mac' };
}

// ---------- Samlet status: vis/styr den kilde der spiller (WiiM eller TIDAL på Mac'en) ----------
// Aktiv enhed = den der spiller; spiller ingen, så den der sidst spillede. Huskes på disk, så en genstart ikke skifter enhed.
let activeDev = (function () { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.wiim-bro.json'), 'utf8')).activeDev || 'wiim'; } catch (e) { return 'wiim'; } })();
let allCache = { t: 0, data: null };
function setActive(d) {
  if (d === activeDev) return; activeDev = d;
  try { const f = path.join(os.homedir(), '.wiim-bro.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8')); c.activeDev = d; fs.writeFileSync(f, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch (e) { /* */ }
}
async function getStatus() {
  if (Date.now() - allCache.t < 800 && allCache.data) return allCache.data;
  const [w, m] = await Promise.all([getWiimStatus().catch((e) => ({ error: e.message })), getMacStatus().catch(() => null)]);
  const wOk = w && !w.error, wPlay = wOk && w.playing, mPlay = m && m.playing;
  if (mPlay && (!wPlay || /airplay/i.test(w.source || ''))) setActive('mac');
  else if (wPlay) setActive('wiim');
  let data = activeDev === 'mac' && m ? m : (wOk ? Object.assign({ device: 'wiim' }, w) : (m || null));
  if (!data) throw new Error(w && w.error || 'Ingen afspiller svarer');
  data = Object.assign({}, data, { devices: { wiim: wOk, mac: !!m } });
  allCache = { t: Date.now(), data };
  return data;
}

const CMDS = {
  play: 'setPlayerCmd:resume', resume: 'setPlayerCmd:resume', pause: 'setPlayerCmd:pause', toggle: 'setPlayerCmd:onepause',
  stop: 'setPlayerCmd:stop', next: 'setPlayerCmd:next', prev: 'setPlayerCmd:prev'
};
async function runCmd(c, v) {
  await getStatus().catch(() => {});
  if (activeDev === 'mac' && MC) { const r = await macCmd(c, v); macCache.t = 0; allCache.t = 0; return String(r).trim(); }
  let cmd = CMDS[c];
  if (c === 'vol') cmd = 'setPlayerCmd:vol:' + Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  if (c === 'mute') cmd = 'setPlayerCmd:mute:' + (v === '1' || v === 'true' ? 1 : 0);
  if (c === 'seek') cmd = 'setPlayerCmd:seek:' + Math.max(0, parseInt(v, 10) || 0);
  if (c === 'playurl' && v) cmd = 'setPlayerCmd:play:' + v;
  if (!cmd) throw new Error('Ukendt kommando: ' + c);
  const r = await wiim(cmd);
  statusCache.t = 0; allCache.t = 0;
  return r.trim();
}

// ---------- WiiM PlayQueue (UPnP) — afspil Tidal-albums direkte ----------
// WiiM'en er selv logget ind på Tidal. Giver man den en kø med et Tidal-album-link, henter den numrene selv.
const UPNP_PORT = parseInt(arg('upnp-port', '49152'), 10);
function xmlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
function xmlUnesc(s) { return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function tag(s, t) { const m = String(s).match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')); return m ? m[1] : ''; }
function playQueue(action, inner) {
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    '<u:' + action + ' xmlns:u="urn:schemas-wiimu-com:service:PlayQueue:1">' + inner + '</u:' + action + '></s:Body></s:Envelope>';
  return new Promise((resolve, reject) => {
    const req = http.request({ host: WIIM_IP, port: UPNP_PORT, path: '/upnp/control/PlayQueue1', method: 'POST', timeout: 8000,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPACTION': '"urn:schemas-wiimu-com:service:PlayQueue:1#' + action + '"', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => d += c);
      res.on('end', () => { if (res.statusCode >= 400) return reject(new Error('WiiM kø-fejl: ' + (tag(d, 'errorDescription') || res.statusCode))); resolve(d); });
    });
    req.on('timeout', () => req.destroy(new Error('WiiM svarer ikke (kø)')));
    req.on('error', reject); req.end(body);
  });
}
async function playTidal(kind, id, name, artist, index) {
  if (!/^[\w-]+$/.test(String(id))) throw new Error('Ugyldigt Tidal-id');
  lastStarted = { album: name || '', artist: artist || '', id: kind === 'album' ? String(id) : '' };
  const url = kind === 'playlist'
    ? 'https://api.tidal.com/v1/playlists/' + id + '/items?order=INDEX&orderDirection=ASC&countryCode=DK&offset=0&limit=50'
    : 'https://api.tidal.com/v1/albums/' + id + '/tracks?countryCode=DK&limit=50&offset=0';
  const ts = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const qname = String(name || 'Vinyl').replace(/[<>&_#~]/g, ' ').trim().slice(0, 60) + '_#~' + ts;
  const ctx = '<?xml version="1.0"?><PlayList><ListName>' + xmlEsc(qname) + '</ListName><ListInfo><SourceName>Tidal</SourceName>' +
    '<SearchUrl>' + xmlEsc(url) + '</SearchUrl><TrackNumber>0</TrackNumber></ListInfo><Tracks></Tracks></PlayList>';
  await playQueue('CreateQueue', '<QueueContext>' + xmlEsc(ctx) + '</QueueContext>');
  await playQueue('PlayQueueWithIndex', '<QueueName>' + xmlEsc(qname) + '</QueueName><Index>' + Math.max(1, parseInt(index, 10) || 1) + '</Index>');
  statusCache.t = 0; recentCache.t = 0;
  return { ok: true, queue: qname };
}
async function playQueueByName(name) {
  await playQueue('PlayQueueWithIndex', '<QueueName>' + xmlEsc(name) + '</QueueName><Index>1</Index>');
  statusCache.t = 0; return { ok: true };
}
// Senest spillede Tidal-albums/playlister på WiiM'en (dens egne gemte køer) — med cover fra første nummer
let recentCache = { t: 0, data: null }; const queueInfo = {};
async function recentQueues() {
  if (Date.now() - recentCache.t < 60000 && recentCache.data) return recentCache.data;
  const raw = xmlUnesc(tag(await playQueue('BrowseQueue', '<QueueName>TotalQueue</QueueName>'), 'QueueContext'));
  const lists = [];
  raw.replace(/<List\d+>([\s\S]*?)<\/List\d+>/g, (m, inner) => {
    const name = xmlUnesc(tag(inner, 'Name')); const url = xmlUnesc(tag(inner, 'SearchUrl'));
    const when = (name.split('_#~')[1] || '');
    lists.push({ name, title: name.split('_#~')[0], source: tag(inner, 'Source'), url, when: /^\d{4}-/.test(when) ? when : '' });
  });
  lists.forEach((l) => { const m = l.url.match(/\/v1\/albums\/(\d+)\//); l.albumId = m ? m[1] : ''; l.kind = m ? 'album' : (/\/playlists\//.test(l.url) ? 'playlist' : 'other'); });
  // Cover + kunstner: fra Tidal-API hvis nøgle, ellers et gæt via iTunes på titlen
  const need = lists.filter((l) => l.albumId && (!queueInfo[l.name] || (queueInfo[l.name].guess && loadConf().tidalId)));
  if (need.length) {
    try {
      const al = await tidalAlbums(need.map((l) => l.albumId));
      al.forEach((a) => need.filter((l) => l.albumId === a.id).forEach((l) => { queueInfo[l.name] = { art: a.art, artist: a.artist, album: a.album, year: a.year }; }));
    } catch (e) {
      await Promise.all(need.map(async (l) => {
        try {
          const r = await httpsReq('https://itunes.apple.com/search?entity=album&limit=1&country=dk&term=' + encodeURIComponent(l.title), { method: 'GET' });
          const x = ((parseJson(r.body) || {}).results || [])[0];
          if (x) queueInfo[l.name] = { art: (x.artworkUrl100 || '').replace(/100x100bb/, '600x600bb'), artist: x.artistName, album: l.title, guess: true };
        } catch (e2) { /* spring over */ }
      }));
    }
  }
  lists.forEach((l) => { Object.assign(l, queueInfo[l.name] || { album: l.title }); const pm = l.url.match(/\/v1\/playlists\/([\w-]+)\//); l.playlistId = pm ? pm[1] : ''; });
  lists.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  // Egen historik først (det der faktisk er spillet), derefter WiiM'ens gamle gemte køer
  const seen = {}; const out = [];
  history.concat(lists.map((l) => ({ album: l.album || l.title, artist: l.artist || '', art: l.art || '', id: l.albumId || '', playlistId: l.playlistId || '', kind: l.kind, when: l.when })))
    .forEach((h) => { const k = norm(h.album) + '|' + norm(h.artist); if (!h.album || seen[k]) return; seen[k] = 1; out.push(h); });
  recentCache = { t: Date.now(), data: out };
  return out;
}

// ---------- Egen historik: hvad har WiiM'en spillet (uanset hvorfra det er startet) ----------
const HIST_FILE = path.join(os.homedir(), '.wiim-bro-history.json');
let history = []; try { history = JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')) || []; } catch (e) { history = []; }
function saveHistory() { try { fs.writeFileSync(HIST_FILE, JSON.stringify(history.slice(0, 60))); } catch (e) { /* ignorér */ } }
function noteHistory(s) {
  if (!s || !s.playing || !s.album) return;
  const k = norm(s.album) + '|' + norm(s.artist);
  const old = history.find((h) => norm(h.album) + '|' + norm(h.artist) === k || (!s.artist && norm(h.album) === norm(s.album)));
  if (old && history[0] === old) { if (!old.art && s.art) { old.art = s.art; saveHistory(); } if (!old.artist && s.artist) { old.artist = s.artist; saveHistory(); } return; }
  const e = old || { album: s.album, artist: s.artist || '', art: s.art || '', id: '' };
  if (!e.id && lastStarted.id && norm(lastStarted.album) === norm(s.album)) e.id = lastStarted.id;
  if (!e.art && s.art) e.art = s.art; if (!e.artist && s.artist) e.artist = s.artist;
  const d = new Date(); e.when = new Date(d - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
  history = [e].concat(history.filter((h) => h !== e)).slice(0, 60);
  recentCache.t = 0; saveHistory();
}
setInterval(() => { getStatus().then(noteHistory).catch(() => {}); }, 15000);

// ---------- TIDAL-katalog (officielt API, developer.tidal.com) ----------
// Nøgler gemmes lokalt i ~/.wiim-bro.json — aldrig i git.
const CONF_FILE = path.join(os.homedir(), '.wiim-bro.json');
function loadConf() { try { return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch (e) { return {}; } }
function saveConf(c) { fs.writeFileSync(CONF_FILE, JSON.stringify(c, null, 2), { mode: 0o600 }); }
let tidalTok = { tok: '', exp: 0 };
function httpsReq(url, opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, Object.assign({ timeout: 10000 }, opts), (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => d += c); res.on('end', () => resolve({ code: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('timeout', () => req.destroy(new Error('Tidal svarer ikke'))); req.on('error', reject); req.end(body || undefined);
  });
}
// Tidal-kald med pause og nyt forsøg ved 429 (for mange forespørgsler)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tidalGate = Promise.resolve();
function tidalReq(url, headers) {
  const run = async () => {
    for (let i = 0; i < 4; i++) {
      const r = await httpsReq(url, { method: 'GET', headers });
      if (r.code !== 429) { await sleep(120); return r; }
      const ra = parseFloat((r.headers || {})['retry-after']) || (1.5 * (i + 1));
      await sleep(Math.min(10, ra) * 1000);
    }
    return { code: 429, body: 'Tidal: for mange forespørgsler — prøv igen om lidt' };
  };
  const p = tidalGate.then(run, run); tidalGate = p.catch(() => {}); return p;
}
async function tidalToken() {
  const c = loadConf();
  if (!c.tidalId || !c.tidalSecret) { const e = new Error('Tidal-nøgle mangler'); e.code = 'NOKEY'; throw e; }
  if (tidalTok.tok && Date.now() < tidalTok.exp) return tidalTok.tok;
  const r = await httpsReq('https://auth.tidal.com/v1/oauth2/token', { method: 'POST', headers: {
    'Authorization': 'Basic ' + Buffer.from(c.tidalId + ':' + c.tidalSecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' } }, 'grant_type=client_credentials');
  const j = parseJson(r.body) || {};
  if (!j.access_token) throw new Error('Tidal afviste nøglen (' + r.code + ')');
  tidalTok = { tok: j.access_token, exp: Date.now() + ((j.expires_in || 3600) - 120) * 1000 };
  return tidalTok.tok;
}
async function tidalGet(p) {
  const tok = await tidalToken();
  const r = await tidalReq('https://openapi.tidal.com/v2' + p, { 'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.api+json' });
  if (r.code === 401) tidalTok.tok = '';
  if (r.code >= 400) throw new Error('Tidal ' + r.code + ': ' + r.body.slice(0, 160));
  return parseJson(r.body) || {};
}
// Hent album-detaljer (titel, kunstner, cover) for en liste id'er
async function tidalAlbums(ids) {
  if (!ids.length) return [];
  const j = await tidalGet('/albums?countryCode=DK&include=artists,coverArt&' + ids.slice(0, 20).map((i) => 'filter%5Bid%5D=' + encodeURIComponent(i)).join('&'));
  const inc = {}; (j.included || []).forEach((x) => { inc[x.type + ':' + x.id] = x; });
  const byId = {};
  (j.data || []).forEach((a) => {
    const at = a.attributes || {}, rel = a.relationships || {};
    const artists = ((rel.artists || {}).data || []).map((r) => ((inc['artists:' + r.id] || {}).attributes || {}).name).filter(Boolean);
    const cov = ((rel.coverArt || {}).data || [])[0];
    const files = cov ? (((inc['artworks:' + cov.id] || {}).attributes || {}).files || []) : [];
    files.sort((x, y) => ((x.meta || {}).width || 0) - ((y.meta || {}).width || 0));
    const f = files.find((x) => ((x.meta || {}).width || 0) >= 600) || files[files.length - 1];
    byId[a.id] = { id: a.id, album: at.title || '', artist: artists.join(', '), year: (at.releaseDate || '').slice(0, 4), art: f ? f.href : '', tracks: at.numberOfItems || 0 };
  });
  return ids.map((i) => byId[i]).filter(Boolean);
}
const searchCache = {};
async function tidalSearch(q, limit) {
  const key = q.toLowerCase().trim(); if (!key) return [];
  if (searchCache[key] && Date.now() - searchCache[key].t < 3600000) return searchCache[key].data;
  const j = await tidalGet('/searchResults?filter%5Bquery%5D=' + encodeURIComponent(key) + '&countryCode=DK&explicitFilter=INCLUDE&include=albums');
  const sr = Array.isArray(j.data) ? j.data[0] : j.data;
  const ids = ((((sr || {}).relationships || {}).albums || {}).data || []).map((d) => d.id).slice(0, limit || 20);
  const data = await tidalAlbums(ids);
  searchCache[key] = { t: Date.now(), data };
  return data;
}
function norm(s) { return String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|deluxe|remaster(ed)?|edition|expanded|anniversary|\d{4}/g, '').replace(/[^a-z0-9æøå]+/g, ' ').trim(); }
async function tidalFind(artist, album) {
  const res = await tidalSearch(artist + ' ' + album, 10);
  const na = norm(artist), nb = norm(album);
  const score = (r) => (norm(r.album) === nb ? 4 : (norm(r.album).includes(nb) || nb.includes(norm(r.album)) ? 2 : 0)) + (norm(r.artist).includes(na) || na.includes(norm(r.artist)) ? 3 : 0);
  const best = res.slice().sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 3 ? best : null;
}
// Nummerliste for et album
const albumCache = {};
function isoDur(s) { const m = String(s || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + Math.round(+(m[3] || 0)) : 0; }
async function tidalAlbumFull(id) {
  if (albumCache[id] && Date.now() - albumCache[id].t < 86400000) return albumCache[id].data;
  const info = (await tidalAlbums([String(id)]))[0] || { id: String(id) };
  let p = '/albums/' + encodeURIComponent(id) + '/relationships/items?countryCode=DK&include=items', items = [], guard = 0;
  while (p && guard++ < 10) {
    const j = await tidalGet(p);
    const inc = {}; (j.included || []).forEach((x) => { inc[x.type + ':' + x.id] = x; });
    (j.data || []).forEach((d) => {
      const a = ((inc[d.type + ':' + d.id] || {}).attributes) || {};
      items.push({ id: d.id, type: d.type, vol: (d.meta || {}).volumeNumber || 1, n: (d.meta || {}).trackNumber || 0, title: a.title + (a.version ? ' (' + a.version + ')' : ''), dur: isoDur(a.duration) });
    });
    const nx = (j.links || {}).next; p = nx ? nx.replace(/^https?:\/\/[^/]+\/v2/, '') : '';
  }
  items.sort((a, b) => (a.vol - b.vol) || (a.n - b.n));
  items.forEach((t, i) => { t.index = i + 1; });   // position i WiiM-køen
  const data = Object.assign({}, info, { tracks: items, vols: Math.max(1, ...items.map((t) => t.vol)) });
  albumCache[id] = { t: Date.now(), data };
  return data;
}

// ---------- Tidal-login (til dine favoritter) — OAuth med PKCE, refresh-token gemmes i ~/.wiim-bro.json ----------
const REDIRECT = 'http://localhost:' + PORT + '/tidal/callback';
let pkce = null, userTok = { tok: '', exp: 0 };
function b64url(b) { return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function loginUrl() {
  const c = loadConf(); if (!c.tidalId) throw new Error('Tidal-nøgle mangler');
  const verifier = b64url(require('crypto').randomBytes(48));
  const challenge = b64url(require('crypto').createHash('sha256').update(verifier).digest());
  pkce = { verifier, state: b64url(require('crypto').randomBytes(12)) };
  return 'https://login.tidal.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: c.tidalId, redirect_uri: REDIRECT, scope: 'collection.read user.read', code_challenge_method: 'S256', code_challenge: challenge, state: pkce.state }).toString();
}
async function userTokenReq(params) {
  const c = loadConf();
  const r = await httpsReq('https://auth.tidal.com/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    new URLSearchParams(Object.assign({ client_id: c.tidalId }, params)).toString());
  const j = parseJson(r.body) || {};
  if (!j.access_token) throw new Error('Tidal-login fejlede (' + r.code + ': ' + (j.error_description || j.error || r.body.slice(0, 120)) + ')');
  userTok = { tok: j.access_token, exp: Date.now() + ((j.expires_in || 3600) - 120) * 1000 };
  if (j.refresh_token) { const c2 = loadConf(); c2.tidalRefresh = j.refresh_token; if (j.user_id) c2.tidalUser = String(j.user_id); saveConf(c2); }
  return userTok.tok;
}
async function userToken() {
  if (userTok.tok && Date.now() < userTok.exp) return userTok.tok;
  const c = loadConf(); if (!c.tidalRefresh) { const e = new Error('Ikke logget ind på Tidal'); e.code = 'NOLOGIN'; throw e; }
  return userTokenReq({ grant_type: 'refresh_token', refresh_token: c.tidalRefresh });
}
let favCache = { t: 0, data: null };
async function tidalFavorites() {
  if (favCache.data && Date.now() - favCache.t < 600000) return favCache.data;
  const tok = await userToken();
  let p = '/userCollectionAlbums/me/relationships/items?countryCode=DK&locale=da-DK&sort=-addedAt', ids = [], guard = 0;
  while (p && guard++ < 8 && ids.length < 160) {
    const r = await tidalReq('https://openapi.tidal.com/v2' + p, { 'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.api+json' });
    if (r.code === 401) { userTok.tok = ''; }
    if (r.code >= 400) throw new Error('Tidal favoritter ' + r.code + ': ' + r.body.slice(0, 160));
    const j = parseJson(r.body) || {};
    (j.data || []).forEach((d) => { if (d.type === 'albums') ids.push(d.id); });
    const nx = (j.links || {}).next; p = nx ? nx.replace(/^https?:\/\/[^/]+\/v2/, '') : '';
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 20) out.push(...await tidalAlbums(ids.slice(i, i + 20)));
  favCache = { t: Date.now(), data: out };
  return out;
}

function pickDev(u) { const d = u.searchParams.get('dev') || 'auto'; return d === 'mac' && MC ? 'mac' : d === 'wiim' ? 'wiim' : (activeDev === 'mac' && MC ? 'mac' : 'wiim'); }
function readBody(req) { return new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e4) req.destroy(); }); req.on('end', () => resolve(d)); }); }

// ---------- HTTP-server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', '*'); }
function json(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

const seenRef = {};
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const who = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!/^127\.|^::1$/.test(who) && (!/^\/(wiim\/status|img)/.test(u.pathname) || !seenRef[who + (req.headers.referer || '')])) {
    seenRef[who + (req.headers.referer || '')] = 1;
    console.log(new Date().toISOString().slice(11, 19) + ' ' + who + ' ' + req.method + ' ' + req.url.slice(0, 80) + ' ← ' + (req.headers.referer || '-') + ' | ' + (req.headers['user-agent'] || '').slice(0, 60));
  }
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  try {
    if (u.pathname === '/wiim/status') return json(res, 200, await getStatus());
    if (u.pathname === '/wiim/cmd') { const r = await runCmd(u.searchParams.get('c'), u.searchParams.get('v')); return json(res, 200, { ok: true, raw: r }); }
    if (u.pathname === '/wiim/raw') { const c = u.searchParams.get('command') || ''; const r = await wiim(c); cors(res); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(r); }
    if (u.pathname === '/mac/art') { if (!macArt.buf) { res.writeHead(404); return res.end(); } cors(res); res.writeHead(200, { 'Content-Type': macArt.mime, 'Cache-Control': 'max-age=3600' }); return res.end(macArt.buf); }
    if (u.pathname === '/wiim/ping') return json(res, 200, { ok: true, wiim: WIIM_NAME + ' (' + WIIM_IP + ')', root: ROOT, host: os.hostname(), tidal: !!loadConf().tidalId, v: 2 });
    // Hylden
    if (u.pathname === '/wiim/recent') return json(res, 200, await recentQueues());
    if (u.pathname === '/wiim/playqueue') return json(res, 200, await playQueueByName(u.searchParams.get('name') || ''));
    if (u.pathname === '/wiim/playtidal') { if (pickDev(u) === 'mac') { setActive('mac'); return json(res, 200, await macPlayTidal(u.searchParams.get('kind') || 'album', u.searchParams.get('id') || '', u.searchParams.get('index') || 1)); } setActive('wiim'); } if (u.pathname === '/wiim/playtidal') return json(res, 200, await playTidal(u.searchParams.get('kind') || 'album', u.searchParams.get('id') || '', u.searchParams.get('name') || '', u.searchParams.get('artist') || '', u.searchParams.get('index') || 1));
    if (u.pathname === '/wiim/playfind') { // find albummet på Tidal ud fra kunstner + titel, og spil det
      const a = await tidalFind(u.searchParams.get('artist') || '', u.searchParams.get('album') || '');
      if (!a) return json(res, 404, { error: 'Fandt ikke albummet på Tidal' });
      if (pickDev(u) === 'mac') { setActive('mac'); await macPlayTidal('album', a.id, 1); } else { setActive('wiim'); await playTidal('album', a.id, a.album, a.artist); }
      const h = history.find((x) => norm(x.album) === norm(a.album)); if (h && !h.id) { h.id = a.id; saveHistory(); }
      return json(res, 200, { ok: true, album: a });
    }
    if (u.pathname === '/img') { // samme-oprindelse-proxy for covers, så siden kan aflæse farverne
      const src = u.searchParams.get('u') || '';
      if (/^\/mac\/art/.test(src)) { if (!macArt.buf) { res.writeHead(404); return res.end(); } cors(res); res.writeHead(200, { 'Content-Type': macArt.mime }); return res.end(macArt.buf); }
      let h = ''; try { h = new URL(src).hostname; } catch (e) { /* */ }
      if (!/^https:/.test(src) || !/(^|\.)(tidal\.com|mzstatic\.com|last\.fm|fastly\.net|akamaized\.net)$/.test(h)) { res.writeHead(400); return res.end(); }
      return https.get(src, { timeout: 8000 }, (r) => { cors(res); res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'max-age=86400' }); r.pipe(res); })
        .on('error', () => { res.writeHead(502); res.end(); });
    }
    if (u.pathname === '/tidal/album') return json(res, 200, await tidalAlbumFull(u.searchParams.get('id') || ''));
    if (u.pathname === '/tidal/find') { const a = await tidalFind(u.searchParams.get('artist') || '', u.searchParams.get('album') || ''); return a ? json(res, 200, a) : json(res, 404, { error: 'Fandt ikke albummet på Tidal' }); }
    if (u.pathname === '/tidal/favorites') { try { return json(res, 200, await tidalFavorites()); } catch (e) { return json(res, e.code === 'NOLOGIN' ? 401 : 502, { error: e.message, code: e.code || '' }); } }
    if (u.pathname === '/tidal/login') { res.writeHead(302, { Location: loginUrl() }); return res.end(); }
    if (u.pathname === '/tidal/logout') { const c = loadConf(); delete c.tidalRefresh; delete c.tidalUser; saveConf(c); userTok = { tok: '', exp: 0 }; favCache = { t: 0, data: null }; return json(res, 200, { ok: true }); }
    if (u.pathname === '/tidal/callback') {
      const page = (msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<body style="background:#0d0d11;color:#eee;font:bold 18px Tahoma;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center">' + msg + '</body>'); };
      if (!pkce || u.searchParams.get('state') !== pkce.state) return page('Login-forsøget er udløbet — prøv igen fra Vinyl.');
      if (u.searchParams.get('error')) return page('Tidal afviste: ' + xmlEsc(u.searchParams.get('error_description') || u.searchParams.get('error')));
      try { await userTokenReq({ grant_type: 'authorization_code', code: u.searchParams.get('code') || '', redirect_uri: REDIRECT, code_verifier: pkce.verifier }); pkce = null; favCache = { t: 0, data: null };
        return page('Logget ind på Tidal ✓<br><span style="font-size:14px;color:#999">Dine favoritter er nu i reolen. Du kan lukke dette vindue.</span>'); }
      catch (e) { return page(xmlEsc(e.message)); }
    }
    if (u.pathname === '/tidal/search') return json(res, 200, await tidalSearch(u.searchParams.get('q') || '', 24));
    if (u.pathname === '/tidal/status') { try { await tidalToken(); return json(res, 200, { ok: true, user: !!loadConf().tidalRefresh }); } catch (e) { return json(res, 200, { ok: false, error: e.message }); } }
    if (u.pathname === '/tidal/setup' && req.method === 'POST') {
      const b = parseJson(await readBody(req)) || {};
      const c = loadConf(); c.tidalId = String(b.id || '').trim(); c.tidalSecret = String(b.secret || '').trim(); saveConf(c); tidalTok = { tok: '', exp: 0 };
      try { await tidalToken(); return json(res, 200, { ok: true }); } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
    }
  } catch (e) { return json(res, e.code === 'NOKEY' ? 428 : 502, { error: e.message || String(e), code: e.code || '' }); }

  // statiske filer fra apps-mappen
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
  cors(res);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  const ips = [].concat(...Object.values(ifaces)).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('WiiM-bro kører. WiiM: ' + WIIM_BASE + ' · apps: ' + ROOT);
  console.log('Åbn på iPad:  http://' + os.hostname().replace(/\.local$/, '') + '.local:' + PORT + '/vinyl.html');
  ips.forEach((ip) => console.log('   eller:     http://' + ip + ':' + PORT + '/vinyl.html'));
  getStatus().then((s) => console.log('WiiM svarer: ' + s.status + (s.title ? ' · ' + s.artist + ' – ' + s.title : ''))).catch((e) => console.log('Kunne ikke nå WiiM: ' + e.message));
});
