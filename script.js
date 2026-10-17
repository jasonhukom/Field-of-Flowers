(function () {
  'use strict';

  /* ---------- settings you can tweak ---------- */

  var LOCAL = 'assets/';                                        // images are looked up here first...
  var LIVE  = 'https://jasonhukom.github.io/flowers/assets/';   // ...then here if the local file is missing

  var FILES = [
    'bouquet-rose-red.png',
    'bouquet-peony-red.png',
    'bouquet-peony-pink.png',
    'bouquet-anemone-mint.png',
    'bouquet-daisy-cream.png'
  ];

  var MAX = 420;        // most flowers kept on screen; the oldest are removed beyond this

  /* ---------- helpers ---------- */

  var VW = Scenes.VW, VH = Scenes.VH;
  var field = document.getElementById('field');
  var sceneEl = document.getElementById('scene');
  var menu = document.getElementById('menu');
  var gear = document.getElementById('settings');
  var toastEl = document.getElementById('toast');

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // local file first, live site second, hide the image if neither exists
  function setSrc(img, file) {
    var retried = false;
    img.addEventListener('error', function () {
      if (!retried) { retried = true; img.src = LIVE + file; }
      else { img.style.visibility = 'hidden'; }
    });
    img.src = LOCAL + file;
  }

  var toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------- scene <-> screen mapping ---------- */
  // the scene is 1600x900 units, fitted like "background-size: cover"

  var u = 1, ox = 0, oy = 0;

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    u = Math.max(W / VW, H / VH);
    ox = (W - VW * u) / 2;
    oy = (H - VH * u) / 2;
    field.style.setProperty('--u', u + 'px');
    field.style.setProperty('--ox', ox + 'px');
    field.style.setProperty('--oy', oy + 'px');
  }

  function pointInPoly(p, x, y) {
    var inside = false;
    for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
      var xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // can a flower stand here? (only on the grass / soil patches the scene defines)
  function plantable(vx, vy) {
    var z = scene.zones;
    for (var i = 0; i < z.length; i++) {
      var b = z[i].box;
      if (vx >= b[0] && vx <= b[2] && vy >= b[1] && vy <= b[3] && pointInPoly(z[i].poly, vx, vy)) return true;
    }
    return false;
  }

  function onScreen(vx, vy) {
    var x = vx * u + ox, y = vy * u + oy;
    return x > 12 && x < window.innerWidth - 12 && y > 24 && y < window.innerHeight - 4;
  }

  /* ---------- planting ---------- */

  var scene = null, sceneIdx = -1;

  function plant(vx, vy, delay) {
    var p = scene.persp, kr = scene.kr;
    var depth = Math.pow(clamp((vy - p[0]) / (p[1] - p[0]), 0, 1), 0.9);

    var img = document.createElement('img');
    img.className = 'fl grow';
    img.alt = '';
    img.draggable = false;

    img.style.setProperty('--vx', vx.toFixed(1));
    img.style.setProperty('--vy', vy.toFixed(1));
    img.style.setProperty('--k', (kr[0] + depth * (kr[1] - kr[0])).toFixed(3));   // nearer flowers are bigger
    img.style.setProperty('--flip', Math.random() < 0.5 ? -1 : 1);
    img.style.setProperty('--tilt', rand(-3, 3).toFixed(1) + 'deg');
    img.style.setProperty('--d', rand(3.2, 6.2).toFixed(2) + 's');
    img.style.setProperty('--dl', (-rand(0, 6)).toFixed(2) + 's');
    img.style.setProperty('--gd', (delay || 0).toFixed(2) + 's');
    img.style.zIndex = Math.round(vy);

    img.addEventListener('animationend', function (e) {
      if (e.animationName === 'grow') img.classList.remove('grow');
    });

    setSrc(img, FILES[Math.floor(Math.random() * FILES.length)]);
    field.appendChild(img);

    while (field.children.length > MAX) field.removeChild(field.firstChild);
  }

  // random spot inside one of the scene's plantable patches (zones are picked by area)
  function samplePointAny(zones, total) {
    for (var t = 0; t < 20; t++) {
      var r = Math.random() * total, z = zones[0];
      for (var i = 0; i < zones.length; i++) { r -= zones[i].area; if (r <= 0) { z = zones[i]; break; } }
      var vx = rand(z.box[0], z.box[2]), vy = rand(z.box[1], z.box[3]);
      if (pointInPoly(z.poly, vx, vy)) return { x: vx, y: vy };
    }
    return null;
  }

  // ...same, but only spots that are actually visible on this screen
  function samplePoint(zones, total) {
    for (var t = 0; t < 60; t++) {
      var p = samplePointAny(zones, total);
      if (p && onScreen(p.x, p.y)) return p;
    }
    return null;
  }

  // an evenly spread starting field (no two flowers right on top of each other)
  function scatter() {
    var zones = scene.zones, total = 0, i;
    zones.forEach(function (z) { total += z.area; });

    // what share of the plantable ground fits on this screen? (phones crop the sides)
    var inside = 0, seen = 0;
    for (i = 0; i < 500; i++) {
      var p = samplePointAny(zones, total);
      if (p) { inside++; if (onScreen(p.x, p.y)) seen++; }
    }
    var frac = inside ? clamp(seen / inside, 0.2, 1) : 1;

    var base = scene.count || clamp(Math.round(total / (VW * VH) * 170), 14, 120);
    var count = Math.max(6, Math.round(base * frac));
    var spot = [];

    for (i = 0; i < count; i++) {
      var best = null, bestGap = -1;
      for (var t = 0; t < 10; t++) {
        var c = samplePoint(zones, total);
        if (!c) continue;
        var gap = Infinity;
        for (var j = 0; j < spot.length; j++) {
          var dx = c.x - spot[j].x, dy = (c.y - spot[j].y) * 2.2;
          gap = Math.min(gap, dx * dx + dy * dy);
        }
        if (gap > bestGap) { bestGap = gap; best = c; }
      }
      if (best) spot.push(best);
    }

    spot.sort(function (a, b) { return a.y - b.y; });           // far to near, so near ones overlap far ones
    spot.forEach(function (s, n) { plant(s.x, s.y, Math.min(n * 0.012, 1.4)); });
  }

  function plantAt(x, y, feedback) {
    var vx = (x - ox) / u, vy = (y - oy) / u;
    if (!plantable(vx, vy)) {
      if (feedback) {
        Sfx.nope();
        var n = document.createElement('div');
        n.className = 'nope';
        n.style.left = x + 'px'; n.style.top = y + 'px';
        n.addEventListener('animationend', function () { n.remove(); });
        document.body.appendChild(n);
      }
      return false;
    }
    plant(vx, vy, 0);
    Sfx.plant();
    return true;
  }

  /* ---------- backgrounds ---------- */

  var bag = [];

  function nextScene() {
    if (!bag.length) {
      for (var i = 0; i < Scenes.list.length; i++) if (i !== sceneIdx) bag.push(i);
      for (var j = bag.length - 1; j > 0; j--) {          // shuffle, so all 20 show up before any repeats
        var k = Math.floor(Math.random() * (j + 1)), t = bag[j]; bag[j] = bag[k]; bag[k] = t;
      }
    }
    return bag.pop();
  }

  function setScene(i, instant) {
    sceneIdx = i;
    scene = Scenes.get(i);

    var d = document.createElement('div');
    d.className = 'bg';
    d.innerHTML = scene.svg;
    var olds = Array.prototype.slice.call(sceneEl.children);
    sceneEl.appendChild(d);
    if (instant) d.classList.add('in');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('in'); }); });
    setTimeout(function () { olds.forEach(function (o) { o.remove(); }); }, instant ? 0 : 900);

    field.style.setProperty('--fs', scene.fs);
    field.textContent = '';
    scatter();
  }

  /* ---------- input: tap to plant, hold and drag to plant a trail ---------- */

  var down = false, lastX = 0, lastY = 0;

  field.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    if (menu.classList.contains('open')) setMenu(false);
    down = true;
    lastX = e.clientX; lastY = e.clientY;
    plantAt(e.clientX, e.clientY, true);
  });

  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) >= 34) {
      lastX = e.clientX; lastY = e.clientY;
      plantAt(e.clientX, e.clientY, false);
    }
  });

  function lift() { down = false; }
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- sound for every button + audio unlock ---------- */

  window.addEventListener('pointerdown', function () { Sfx.unlock(); }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (b && b.getAttribute('data-sfx') !== 'none') Sfx.click();
  }, true);

  /* ---------- settings: gear that fans buttons upward ---------- */

  function setMenu(open) {
    if (menu.classList.contains('open') === open) return;
    menu.classList.toggle('open', open);
    gear.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) Sfx.open(); else Sfx.close();
  }

  gear.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });

  document.getElementById('btnSearch').addEventListener('click', function () {
    Player.togglePanel();
    setMenu(false);
  });

  document.getElementById('btnUpload').addEventListener('click', function () {
    Player.upload();
    setMenu(false);
  });

  document.getElementById('btnBg').addEventListener('click', function () {
    var i = nextScene();
    Sfx.swap();
    setScene(i);
    toast(scene.name + '  ·  ' + (i + 1) + '/' + Scenes.list.length);
  });

  document.getElementById('btnReload').addEventListener('click', function () {
    Sfx.reload();
    field.textContent = '';
    scatter();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  window.addEventListener('resize', layout);

  /* ---------- start ---------- */

  layout();
  Player.init({ toast: toast, click: function () { Sfx.click(); } });
  setScene(0, true);
})();
