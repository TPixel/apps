/* Reol — pladereol med plader på højkant (ryggen udad, coveret skråt) + pladespiller med tonearm og nummerliste.
   Bruges af vinyl.html (iPad) og mini.html (Vinyl Mini på Mac). Taler med wiim-bro.
   Reol.init({base:'http://mac:8787'}); Reol.open('recent'|'fav'|'more'|'search'); Reol.openNow(); Reol.close(); */
(function () {
  var B = '', root, shelf, items = [], focus = 0, target = 0, tab = 'recent', q = '', status = {}, tidal = { ok: false, user: false };
  var detail = null, dAlbum = null, pollT = null, opened = false, colorCache = {}, discAng = 0, discVel = 0, lastT = 0, req = 0, onCloseCb = null;
  function $(s, r) { return (r || root).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(p) { return fetch(B + p, { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || ('fejl ' + r.status)); e.status = r.status; throw e; } return j; }); }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9æøå]+/g, ' ').trim(); }
  function fmt(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  try { tab = localStorage.getItem('reol-tab') || 'recent'; } catch (e) { }

  var CSS = '\
.rl{position:fixed;inset:0;z-index:40;display:none;flex-direction:column;color:#fff;font-family:Tahoma,sans-serif;font-weight:bold;overflow:hidden;background:#3a1a22;-webkit-user-select:none;user-select:none}\
.rl.show{display:flex}\
.rl-bg{position:absolute;inset:-10%;background:center/cover no-repeat;filter:blur(60px) saturate(1.3) brightness(.55);transform:scale(1.2);transition:background-image .6s;z-index:0}\
.rl-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.45))}\
.rl>*:not(.rl-bg){position:relative;z-index:1}\
.rl.det .rl-tabs,.rl.det .rl-x{visibility:hidden}\
.rl-top{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 12px 6px;justify-content:center}\
.rl-top .rl-x,.rl-top .rl-nowb{position:absolute;top:calc(8px + env(safe-area-inset-top));width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:15px;cursor:pointer}\
.rl-x{left:12px}.rl-nowb{right:12px}\
.rl-tabs{display:flex;gap:4px;padding:3px;border-radius:20px;background:rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);max-width:calc(100% - 100px);overflow-x:auto;scrollbar-width:none}\
.rl-tabs::-webkit-scrollbar{display:none}\
.rl-tabs button{border:none;background:none;color:#fff;font:inherit;font-size:12px;padding:6px 12px;border-radius:16px;cursor:pointer;white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto}\
.rl-tabs button.on{background:#fff;color:#222}\
.rl-tabs input{border:none;outline:none;background:rgba(255,255,255,.2);color:#fff;font:inherit;font-size:13px;padding:6px 12px;border-radius:16px;width:150px;-webkit-user-select:text;user-select:text}\
.rl-tabs input::placeholder{color:rgba(255,255,255,.7)}\
.rl-stage{flex:1;min-height:0;position:relative;perspective:calc(var(--W) * 3.2);perspective-origin:50% 45%;touch-action:pan-y;cursor:grab}\
.rl-stage:active{cursor:grabbing}\
.rl-alb{position:absolute;left:50%;top:50%;width:var(--W);height:var(--W);margin:calc(var(--W) / -2) 0 0 calc(var(--W) / -2);transform-style:preserve-3d;cursor:pointer;will-change:transform}\
.rl-f{position:absolute;inset:0;background:#2a2a30 center/cover no-repeat;transform:translateZ(calc(var(--T) / 2));-webkit-backface-visibility:hidden;backface-visibility:hidden;display:flex;align-items:flex-end;padding:8%;font-size:calc(var(--W) * .07);line-height:1.15;color:#ddd}\
.rl-f::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.1),transparent 30%,rgba(0,0,0,.12))}\
.rl-bk{position:absolute;inset:0;background:#18181c;transform:rotateY(180deg) translateZ(calc(var(--T) / 2))}\
.rl-sp{position:absolute;top:0;width:var(--T);height:100%;left:calc(50% - var(--T) / 2);display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--sc,#444);color:var(--st,#fff)}\
.rl-spl{transform:translateX(calc(var(--W) / -2)) rotateY(-90deg)}\
.rl-spr{transform:translateX(calc(var(--W) / 2)) rotateY(90deg)}\
.rl-sp span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:calc(var(--T) * .46);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:92%;letter-spacing:.3px}\
.rl-sp i{font-style:normal;font-weight:normal;opacity:.85;margin-top:.5em}\
.rl-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:5;background:none;border:none;color:rgba(255,255,255,.8);font-size:44px;font-weight:200;cursor:pointer;padding:10px}\
.rl-prev{left:4px}.rl-next{right:4px}\
.rl-cap{text-align:center;padding:4px 16px calc(14px + env(safe-area-inset-bottom));min-height:56px}\
.rl-cap .t{font-size:clamp(14px,2.2vw,22px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.rl-cap .a{font-size:clamp(11px,1.5vw,15px);opacity:.75;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.rl-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;font-size:14px;opacity:.85;text-align:center;padding:20px;font-weight:normal}\
.rl-msg button{border:none;background:#fff;color:#222;font:inherit;font-weight:bold;padding:10px 18px;border-radius:20px;cursor:pointer}\
/* Album-visning: pladespiller */\
.rl-det{position:absolute!important;inset:0;z-index:6!important;display:none;flex-direction:column;overflow-y:auto;padding:calc(52px + env(safe-area-inset-top)) 16px 20px}\
.rl-det.show{display:flex}\
.rl-det .rl-back{position:absolute;top:calc(8px + env(safe-area-inset-top));left:12px;border:none;background:rgba(255,255,255,.18);color:#fff;font:inherit;font-size:13px;padding:8px 14px;border-radius:18px;cursor:pointer}\
.rl-deck{display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap;margin:auto 0}\
.rl-tt{position:relative;width:calc(var(--H) * 1.62);height:var(--H);flex:0 0 auto}\
.rl-cov{position:absolute;left:0;top:0;width:var(--H);height:var(--H);background:#2a2a30 center/cover no-repeat;border-radius:3px;box-shadow:0 18px 40px rgba(0,0,0,.45);z-index:3}\
.rl-disc{position:absolute;top:calc(var(--H) * .03);left:calc(var(--H) * .52);width:calc(var(--H) * .94);height:calc(var(--H) * .94);border-radius:50%;z-index:2;transition:left .8s cubic-bezier(.2,.8,.2,1);\
  background:radial-gradient(circle at 50% 50%,transparent 0 31%,rgba(255,255,255,.08) 31.3% 31.6%,transparent 32%),repeating-radial-gradient(circle at 50% 50%,var(--v1) 0,var(--v1) 1.5px,var(--v2) 1.5px,var(--v2) 2.6px),var(--v1);\
  box-shadow:0 10px 30px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.08)}\
.rl-disc::after{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -20deg,transparent 0deg,rgba(255,255,255,.14) 25deg,transparent 55deg,transparent 180deg,rgba(255,255,255,.1) 208deg,transparent 238deg)}\
.rl-tt.out .rl-disc{left:calc(var(--H) * .64)}\
.rl-lbl{position:absolute;left:50%;top:50%;width:36%;height:36%;transform:translate(-50%,-50%);border-radius:50%;background:var(--lc,#ddd) center/cover no-repeat;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden}\
.rl-lbl span{font-size:calc(var(--H) * .032);color:var(--lt,#222);padding:0 12%;line-height:1.15;writing-mode:vertical-rl;max-height:80%;overflow:hidden}\
.rl-lbl::after{content:"";position:absolute;left:50%;top:50%;width:7%;height:7%;transform:translate(-50%,-50%);border-radius:50%;background:#111}\
.rl-arm{position:absolute;right:calc(var(--H) * -.02);top:calc(var(--H) * .02);width:calc(var(--H) * .36);height:calc(var(--H) * .92);z-index:4;pointer-events:none;overflow:visible}\
.rl-arm g.swing{transform-origin:78px 60px;transform:rotate(-4deg);transition:transform 2s cubic-bezier(.4,.1,.2,1)}\
.rl-info{flex:1 1 280px;max-width:520px;min-width:240px}\
.rl-info .t{font-size:clamp(18px,2.6vw,30px);line-height:1.1}\
.rl-info .a{font-size:clamp(13px,1.7vw,18px);opacity:.8;margin-top:4px}\
.rl-info .y{font-size:12px;opacity:.6;margin-top:3px;font-weight:normal}\
.rl-play{margin:12px 0 8px;border:none;background:#fff;color:#222;font:inherit;font-size:14px;padding:9px 20px;border-radius:20px;cursor:pointer}\
.rl-trk{list-style:none;margin:6px 0 0;padding:0;max-height:none}\
.rl-trk li{display:flex;gap:10px;align-items:center;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13px}\
.rl-trk li:hover{background:rgba(255,255,255,.1)}\
.rl-trk li .n{width:22px;text-align:right;opacity:.55;font-variant-numeric:tabular-nums}\
.rl-trk li .tt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.rl-trk li .d{opacity:.55;font-weight:normal;font-variant-numeric:tabular-nums}\
.rl-trk li.cur{background:#fff;color:#151515;box-shadow:0 4px 16px rgba(0,0,0,.25)}\
.rl-trk li.cur .d{opacity:.7}\
.rl-trk li.cur .n{opacity:1;color:#E8820A}\
.rl-eq{display:inline-flex;align-items:flex-end;gap:2px;height:12px;width:22px;justify-content:flex-end}\
.rl-eq i{display:block;width:3px;background:#E8820A;border-radius:1px;animation:rleq .9s ease-in-out infinite}\
.rl-eq i:nth-child(2){animation-delay:-.3s}.rl-eq i:nth-child(3){animation-delay:-.6s}\
.rl-eq.paused i{animation:none;height:4px}\
@keyframes rleq{0%,100%{height:3px}50%{height:12px}}\
.rl-np{margin-top:10px;font-size:13px;color:#fff;background:rgba(232,130,10,.9);display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border-radius:14px;max-width:100%}\
.rl-np .rl-eq i{background:#fff}\
.rl-np span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.rl-np:empty{display:none}\
.rl-dev{display:inline-flex;gap:3px;padding:3px;border-radius:16px;background:rgba(255,255,255,.14);margin-left:8px;vertical-align:middle}\
.rl-dev button{border:none;background:none;color:#fff;font:inherit;font-size:12px;padding:5px 10px;border-radius:12px;cursor:pointer}\
.rl-dev button.on{background:#fff;color:#222}\
.rl-dev:empty{display:none}\
.rl-trk .vol{font-size:11px;opacity:.6;padding:10px 8px 2px;cursor:default}\
.rl-trk .vol:hover{background:none}\
.rl-toast{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:rgba(0,0,0,.75);padding:9px 16px;border-radius:12px;font-size:13px;z-index:9;opacity:0;transition:opacity .3s;pointer-events:none}\
.rl-toast.show{opacity:1}\
@media (max-width:640px){.rl-deck{gap:14px}.rl-info{min-width:0;flex-basis:100%}}\
';

  var ARM = '<svg class="rl-arm" viewBox="0 0 100 260" preserveAspectRatio="xMidYMin meet">' +
    '<circle cx="78" cy="60" r="34" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)"/>' +
    '<g class="swing">' +
    '<rect x="60" y="8" width="36" height="22" rx="4" fill="#1d1d20"/>' +
    '<circle cx="78" cy="60" r="11" fill="#2b2b2f" stroke="#555" stroke-width="2"/>' +
    '<path d="M78 60 L74 200 L52 232" fill="none" stroke="#d9d9de" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M78 60 L74 200 L52 232" fill="none" stroke="#9a9aa2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.5,0)"/>' +
    '<g transform="translate(52 232) rotate(32)"><rect x="-9" y="-6" width="18" height="26" rx="3" fill="#222"/><rect x="-5" y="18" width="10" height="7" rx="1.5" fill="#111"/></g>' +
    '</g></svg>';

  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.className = 'rl';
    root.innerHTML = '<div class="rl-bg"></div>' +
      '<div class="rl-top"><button class="rl-x" title="Luk (Esc)">✕</button><div class="rl-tabs"></div><button class="rl-nowb" title="Det der spiller nu">◉</button></div>' +
      '<div class="rl-stage"><button class="rl-arrow rl-prev">‹</button><button class="rl-arrow rl-next">›</button></div>' +
      '<div class="rl-cap"><div class="t"></div><div class="a"></div></div>' +
      '<div class="rl-det"><button class="rl-back">‹ Reol</button><div class="rl-deck">' +
        '<div class="rl-tt"><div class="rl-disc"><div class="rl-lbl"><span></span></div></div><div class="rl-cov"></div>' + ARM + '</div>' +
        '<div class="rl-info"><div class="t"></div><div class="a"></div><div class="y"></div><div class="rl-np"></div><br><button class="rl-play">▶ Afspil album</button><span class="rl-dev"></span><ul class="rl-trk"></ul></div>' +
      '</div></div><div class="rl-toast"></div>';
    document.body.appendChild(root);
    shelf = $('.rl-stage');
    $('.rl-x').onclick = close;
    $('.rl-nowb').onclick = openNow;
    $('.rl-back').onclick = function () { showDetail(false); };
    $('.rl-prev').onclick = function (e) { e.stopPropagation(); setTarget(Math.round(target) - 1); };
    $('.rl-next').onclick = function (e) { e.stopPropagation(); setTarget(Math.round(target) + 1); };
    $('.rl-play').onclick = function () { playAlbum(dAlbum, 1); };
    // Bladre: hjul/trackpad, træk med fingeren, piletaster
    var wheelT = null;
    shelf.addEventListener('wheel', function (e) { e.preventDefault(); var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; target = clampT(target + d / 90); clearTimeout(wheelT); wheelT = setTimeout(function () { setTarget(Math.round(target)); }, 140); }, { passive: false });
    var drag = null;
    shelf.addEventListener('pointerdown', function (e) { if (e.target.closest('.rl-arrow')) return; drag = { x: e.clientX, t: target, moved: false, id: e.pointerId }; });
    window.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true; target = clampT(drag.t - dx / (sz.T * 2.6)); });
    window.addEventListener('pointerup', function (e) {
      if (!drag) return; var d = drag; drag = null;
      if (d.moved) { setTarget(Math.round(target)); return; }
      var a = e.target.closest && e.target.closest('.rl-alb'); if (!a) return;
      var i = +a.dataset.i; if (i === Math.round(focus)) openAlbum(items[i]); else setTarget(i);
    });
    document.addEventListener('keydown', function (e) {
      if (!opened || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
      if (e.key === 'Escape') { if (detail) showDetail(false); else close(); e.stopPropagation(); }
      else if (!detail && e.key === 'ArrowLeft') { setTarget(Math.round(target) - 1); e.stopPropagation(); e.preventDefault(); }
      else if (!detail && e.key === 'ArrowRight') { setTarget(Math.round(target) + 1); e.stopPropagation(); e.preventDefault(); }
      else if (!detail && e.key === 'Enter') { openAlbum(items[Math.round(focus)]); }
    }, true);
    window.addEventListener('resize', sizeIt);
    requestAnimationFrame(frame);
  }

  // ---------- Størrelser ----------
  var sz = { W: 200, T: 20, H: 240 };
  function sizeIt() {
    var w = innerWidth, h = innerHeight;
    sz.W = Math.round(Math.max(110, Math.min(h * .5, w * .3)));
    sz.T = Math.round(Math.max(16, sz.W * .1));
    sz.H = Math.round(w >= 700 ? Math.min(h * .55, w * .5 / 1.62) : Math.min((w - 40) / 1.62, h * .42));
    root.style.setProperty('--W', sz.W + 'px'); root.style.setProperty('--T', sz.T + 'px'); root.style.setProperty('--H', sz.H + 'px');
  }

  // ---------- Reolen ----------
  function clampT(v) { return Math.max(-0.4, Math.min(items.length - 0.6, v)); }
  function setTarget(i) { target = Math.max(0, Math.min(items.length - 1, i)); }
  function frame(t) {
    var dt = lastT ? Math.min((t - lastT) / 1000, .1) : 0; lastT = t;
    if (opened && !detail && items.length) {
      var prev = focus; focus += (target - focus) * Math.min(1, dt * 9);
      if (Math.abs(target - focus) < .001) focus = target;
      if (focus !== prev || layoutDirty) layout();
    }
    if (detail) {   // pladen drejer kun når netop dette album spiller
      var on = isPlayingThis(); discVel += ((on ? 200 : 0) - discVel) * Math.min(1, dt * (on ? 1.4 : .8)); if (!on && discVel < .5) discVel = 0;
      discAng = (discAng + discVel * dt) % 360; $('.rl-disc').style.transform = 'rotate(' + discAng + 'deg)';
    }
    requestAnimationFrame(frame);
  }
  var layoutDirty = true, lastCap = -1;
  function layout() {
    layoutDirty = false;
    var W = sz.W, T = sz.T, els = shelf.querySelectorAll('.rl-alb');
    for (var k = 0; k < els.length; k++) {
      var el = els[k], i = +el.dataset.i, d = i - focus, ad = Math.abs(d);
      if (ad > 14) { el.style.display = 'none'; continue; } el.style.display = '';
      var c = Math.max(-1, Math.min(1, d));
      var x = ad <= 1 ? d * W * .6 : (d < 0 ? -1 : 1) * (W * .6 + (ad - 1) * T * 2.7);
      var rot = -c * 74, z = -Math.abs(c) * W * .42;
      el.style.transform = 'translateX(' + x.toFixed(1) + 'px) translateZ(' + z.toFixed(1) + 'px) rotateY(' + rot.toFixed(1) + 'deg)';
      el.style.zIndex = String(1000 - Math.round(ad * 10));
    }
    var fi = Math.round(focus);
    if (fi !== lastCap && items[fi]) { lastCap = fi; var a = items[fi]; $('.rl-cap .t').textContent = a.album || ''; $('.rl-cap .a').textContent = [a.artist, a.year].filter(Boolean).join(' · '); bg(a.art); }
  }
  function render() {
    shelf.querySelectorAll('.rl-alb,.rl-msg').forEach(function (n) { n.remove(); });
    lastCap = -1; $('.rl-cap .t').textContent = ''; $('.rl-cap .a').textContent = '';
    items.forEach(function (a, i) {
      var el = document.createElement('div'); el.className = 'rl-alb'; el.dataset.i = i;
      var sp = '<span>' + esc(a.album) + '<i> ' + esc(a.artist || '') + '</i></span>';
      el.innerHTML = '<div class="rl-bk"></div><div class="rl-sp rl-spl">' + sp + '</div><div class="rl-sp rl-spr">' + sp + '</div>' +
        '<div class="rl-f"' + (a.art ? ' style="background-image:url(\'' + esc(a.art) + '\')"' : '') + '>' + (a.art ? '' : esc(a.album)) + '</div>';
      shelf.appendChild(el);
      spineColor(a, el);
    });
    var cur = items.findIndex(function (a) { return status.album && norm(a.album) === norm(status.album); });
    focus = target = cur >= 0 ? cur : 0; layoutDirty = true; layout();
  }
  function msg(html) { shelf.querySelectorAll('.rl-alb,.rl-msg').forEach(function (n) { n.remove(); }); items = []; var m = document.createElement('div'); m.className = 'rl-msg'; m.innerHTML = html; shelf.appendChild(m); }
  function bg(art) { $('.rl-bg').style.backgroundImage = art ? 'url("' + art + '")' : 'none'; }

  // ---------- Farver fra coveret (ryg + vinyl) ----------
  function hashHue(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x % 360; }
  function colorOf(art, key, cb) {
    var k = art || key; if (colorCache[k]) return cb(colorCache[k]);
    var fb = function () { colorCache[k] = { h: hashHue(key || 'x'), s: 45, l: 42, avgL: .4 }; cb(colorCache[k]); };
    if (!art) return fb();
    var img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var cv = document.createElement('canvas'); cv.width = cv.height = 32; var x = cv.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
        var d = x.getImageData(0, 0, 32, 32).data, bins = {}, best = null, sumL = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn; sumL += l; n++;
          if (dl < .12 || l < .1 || l > .92) continue; var s = dl / (1 - Math.abs(2 * l - 1)), h;
          if (mx === r) h = 60 * (((g - b) / dl) % 6); else if (mx === g) h = 60 * ((b - r) / dl + 2); else h = 60 * ((r - g) / dl + 4); if (h < 0) h += 360;
          var kk = Math.round(h / 20); bins[kk] = bins[kk] || { n: 0, h: 0, s: 0, l: 0 }; bins[kk].n += s; bins[kk].h += h * s; bins[kk].s += s * s; bins[kk].l += l * s;
        }
        for (var kk2 in bins) if (!best || bins[kk2].n > best.n) best = bins[kk2];
        if (!best || best.n < 6) { colorCache[k] = { h: 0, s: 0, l: Math.min(.8, Math.max(.15, sumL / n)) * 100, avgL: sumL / n }; return cb(colorCache[k]); }
        colorCache[k] = { h: best.h / best.n, s: Math.min(80, Math.max(35, 100 * best.s / best.n)), l: Math.min(62, Math.max(30, 100 * best.l / best.n)), avgL: sumL / n }; cb(colorCache[k]);
      } catch (e) { fb(); }
    };
    img.onerror = fb; img.src = B + '/img?u=' + encodeURIComponent(art);
  }
  function hsl(h, s, l) { return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)'; }
  function spineColor(a, el) {
    colorOf(a.art, a.album + '|' + a.artist, function (c) { el.style.setProperty('--sc', hsl(c.h, c.s, c.l)); el.style.setProperty('--st', c.l > 58 ? '#1a1a1a' : '#fff'); });
  }

  // ---------- Data ----------
  function tabs() {
    var artist = status.artist || '', t = [['recent', 'Senest spillet'], ['fav', 'Favoritter']];
    if (artist) t.push(['more', 'Mere fra ' + artist]);
    if (tab === 'more' && !artist) tab = 'recent';
    $('.rl-tabs').innerHTML = t.map(function (x) { return '<button class="' + (x[0] === tab ? 'on' : '') + '" data-t="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') +
      '<input type="search" placeholder="🔍 Søg i Tidal" value="' + esc(q) + '" enterkeyhint="search">';
    $('.rl-tabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; try { localStorage.setItem('reol-tab', tab); } catch (e) { } tabs(); load(); }; });
    var inp = $('.rl-tabs input');
    inp.onkeydown = function (e) { if (e.key === 'Enter') { q = inp.value.trim(); if (q) { tab = 'search'; $('.rl-tabs').querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); }); load(); inp.blur(); } } e.stopPropagation(); };
  }
  function load() {
    var r = ++req, p;
    showDetail(false);
    if (tab === 'recent') p = get('/wiim/recent').then(function (l) { return l.filter(function (x) { return x.kind !== 'other' && x.album; }).map(function (x) { return { album: x.album, artist: x.artist || '', art: x.art || '', id: x.id || '', pid: x.playlistId || '' }; }); });
    else if (tab === 'fav') p = get('/tidal/favorites').then(map);
    else if (tab === 'more') p = get('/tidal/search?q=' + encodeURIComponent(status.artist || '')).then(function (l) { var la = norm(status.artist); var own = l.filter(function (x) { var xa = norm(x.artist); return xa.indexOf(la) >= 0 || la.indexOf(xa) >= 0; }); return map(own.length ? own : l); });
    else if (tab === 'search') p = get('/tidal/search?q=' + encodeURIComponent(q)).then(map);
    msg('Henter plader…');
    p.then(function (l) { if (r !== req) return; items = (l || []).slice(0, 200); if (!items.length) return msg('Ingen plader her endnu.'); shelf.querySelectorAll('.rl-msg').forEach(function (n) { n.remove(); }); render(); })
      .catch(function (e) {
        if (r !== req) return;
        if (tab === 'fav' && e.status === 401) {
          var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:';
          return msg('Log ind på Tidal én gang for at se dine favoritter.<br>' + (local ? '<button onclick="window.open(\'' + B + '/tidal/login\',\'_blank\')">Log ind på Tidal</button>' : '<span style="font-size:12px;opacity:.8">Gøres fra Mac\'en: åbn Vinyl Mini → Reol → Favoritter → Log ind.</span>'));
        }
        msg('Kunne ikke hente (' + esc(e.message) + ')');
      });
  }
  function map(l) { return (l || []).map(function (x) { return { album: x.album, artist: x.artist, art: x.art, year: x.year, id: x.id }; }); }

  // ---------- Album / pladespiller ----------
  function showDetail(on) { detail = !!on; root.classList.toggle('det', detail); $('.rl-det').classList.toggle('show', detail); $('.rl-stage').style.visibility = detail ? 'hidden' : ''; $('.rl-cap').style.visibility = detail ? 'hidden' : ''; if (!detail) layoutDirty = true; }
  function openAlbum(a) {
    if (!a) return; dAlbum = a; showDetail(true); bg(a.art);
    $('.rl-cov').style.backgroundImage = a.art ? 'url("' + a.art + '")' : 'none';
    $('.rl-info .t').textContent = a.album || ''; $('.rl-info .a').textContent = a.artist || ''; $('.rl-info .y').textContent = a.year || '';
    $('.rl-lbl span').textContent = a.album || '';
    $('.rl-trk').innerHTML = '<li class="vol">Henter numre…</li>';
    colorOf(a.art, a.album + '|' + a.artist, function (c) {
      var disc = $('.rl-disc');
      disc.style.setProperty('--v1', hsl(c.h, c.s * .9, Math.max(14, c.l * .55)));
      disc.style.setProperty('--v2', hsl(c.h, c.s, Math.max(10, c.l * .45)));
      $('.rl-lbl').style.setProperty('--lc', hsl(c.h, Math.min(60, c.s), 88)); $('.rl-lbl').style.setProperty('--lt', hsl(c.h, 50, 25));
    });
    var idp = a.id ? Promise.resolve(a.id) : a.pid ? Promise.resolve('') : get('/tidal/find?artist=' + encodeURIComponent(a.artist || '') + '&album=' + encodeURIComponent(a.album || '')).then(function (f) { a.id = f.id; if (!a.year) a.year = f.year; return f.id; });
    idp.then(function (id) {
      if (!id) { $('.rl-trk').innerHTML = '<li class="vol">Playliste — tryk Afspil</li>'; return; }
      return get('/tidal/album?id=' + encodeURIComponent(id)).then(function (al) {
        if (dAlbum !== a) return;
        a.tracks = al.tracks; if (al.year) $('.rl-info .y').textContent = al.year + ' · ' + al.tracks.length + ' numre';
        var html = '', lastVol = 0;
        al.tracks.forEach(function (t) {
          if (al.vols > 1 && t.vol !== lastVol) { lastVol = t.vol; html += '<li class="vol">Side / disk ' + t.vol + '</li>'; }
          html += '<li data-x="' + t.index + '"><span class="n">' + t.n + '</span><span class="tt">' + esc(t.title) + '</span><span class="d">' + fmt(t.dur) + '</span></li>';
        });
        $('.rl-trk').innerHTML = html;
        $('.rl-trk').querySelectorAll('li[data-x]').forEach(function (li) { li.onclick = function () { playAlbum(a, +li.dataset.x); }; });
        markTrack();
      });
    }).catch(function (e) { $('.rl-trk').innerHTML = '<li class="vol">' + esc(e.message) + '</li>'; });
    markTrack(); devPicker();
  }
  function isPlayingThis() { return !!(dAlbum && status.playing && status.album && norm(status.album) === norm(dAlbum.album)); }
  // Tonearmen følger hvor langt man er på pladen: yderkant ved første nummer → ind mod labelen ved sidste
  var ARM_REST = -4, ARM_OUT = 7.5, ARM_IN = 37;
  function curTrackIdx() {
    var tr = (dAlbum && dAlbum.tracks) || [], st = norm(status.title);
    for (var i = 0; i < tr.length; i++) if (norm(tr[i].title) === st) return i;
    for (i = 0; i < tr.length; i++) if (st && (norm(tr[i].title).indexOf(st) === 0 || st.indexOf(norm(tr[i].title)) === 0)) return i;
    return -1;
  }
  function armAngle() {
    var same = !!(dAlbum && status.album && norm(status.album) === norm(dAlbum.album));
    if (!same) return ARM_REST;
    var tr = dAlbum.tracks || [], total = 0, before = 0, ci = curTrackIdx();
    if (!tr.length || ci < 0) return ARM_OUT;
    tr.forEach(function (t, i) { total += t.dur || 0; if (i < ci) before += t.dur || 0; });
    var frac = total ? Math.min(1, (before + (status.pos || 0) / 1000) / total) : 0;
    return ARM_OUT + frac * (ARM_IN - ARM_OUT);
  }
  function markTrack() {
    var tt = $('.rl-tt'); var on = isPlayingThis(), same = !!(dAlbum && status.album && norm(status.album) === norm(dAlbum.album));
    tt.classList.toggle('playing', on); tt.classList.toggle('out', on || same);
    var g = $('.rl-arm g.swing'); if (g) g.style.transform = 'rotate(' + armAngle().toFixed(2) + 'deg)';
    var ci = same ? curTrackIdx() : -1, tr = (dAlbum && dAlbum.tracks) || [];
    $('.rl-np').innerHTML = same && status.title ? '<span class="rl-eq' + (on ? '' : ' paused') + '"><i></i><i></i><i></i></span><span>' + (on ? 'Spiller nu: ' : 'Pause: ') + esc(status.title) + '</span>' : '';
    $('.rl-trk').querySelectorAll('li[data-x]').forEach(function (li) {
      var isCur = ci >= 0 && +li.dataset.x - 1 === ci, n = li.querySelector('.n'), t = tr[+li.dataset.x - 1];
      if (isCur !== li.classList.contains('cur') || (isCur && li._on !== on)) {
        li.classList.toggle('cur', isCur); li._on = on;
        n.innerHTML = isCur ? '<span class="rl-eq' + (on ? '' : ' paused') + '"><i></i><i></i><i></i></span>' : (t ? t.n : '');
        if (isCur && li.scrollIntoView) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
  var playDev = '';
  function devPicker() {
    var d = status.devices || {}, el = $('.rl-dev'); if (!el) return;
    if (!(d.wiim && d.mac)) { el.innerHTML = ''; return; }
    var cur = playDev || status.device || 'wiim';
    el.innerHTML = '<button data-d="wiim" class="' + (cur === 'wiim' ? 'on' : '') + '">WiiM</button><button data-d="mac" class="' + (cur === 'mac' ? 'on' : '') + '">Mac</button>';
    el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { playDev = b.dataset.d; devPicker(); }; });
  }
  function playAlbum(a, index) {
    if (!a) return;
    var p = a.pid ? '/wiim/playtidal?kind=playlist&id=' + encodeURIComponent(a.pid) + '&name=' + encodeURIComponent(a.album)
      : a.id ? '/wiim/playtidal?id=' + encodeURIComponent(a.id) + '&name=' + encodeURIComponent(a.album) + '&artist=' + encodeURIComponent(a.artist || '') + '&index=' + (index || 1)
        : '/wiim/playfind?artist=' + encodeURIComponent(a.artist || '') + '&album=' + encodeURIComponent(a.album);
    var dv = playDev || status.device || ''; if (dv) p += '&dev=' + dv;
    toast('▶ ' + (a.album || '') + (dv === 'mac' ? ' · Mac' : dv === 'wiim' ? ' · WiiM' : ''));
    get(p).then(function () { setTimeout(poll, 1200); }).catch(function (e) { toast(e.message || 'Kunne ikke starte'); });
  }
  function toast(s) { var t = $('.rl-toast'); t.textContent = s; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2500); }

  // ---------- Status ----------
  var lastArtist = null;
  function poll() {
    clearTimeout(pollT); if (!opened) return;
    get('/wiim/status').then(function (s) {
      status = s || {};
      if ((status.artist || '') !== lastArtist) { lastArtist = status.artist || ''; var ae = document.activeElement; if (!(ae && ae.tagName === 'INPUT')) tabs(); }
      if (detail) { markTrack(); devPicker(); }
    }).catch(function () { }).then(function () { pollT = setTimeout(poll, 2000); });
  }

  // ---------- Offentligt ----------
  function open(t) {
    if (!root) build();
    opened = true; root.classList.add('show'); sizeIt();
    if (t) tab = t;
    get('/wiim/status').then(function (s) { status = s || {}; }).catch(function () { }).then(function () { lastArtist = status.artist || ''; tabs(); load(); poll(); });
  }
  function openNow() {
    if (!root) build();
    if (!opened) { opened = true; root.classList.add('show'); sizeIt(); }
    get('/wiim/status').then(function (s) {
      status = s || {}; lastArtist = status.artist || ''; tabs(); poll();
      if (!items.length && !detail) load();
      if (status.album) openAlbum({ album: status.album, artist: status.artist, art: status.art });
    });
  }
  function close() { opened = false; if (root) root.classList.remove('show'); clearTimeout(pollT); if (onCloseCb) onCloseCb(); }
  window.Reol = { init: function (o) { B = (o && o.base) || ''; onCloseCb = o && o.onClose; }, open: open, openNow: openNow, close: close, isOpen: function () { return opened; } };
})();
