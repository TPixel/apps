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
const WIIM_BASE = /^https?:\/\//.test(WIIM) ? WIIM : 'https://' + WIIM;

// ---------- WiiM-API ----------
function wiim(command) {
  return new Promise((resolve, reject) => {
    const url = WIIM_BASE + '/httpapi.asp?command=' + encodeURIComponent(command);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, timeout: 4000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(new Error('WiiM svarer ikke (timeout)')); });
    req.on('error', reject);
  });
}
function hex2utf8(h) {
  if (!h || !/^[0-9a-fA-F]+$/.test(h) || h.length % 2) return h || '';
  try { return Buffer.from(h, 'hex').toString('utf8'); } catch (e) { return h; }
}
function parseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

const MODES = { '0': 'Ingen', '1': 'AirPlay', '2': 'DLNA', '10': 'Netværk', '11': 'USB', '20': 'API', '31': 'Spotify', '32': 'Tidal', '36': 'Qobuz', '40': 'Line-in', '41': 'Bluetooth', '43': 'Optisk', '45': 'HDMI', '47': 'Phono', '99': 'Multiroom' };

let statusCache = { t: 0, data: null };
async function getStatus() {
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
  statusCache = { t: Date.now(), data };
  return data;
}

const CMDS = {
  play: 'setPlayerCmd:resume', resume: 'setPlayerCmd:resume', pause: 'setPlayerCmd:pause', toggle: 'setPlayerCmd:onepause',
  stop: 'setPlayerCmd:stop', next: 'setPlayerCmd:next', prev: 'setPlayerCmd:prev'
};
async function runCmd(c, v) {
  let cmd = CMDS[c];
  if (c === 'vol') cmd = 'setPlayerCmd:vol:' + Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  if (c === 'mute') cmd = 'setPlayerCmd:mute:' + (v === '1' || v === 'true' ? 1 : 0);
  if (c === 'seek') cmd = 'setPlayerCmd:seek:' + Math.max(0, parseInt(v, 10) || 0);
  if (c === 'playurl' && v) cmd = 'setPlayerCmd:play:' + v;
  if (!cmd) throw new Error('Ukendt kommando: ' + c);
  const r = await wiim(cmd);
  statusCache.t = 0;
  return r.trim();
}

// ---------- HTTP-server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', '*'); }
function json(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  try {
    if (u.pathname === '/wiim/status') return json(res, 200, await getStatus());
    if (u.pathname === '/wiim/cmd') { const r = await runCmd(u.searchParams.get('c'), u.searchParams.get('v')); return json(res, 200, { ok: true, raw: r }); }
    if (u.pathname === '/wiim/raw') { const c = u.searchParams.get('command') || ''; const r = await wiim(c); cors(res); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(r); }
    if (u.pathname === '/wiim/ping') return json(res, 200, { ok: true, wiim: WIIM_BASE, root: ROOT, host: os.hostname() });
  } catch (e) { return json(res, 502, { error: e.message || String(e) }); }

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
