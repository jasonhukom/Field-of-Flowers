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

  var HZ = 40;          // horizon height in %, same number as --hz in style.css
  var MAX = 420;        // most flowers kept on screen; the oldest are removed beyond this
  var MIN_COUNT = 45;   // size of the starting field on small screens
  var MAX_COUNT = 130;  // ...and on large ones

  /* ---------- helpers ---------- */

  var field = document.getElementById('field');
  var resetBtn = document.getElementById('reset');

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

  /* ---------- planting ---------- */

  // nx: 0..1 across the screen, ny: 0 (far, at the horizon) .. 1 (near, bottom edge)
  function plant(nx, ny, delay) {
    var depth = Math.pow(clamp(ny, 0, 1), 0.9);
    var img = document.createElement('img');
    img.className = 'fl grow';
    img.alt = '';
    img.draggable = false;

    img.style.setProperty('--nx', nx.toFixed(4));
    img.style.setProperty('--ny', ny.toFixed(4));
    img.style.setProperty('--k', (0.38 + depth * 0.95).toFixed(3));   // nearer flowers are bigger
    img.style.setProperty('--flip', Math.random() < 0.5 ? -1 : 1);
    img.style.setProperty('--tilt', rand(-3, 3).toFixed(1) + 'deg');
    img.style.setProperty('--d', rand(3.2, 6.2).toFixed(2) + 's');
    img.style.setProperty('--dl', (-rand(0, 6)).toFixed(2) + 's');
    img.style.setProperty('--gd', (delay || 0).toFixed(2) + 's');
    img.style.zIndex = Math.round(ny * 1000);

    img.addEventListener('animationend', function (e) {
      if (e.animationName === 'grow') img.classList.remove('grow');
    });

    setSrc(img, FILES[Math.floor(Math.random() * FILES.length)]);
    field.appendChild(img);

    while (field.children.length > MAX) field.removeChild(field.firstChild);
  }

  // an evenly spread starting field (no two flowers right on top of each other)
  function scatter() {
    var W = window.innerWidth, H = window.innerHeight;
    var groundH = H * (100 - HZ) / 100;
    var count = Math.round(clamp(W * H / 16000, MIN_COUNT, MAX_COUNT));
    var spot = [];

    for (var i = 0; i < count; i++) {
      var best = null, bestGap = -1;
      for (var t = 0; t < 10; t++) {
        var c = { nx: rand(-0.02, 1.02), ny: 0.02 + 0.98 * Math.pow(Math.random(), 0.85) };
        var gap = Infinity;
        for (var j = 0; j < spot.length; j++) {
          var dx = (c.nx - spot[j].nx) * W;
          var dy = (c.ny - spot[j].ny) * groundH * 2;
          gap = Math.min(gap, dx * dx + dy * dy);
        }
        if (gap > bestGap) { bestGap = gap; best = c; }
      }
      spot.push(best);
    }

    spot.sort(function (a, b) { return a.ny - b.ny; });          // far to near, so near ones overlap far ones
    spot.forEach(function (s, i) { plant(s.nx, s.ny, Math.min(i * 0.012, 1.4)); });
  }

  function plantAt(x, y) {
    var W = window.innerWidth, H = window.innerHeight;
    var ny = ((y / H * 100) - HZ) / (100 - HZ);
    if (ny < -0.03) return;                                       // clicked the sky
    plant(x / W, clamp(ny, 0, 1), 0);
  }

  /* ---------- input: tap to plant, hold and drag to plant a trail ---------- */

  var down = false, lastX = 0, lastY = 0;

  field.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    down = true;
    lastX = e.clientX; lastY = e.clientY;
    plantAt(e.clientX, e.clientY);
  });

  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) >= 34) {
      lastX = e.clientX; lastY = e.clientY;
      plantAt(e.clientX, e.clientY);
    }
  });

  function lift() { down = false; }
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);

  resetBtn.addEventListener('click', function () {
    field.textContent = '';
    scatter();
  });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- start ---------- */

  scatter();
})();
