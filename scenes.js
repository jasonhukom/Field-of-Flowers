/*
  20 hand-built backgrounds, drawn as SVG at runtime.

  Every scene lists its own "zones": the only places where flowers may be planted
  (grass, soil, pot soil). The grass / soil you SEE is drawn from the very same
  polygons, so a flower can never end up on a tree, building, deck, wall or path.
*/
(function (g) {
  'use strict';

  var VW = 1600, VH = 900;

  /* ---------- small helpers ---------- */

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function P(p) { return p.map(function (q) { return f(q[0]) + ',' + f(q[1]); }).join(' '); }
  function rectP(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
  function ellP(cx, cy, rx, ry, n) {
    n = n || 28;
    var o = [];
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return o;
  }
  // closed Catmull-Rom curve turned into a dense polyline (used for drawing AND for hit-testing)
  function spline(p) {
    var n = p.length, o = [];
    for (var i = 0; i < n; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      for (var s = 0; s < 8; s++) {
        var t = s / 8, t2 = t * t, t3 = t2 * t;
        o.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    return o;
  }
  function area(p) {
    var a = 0;
    for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    return Math.abs(a) / 2;
  }
  function bbox(p) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    return [x0, y0, x1, y1];
  }

  var GREEN = ['#5fa24f', '#80c068'], DEEP = ['#3f8446', '#5aa65a'], PINK = ['#f2a9c4', '#ffd2e1'],
      AUTUMN = ['#d9822f', '#f2b255'], GOLD = ['#e0a93a', '#f6d36a'], PINE = ['#2f6b4a', '#4a9068'],
      DUSK = ['#3d6a55', '#55896a'], FOG = ['#6f9a8c', '#8fb5a6'];

  var ZC = {
    grass: { top: '#a8d887', bot: '#78b95e', edge: '#5f9c4a', pat: 'pBlade' },
    soil:  { top: '#8c6244', bot: '#6a462f', edge: '#4d3022', pat: 'pSpeck' }
  };

  /* ---------- scene builder ---------- */

  function Builder(seed) {
    var b = { r: mulberry(seed), defs: [], out: [], zones: [], n: 0 };

    b.id = function (p) { return p + seed + '_' + (++b.n); };
    b.add = function (s) { b.out.push(s); return b; };
    b.grad = function (stops, horiz) {
      var id = b.id('g');
      b.defs.push('<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (horiz ? 1 : 0) + '" y2="' + (horiz ? 0 : 1) + '">' +
        stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</linearGradient>');
      return 'url(#' + id + ')';
    };
    b.rect = function (x, y, w, h, fill, ex) {
      return b.add('<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + fill + '" ' + (ex || '') + '/>');
    };
    b.poly = function (p, fill, ex) { return b.add('<polygon points="' + P(p) + '" fill="' + fill + '" ' + (ex || '') + '/>'); };
    b.circ = function (x, y, r, fill, ex) { return b.add('<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '" ' + (ex || '') + '/>'); };
    b.ell = function (x, y, rx, ry, fill, ex) { return b.add('<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '" ' + (ex || '') + '/>'); };

    b.sky = function (stops) { return b.rect(0, 0, VW, VH, b.grad(stops)); };

    b.sun = function (x, y, r, c) {
      var id = b.id('s');
      b.defs.push('<radialGradient id="' + id + '"><stop offset="0" stop-color="' + c + '" stop-opacity=".95"/><stop offset=".35" stop-color="' + c + '" stop-opacity=".45"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>');
      b.circ(x, y, r * 3.2, 'url(#' + id + ')');
      return b.circ(x, y, r, c);
    };

    b.cloud = function (x, y, s, op, col) {
      var t = (50 + b.r() * 50).toFixed(0);
      return b.add('<g class="cl" style="--t:' + t + 's" opacity="' + (op || .9) + '" fill="' + (col || '#fff') + '">' +
        '<ellipse cx="' + x + '" cy="' + y + '" rx="' + 90 * s + '" ry="' + 26 * s + '"/>' +
        '<ellipse cx="' + (x - 40 * s) + '" cy="' + (y - 18 * s) + '" rx="' + 46 * s + '" ry="' + 30 * s + '"/>' +
        '<ellipse cx="' + (x + 28 * s) + '" cy="' + (y - 26 * s) + '" rx="' + 52 * s + '" ry="' + 34 * s + '"/></g>');
    };

    b.hills = function (y, amp, color, seed) {
      var ph = seed || 0, d = 'M0,' + VH + 'L0,' + f(y);
      for (var x = 0; x <= VW; x += 40) d += 'L' + x + ',' + f(y + Math.sin(x * 0.004 + ph) * amp + Math.sin(x * 0.011 + ph * 2) * amp * 0.4);
      return b.add('<path d="' + d + 'L' + VW + ',' + VH + 'Z" fill="' + color + '"/>');
    };

    // wide ground with a faint cobble pattern, from y down to the bottom
    b.pave = function (y, c1, c2, pat) {
      b.rect(0, y, VW, VH - y, b.grad([[0, c1], [1, c2]]));
      return b.rect(0, y, VW, VH - y, 'url(#' + (pat || 'pCobble') + ')');
    };

    b.building = function (x, y, w, h, col, o) {
      o = o || {};
      var s = '<rect x="' + f(x) + '" y="' + f(y - h) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + col + '"/>' +
        '<rect x="' + f(x + w * .74) + '" y="' + f(y - h) + '" width="' + f(w * .26) + '" height="' + f(h) + '" fill="#000" opacity=".07"/>' +
        '<rect x="' + f(x - 3) + '" y="' + f(y - h - 6) + '" width="' + f(w + 6) + '" height="8" fill="#000" opacity=".12"/>';
      var cols = Math.max(1, Math.floor((w - 14) / 30)), rows = Math.floor((h - 26) / 44), cw = (w - 14) / cols;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var lit = b.r() < (o.lit || 0);
        s += '<rect x="' + f(x + 7 + c * cw + (cw - 15) / 2) + '" y="' + f(y - h + 20 + r * 44) + '" width="15" height="24" rx="2" fill="' + (lit ? (o.lc || '#ffe9a8') : (o.win || '#d4e4f0')) + '"/>';
      }
      return b.add(s);
    };
    b.skyline = function (y, o) {
      var x = -20;
      while (x < VW + 20) {
        var w = 70 + b.r() * 90, h = 130 + b.r() * 240;
        b.building(x, y, w, h, o.cols[Math.floor(b.r() * o.cols.length)], o);
        x += w + b.r() * 12;
      }
      return b;
    };

    b.tree = function (x, y, s, kind, c) {
      c = c || GREEN;
      var o = '<ellipse cx="' + x + '" cy="' + y + '" rx="' + 62 * s + '" ry="' + 12 * s + '" fill="#000" opacity=".14"/>', i;
      if (kind === 'pine') {
        o += '<rect x="' + f(x - 6 * s) + '" y="' + f(y - 50 * s) + '" width="' + f(12 * s) + '" height="' + f(50 * s) + '" fill="#6b4a33"/>';
        for (i = 0; i < 4; i++) {
          var w = (124 - i * 24) * s, by = y - 28 * s - i * 50 * s, ty = by - 84 * s;
          o += '<polygon points="' + P([[x, ty], [x + w / 2, by], [x - w / 2, by]]) + '" fill="' + c[0] + '"/>' +
               '<polygon points="' + P([[x, ty], [x + w / 2, by], [x, by]]) + '" fill="' + c[1] + '" opacity=".45"/>';
        }
      } else if (kind === 'birch') {
        o += '<rect x="' + f(x - 7 * s) + '" y="' + f(y - 150 * s) + '" width="' + f(14 * s) + '" height="' + f(150 * s) + '" fill="#f1ece4"/>';
        for (i = 0; i < 5; i++) o += '<rect x="' + f(x - 7 * s) + '" y="' + f(y - (30 + i * 26) * s) + '" width="' + f((6 + (i % 2) * 5) * s) + '" height="' + f(5 * s) + '" fill="#4a4540"/>';
        [[0, -170, 56], [-34, -140, 40], [36, -142, 42], [4, -205, 38]].forEach(function (q) {
          o += '<circle cx="' + f(x + q[0] * s) + '" cy="' + f(y + q[1] * s) + '" r="' + f(q[2] * s) + '" fill="' + c[0] + '"/>';
        });
        o += '<circle cx="' + f(x - 12 * s) + '" cy="' + f(y - 185 * s) + '" r="' + f(24 * s) + '" fill="' + c[1] + '" opacity=".8"/>';
      } else {
        o += '<rect x="' + f(x - 8 * s) + '" y="' + f(y - 105 * s) + '" width="' + f(16 * s) + '" height="' + f(105 * s) + '" fill="#7a5a3c"/>';
        [[0, -138, 66], [-50, -108, 50], [52, -110, 52], [-22, -180, 48], [32, -175, 46]].forEach(function (q) {
          o += '<circle cx="' + f(x + q[0] * s) + '" cy="' + f(y + q[1] * s) + '" r="' + f(q[2] * s) + '" fill="' + c[0] + '"/>';
        });
        [[-20, -190, 28], [-56, -122, 22], [22, -158, 26]].forEach(function (q) {
          o += '<circle cx="' + f(x + q[0] * s) + '" cy="' + f(y + q[1] * s) + '" r="' + f(q[2] * s) + '" fill="' + c[1] + '" opacity=".8"/>';
        });
      }
      return b.add(o);
    };
    b.treeRow = function (y, s, pal, kind, x0, x1, gap) {
      for (var x = x0 == null ? 40 : x0; x < (x1 == null ? VW + 60 : x1); x += (gap || 150) * (0.8 + b.r() * 0.4)) {
        b.tree(x, y + (b.r() - .5) * 14, s * (0.85 + b.r() * 0.3), kind, pal);
      }
      return b;
    };
    b.bush = function (x, y, s, col, hi) {
      return b.add('<ellipse cx="' + x + '" cy="' + y + '" rx="' + 60 * s + '" ry="' + 12 * s + '" fill="#000" opacity=".12"/>' +
        '<circle cx="' + f(x - 30 * s) + '" cy="' + f(y - 24 * s) + '" r="' + f(30 * s) + '" fill="' + col + '"/>' +
        '<circle cx="' + f(x + 28 * s) + '" cy="' + f(y - 26 * s) + '" r="' + f(32 * s) + '" fill="' + col + '"/>' +
        '<circle cx="' + f(x) + '" cy="' + f(y - 40 * s) + '" r="' + f(34 * s) + '" fill="' + col + '"/>' +
        '<circle cx="' + f(x - 8 * s) + '" cy="' + f(y - 50 * s) + '" r="' + f(16 * s) + '" fill="' + (hi || '#fff') + '" opacity=".22"/>');
    };

    b.lamp = function (x, y, s, on) {
      return b.add('<rect x="' + f(x - 4 * s) + '" y="' + f(y - 150 * s) + '" width="' + f(8 * s) + '" height="' + f(150 * s) + '" fill="#4b4f5a"/>' +
        '<rect x="' + f(x - 12 * s) + '" y="' + f(y - 8 * s) + '" width="' + f(24 * s) + '" height="' + f(8 * s) + '" fill="#4b4f5a"/>' +
        (on ? '<circle cx="' + x + '" cy="' + f(y - 160 * s) + '" r="' + f(46 * s) + '" fill="#ffe29a" opacity=".3"/>' : '') +
        '<circle cx="' + x + '" cy="' + f(y - 160 * s) + '" r="' + f(13 * s) + '" fill="' + (on ? '#fff0b8' : '#e8eef2') + '" stroke="#4b4f5a" stroke-width="' + f(3 * s) + '"/>');
    };
    b.bench = function (x, y, s) {
      var w = 120 * s;
      return b.add('<ellipse cx="' + x + '" cy="' + f(y + 4 * s) + '" rx="' + f(w * .6) + '" ry="' + f(8 * s) + '" fill="#000" opacity=".15"/>' +
        '<rect x="' + f(x - w / 2) + '" y="' + f(y - 56 * s) + '" width="' + f(w) + '" height="' + f(10 * s) + '" fill="#a9754a"/>' +
        '<rect x="' + f(x - w / 2) + '" y="' + f(y - 40 * s) + '" width="' + f(w) + '" height="' + f(10 * s) + '" fill="#a9754a"/>' +
        '<rect x="' + f(x - w / 2) + '" y="' + f(y - 26 * s) + '" width="' + f(w) + '" height="' + f(12 * s) + '" fill="#c08a58"/>' +
        '<rect x="' + f(x - w / 2 + 6 * s) + '" y="' + f(y - 14 * s) + '" width="' + f(7 * s) + '" height="' + f(16 * s) + '" fill="#3f434d"/>' +
        '<rect x="' + f(x + w / 2 - 13 * s) + '" y="' + f(y - 14 * s) + '" width="' + f(7 * s) + '" height="' + f(16 * s) + '" fill="#3f434d"/>');
    };

    b.fence = function (x1, x2, y, h, col, wood) {
      var o = '', edge = wood ? '#8a6238' : '#e2d3cc';
      o += '<rect x="' + x1 + '" y="' + f(y - h * .72) + '" width="' + (x2 - x1) + '" height="9" fill="' + col + '" stroke="' + edge + '"/>';
      o += '<rect x="' + x1 + '" y="' + f(y - h * .28) + '" width="' + (x2 - x1) + '" height="9" fill="' + col + '" stroke="' + edge + '"/>';
      for (var x = x1; x < x2; x += 26) {
        o += wood
          ? '<rect x="' + x + '" y="' + f(y - h) + '" width="22" height="' + h + '" fill="' + col + '" stroke="' + edge + '"/>'
          : '<polygon points="' + P([[x, y], [x, y - h + 10], [x + 8, y - h], [x + 16, y - h + 10], [x + 16, y]]) + '" fill="' + col + '" stroke="' + edge + '"/>';
      }
      return b.add(o);
    };

    b.house = function (x, y, w, h, wall, roof, o) {
      o = o || {};
      var rh = o.rh || h * .62, s = '';
      s += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(w * .62) + '" ry="14" fill="#000" opacity=".12"/>';
      if (o.chim !== false) s += '<rect x="' + f(x + w * .22) + '" y="' + f(y - h - rh * .95) + '" width="34" height="' + f(rh * .8) + '" fill="#a9604f"/>';
      s += '<rect x="' + f(x - w / 2) + '" y="' + f(y - h) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + wall + '"/>';
      s += '<rect x="' + f(x + w * .3) + '" y="' + f(y - h) + '" width="' + f(w * .2) + '" height="' + f(h) + '" fill="#000" opacity=".06"/>';
      s += '<polygon points="' + P([[x - w / 2 - 24, y - h + 6], [x - w * .16, y - h - rh], [x + w * .16, y - h - rh], [x + w / 2 + 24, y - h + 6]]) + '" fill="' + roof + '"/>';
      s += '<polygon points="' + P([[x - w / 2 - 24, y - h + 6], [x + w / 2 + 24, y - h + 6], [x + w / 2 + 14, y - h + 20], [x - w / 2 - 14, y - h + 20]]) + '" fill="#000" opacity=".16"/>';
      s += '<rect x="' + (x - 24) + '" y="' + (y - 96) + '" width="48" height="96" rx="3" fill="' + (o.door || '#7a4b3a') + '"/><circle cx="' + (x + 14) + '" cy="' + (y - 46) + '" r="3.5" fill="#f2d28a"/>';
      [-.3, .3].forEach(function (k) {
        var wx = x + w * k - 31, wy = y - h + 54;
        s += '<rect x="' + f(wx) + '" y="' + wy + '" width="62" height="64" fill="' + (o.lit ? '#ffe7a6' : '#cde7f4') + '" stroke="#fff" stroke-width="5"/>' +
             '<path d="M' + f(wx + 31) + ',' + wy + 'v64M' + f(wx) + ',' + (wy + 32) + 'h62" stroke="#fff" stroke-width="4"/>';
      });
      return b.add(s);
    };

    // flower-pot, y = bottom of the pot, soil sits at the top and becomes a plantable zone
    b.pot = function (x, y, s, col) {
      col = col || '#d98a62';
      b.add('<ellipse cx="' + x + '" cy="' + f(y) + '" rx="' + f(36 * s) + '" ry="' + f(7 * s) + '" fill="#000" opacity=".16"/>' +
        '<polygon points="' + P([[x - 38 * s, y - 58 * s], [x + 38 * s, y - 58 * s], [x + 28 * s, y], [x - 28 * s, y]]) + '" fill="' + col + '"/>' +
        '<polygon points="' + P([[x + 10 * s, y - 58 * s], [x + 38 * s, y - 58 * s], [x + 28 * s, y], [x + 4 * s, y]]) + '" fill="#000" opacity=".1"/>' +
        '<rect x="' + f(x - 44 * s) + '" y="' + f(y - 74 * s) + '" width="' + f(88 * s) + '" height="' + f(18 * s) + '" rx="' + f(5 * s) + '" fill="' + col + '"/>' +
        '<rect x="' + f(x - 44 * s) + '" y="' + f(y - 74 * s) + '" width="' + f(88 * s) + '" height="' + f(5 * s) + '" rx="' + f(3 * s) + '" fill="#fff" opacity=".25"/>');
      return b.zone('soil', ellP(x, y - 66 * s, 35 * s, 7 * s, 20), { sharp: true, sw: 2 });
    };

    // wooden raised bed seen from the front; the soil top is a plantable trapezoid
    b.bed = function (x, y, w, h, d, wood) {
      wood = wood || '#c08a58';
      b.add('<ellipse cx="' + f(x + w / 2) + '" cy="' + f(y + 4) + '" rx="' + f(w * .56) + '" ry="12" fill="#000" opacity=".15"/>');
      b.add('<rect x="' + x + '" y="' + f(y - h) + '" width="' + w + '" height="' + h + '" fill="' + wood + '"/>');
      for (var i = 1; i < 3; i++) b.add('<rect x="' + x + '" y="' + f(y - h + i * h / 3) + '" width="' + w + '" height="2" fill="#000" opacity=".16"/>');
      b.add('<rect x="' + x + '" y="' + f(y - h) + '" width="' + w + '" height="6" fill="#fff" opacity=".2"/>');
      var p = [[x + d * .6, y - h - d], [x + w - d * .6, y - h - d], [x + w, y - h], [x, y - h]];
      b.add('<polygon points="' + P(p) + '" fill="' + wood + '" opacity=".7"/>');
      var q = [[x + d * .6 + 8, y - h - d + 6], [x + w - d * .6 - 8, y - h - d + 6], [x + w - 8, y - h - 2], [x + 8, y - h - 2]];
      return b.zone('soil', q, { sharp: true, sw: 2 });
    };

    // a plantable patch (the visible fill is generated from the same polygon)
    b.zone = function (kind, p, o) {
      o = o || {};
      var d = o.sharp ? p : spline(p), c = ZC[kind] || ZC.grass;
      b.zones.push({ poly: d, area: area(d), box: bbox(d) });
      var gr = b.grad([[0, o.c1 || c.top], [1, o.c2 || c.bot]]);
      b.add('<polygon points="' + P(d) + '" fill="' + gr + '" stroke="' + (o.edge || c.edge) + '" stroke-width="' + (o.sw == null ? 5 : o.sw) + '" stroke-linejoin="round"/>');
      return b.add('<polygon points="' + P(d) + '" fill="url(#' + (o.pat || c.pat) + ')"/>');
    };

    b.rays = function (n, col, op) {
      for (var i = 0; i < n; i++) {
        var x = 200 + i * (VW - 400) / Math.max(1, n - 1) + (b.r() - .5) * 120, w = 50 + b.r() * 90;
        b.poly([[x, 0], [x + w, 0], [x + w - 280, VH], [x - 280, VH]], col, 'opacity="' + (op || .1) + '"');
      }
      return b;
    };

    b.glass = function (x, y, w, h, gx, gy) {
      var s = '';
      for (var i = x; i <= x + w; i += gx) s += '<rect x="' + (i - 3) + '" y="' + y + '" width="6" height="' + h + '" fill="#f6fbf8" opacity=".85"/>';
      for (var j = y; j <= y + h; j += gy) s += '<rect x="' + x + '" y="' + (j - 3) + '" width="' + w + '" height="6" fill="#f6fbf8" opacity=".85"/>';
      return b.add(s);
    };

    b.log = function (x, y, w, h) {
      return b.add('<ellipse cx="' + (x + w / 2) + '" cy="' + (y + h) + '" rx="' + w * .55 + '" ry="10" fill="#000" opacity=".16"/>' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '" fill="#8a6038"/>' +
        '<ellipse cx="' + (x + w) + '" cy="' + (y + h / 2) + '" rx="' + h * .32 + '" ry="' + h / 2 + '" fill="#d9b484" stroke="#6a4a2c" stroke-width="3"/>');
    };
    b.rock = function (x, y, s, col) {
      return b.add('<ellipse cx="' + x + '" cy="' + (y + 3) + '" rx="' + 40 * s + '" ry="' + 8 * s + '" fill="#000" opacity=".15"/>' +
        '<path d="M' + (x - 38 * s) + ',' + y + 'Q' + (x - 36 * s) + ',' + (y - 40 * s) + ' ' + x + ',' + (y - 38 * s) + 'Q' + (x + 40 * s) + ',' + (y - 34 * s) + ' ' + (x + 40 * s) + ',' + y + 'Z" fill="' + (col || '#9aa0a8') + '"/>');
    };

    b.build = function () {
      var vg = b.id('v');
      b.defs.push('<radialGradient id="' + vg + '" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#3a2a40" stop-opacity=".22"/></radialGradient>');
      b.add('<rect width="' + VW + '" height="' + VH + '" fill="url(#' + vg + ')"/>');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid slice"><defs>' + PATTERNS + b.defs.join('') + '</defs>' + b.out.join('') + '</svg>';
      return { svg: svg, zones: b.zones };
    };
    return b;
  }

  var PATTERNS =
    '<pattern id="pBlade" width="60" height="60" patternUnits="userSpaceOnUse"><g stroke="#fff" stroke-opacity=".2" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M8 18l-2-8M10 18l1-9M12 18l3-7"/><path d="M38 46l-2-8M40 46l1-9M42 46l3-7"/></g><g stroke="#2f6b34" stroke-opacity=".2" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M44 14l-2-7M46 14l1-8M48 14l3-6"/><path d="M16 52l-2-7M18 52l1-8M20 52l3-6"/></g></pattern>' +
    '<pattern id="pSpeck" width="48" height="48" patternUnits="userSpaceOnUse"><g fill="#2c1a10" fill-opacity=".28"><circle cx="6" cy="8" r="2"/><circle cx="30" cy="14" r="1.6"/><circle cx="18" cy="32" r="2.2"/><circle cx="40" cy="40" r="1.8"/></g><g fill="#c79a74" fill-opacity=".22"><circle cx="22" cy="6" r="1.6"/><circle cx="8" cy="40" r="1.8"/><circle cx="36" cy="28" r="1.4"/></g></pattern>' +
    '<pattern id="pCobble" width="90" height="46" patternUnits="userSpaceOnUse"><g stroke="#000" stroke-opacity=".07" stroke-width="2" fill="none"><path d="M0 0h90M0 23h90M20 0v23M65 23v23"/></g></pattern>' +
    '<pattern id="pTile" width="80" height="60" patternUnits="userSpaceOnUse"><g stroke="#000" stroke-opacity=".09" stroke-width="2" fill="none"><path d="M0 0h80M0 0v60"/></g></pattern>' +
    '<pattern id="pPlank" width="40" height="26" patternUnits="userSpaceOnUse"><g stroke="#4b2f14" stroke-opacity=".22" stroke-width="2" fill="none"><path d="M0 0h40M14 0v26"/></g></pattern>' +
    '<pattern id="pFurrow" width="60" height="28" patternUnits="userSpaceOnUse"><g stroke="#2c1a10" stroke-opacity=".3" stroke-width="3" fill="none"><path d="M0 8h60"/></g><g stroke="#d4aa84" stroke-opacity=".25" stroke-width="2" fill="none"><path d="M0 14h60"/></g></pattern>';

  /* ---------- the 20 scenes ---------- */

  var LIST = [];
  // persp: [y where flowers are smallest, y where biggest]   kr: [smallest, biggest] size factor
  function def(name, o, fn) { o.name = name; o.draw = fn; LIST.push(o); }

  var dayCol = [[0, '#bfe3f5'], [.5, '#e6f4f3'], [1, '#fdeede']];

  // --- city park ---
  def('City Park · Morning', { persp: [580, 870] }, function (b) {
    b.sky(dayCol); b.sun(1260, 190, 62, '#fff4c8');
    b.cloud(260, 150, 1.2, .9); b.cloud(780, 100, .8, .8); b.cloud(1380, 270, 1, .7);
    b.skyline(480, { cols: ['#b7c9db', '#c4d3e1', '#a9bdd1'], lit: .12 });
    b.pave(495, '#e5dfda', '#cfc8c2');
    b.treeRow(535, .8, GREEN, 'round');
    b.lamp(840, 575, 1); b.bench(840, 640, .7);
    b.zone('grass', [[110, 660], [330, 600], [620, 600], [740, 660], [715, 780], [420, 860], [150, 830]]);
    b.zone('grass', [[950, 650], [1050, 600], [1300, 592], [1520, 630], [1560, 740], [1380, 855], [1040, 830]]);
  });

  def('City Park · Sunset', { persp: [580, 870] }, function (b) {
    b.sky([[0, '#6d6fb0'], [.5, '#f2a1b0'], [1, '#ffd9a8']]); b.sun(800, 440, 70, '#ffe0b0');
    b.cloud(300, 170, 1.1, .5, '#ffd1d9'); b.cloud(1250, 230, 1.3, .5, '#ffd1d9');
    b.skyline(490, { cols: ['#5c5a8e', '#6e6a9c', '#4f4d80'], lit: .5, win: '#7b78ad' });
    b.pave(505, '#c7b0bb', '#a894a6');
    b.treeRow(540, .8, DUSK, 'round');
    b.lamp(430, 600, 1, true); b.lamp(1170, 600, 1, true);
    b.zone('grass', [[120, 680], [400, 618], [800, 606], [1200, 618], [1480, 680], [1500, 790], [1100, 860], [500, 860], [130, 800]], { c1: '#9ccb83', c2: '#6aa458', edge: '#4f8445' });
  });

  def('City Plaza Planters', { persp: [580, 880], kr: [.4, 1.2] }, function (b) {
    b.sky(dayCol); b.sun(300, 170, 56, '#fff4c8'); b.cloud(900, 120, 1, .8); b.cloud(1350, 220, .9, .7);
    b.skyline(500, { cols: ['#cfc6d8', '#c3d0e0', '#d8c8c8', '#bcc9d6'], lit: .1 });
    b.pave(500, '#eee7e0', '#d6cdc4', 'pTile');
    // fountain
    b.ell(800, 640, 190, 46, '#bcd9e6', 'stroke="#e9e2da" stroke-width="14"');
    b.ell(800, 640, 150, 30, '#9fcbe0');
    b.rect(790, 520, 20, 110, '#e6dfd7');
    b.ell(800, 520, 38, 10, '#e6dfd7');
    for (var i = -3; i <= 3; i++) b.add('<path d="M800,520Q' + (800 + i * 26) + ',' + (470 - Math.abs(i) * 6) + ' ' + (800 + i * 50) + ',' + (600) + '" stroke="#e8f6ff" stroke-width="4" fill="none" opacity=".8"/>');
    b.tree(150, 575, .9, 'round', GREEN); b.tree(1450, 575, .9, 'round', GREEN);
    [[170, 700, 340, 120], [1090, 700, 340, 120], [490, 800, 620, 80]].forEach(function (r) {
      b.rect(r[0] - 14, r[1] - 14, r[2] + 28, r[3] + 28, '#c9c0b6', 'rx="26"');
      b.zone('grass', rectP(r[0], r[1], r[2], r[3]), { sharp: true, sw: 3 });
    });
  });

  def('City Park · Pond', { persp: [590, 880] }, function (b) {
    b.sky(dayCol); b.sun(1300, 170, 58, '#fff4c8'); b.cloud(400, 140, 1.3, .85); b.cloud(1000, 230, .8, .7);
    b.skyline(470, { cols: ['#c0cfdd', '#b4c5d6', '#ccd6e0'], lit: .05 });
    b.pave(485, '#e8e1da', '#d2cac1');
    b.treeRow(530, .75, GREEN, 'round');
    b.ell(800, 690, 360, 92, '#e7e0d8');
    b.ell(800, 690, 330, 74, '#8fc8de');
    b.ell(740, 680, 150, 22, '#b2dcec', 'opacity=".6"');
    [[600, 700], [900, 720], [1000, 670]].forEach(function (p) { b.ell(p[0], p[1], 26, 8, '#6fb36d'); });
    b.zone('grass', [[80, 640], [330, 590], [470, 640], [450, 760], [260, 830], [100, 790]]);
    b.zone('grass', [[1130, 640], [1270, 590], [1520, 640], [1500, 790], [1340, 830], [1150, 760]]);
    b.zone('grass', [[520, 810], [800, 785], [1080, 810], [1010, 880], [590, 880]]);
  });

  // --- lawn park ---
  def('Open Lawn', { persp: [580, 880] }, function (b) {
    b.sky(dayCol); b.sun(1180, 200, 64, '#fff4c8'); b.cloud(300, 160, 1.3, .9); b.cloud(900, 110, .9, .8); b.cloud(1450, 250, 1, .7);
    b.hills(450, 30, '#cfe7c4', 1); b.hills(500, 26, '#b7dba8', 3);
    b.tree(300, 520, .8, 'round', GREEN); b.tree(1250, 515, .9, 'round', GREEN); b.tree(1380, 525, .7, 'birch', GREEN);
    b.poly([[-20, 535], [500, 520], [1000, 540], [1620, 520], [1620, 575], [1000, 590], [500, 570], [-20, 585]], '#e4d9c6');
    b.zone('grass', [[-60, 640], [400, 622], [900, 634], [1300, 618], [1680, 640], [1680, 950], [-60, 950]]);
  });

  def('Cherry Blossom Lawn', { persp: [590, 880] }, function (b) {
    b.sky([[0, '#f6cfe0'], [.5, '#fbe6ec'], [1, '#fff4ef']]); b.sun(1300, 190, 56, '#fffbe6');
    b.cloud(350, 150, 1.2, .8, '#fff'); b.cloud(1000, 100, .9, .7, '#fff');
    b.hills(470, 24, '#e4dcc9', 2);
    b.tree(250, 545, 1.3, 'round', PINK); b.tree(560, 540, 1.1, 'round', PINK); b.tree(1050, 545, 1.2, 'round', PINK); b.tree(1370, 545, 1.35, 'round', PINK);
    b.poly([[-20, 560], [800, 548], [1620, 562], [1620, 900], [-20, 900]], '#ece0d0');
    b.poly([[740, 570], [860, 570], [1010, 900], [600, 900]], '#d9cdbd');
    b.zone('grass', [[-60, 650], [260, 606], [610, 618], [720, 720], [570, 890], [-60, 890]], { c1: '#b8dd95', c2: '#85c06a' });
    b.zone('grass', [[1680, 650], [1340, 606], [990, 618], [880, 720], [1030, 890], [1680, 890]], { c1: '#b8dd95', c2: '#85c06a' });
    for (var i = 0; i < 40; i++) b.ell(100 + b.r() * 1400, 600 + b.r() * 290, 5, 3, '#ffc4d8', 'opacity=".8"');
  });

  def('Picnic Hill', { persp: [570, 880] }, function (b) {
    b.sky([[0, '#b5defa'], [.6, '#e1f2f2'], [1, '#fdf3e2']]); b.sun(380, 190, 60, '#fff4c8');
    b.cloud(800, 150, 1.4, .9); b.cloud(1300, 250, 1, .8);
    b.hills(450, 28, '#c8e3bb', 4); b.hills(500, 22, '#b2d9a2', 1);
    b.tree(1100, 575, 1.5, 'round', DEEP); b.tree(320, 590, .7, 'round', GREEN);
    b.zone('grass', [[-120, 900], [-80, 680], [250, 610], [700, 575], [1000, 590], [1350, 575], [1720, 680], [1720, 900]], { c1: '#a6d884', c2: '#72b559' });
  });

  // --- houses ---
  def('Cottage Garden', { persp: [590, 880], kr: [.4, 1.15] }, function (b) {
    b.sky(dayCol); b.sun(1300, 180, 58, '#fff4c8'); b.cloud(300, 150, 1.2, .9); b.cloud(1050, 100, .8, .8);
    b.hills(430, 26, '#cfe5c2', 1); b.hills(480, 22, '#b7d9a8', 5);
    b.tree(250, 520, 1.1, 'round', GREEN); b.tree(1380, 520, 1.2, 'round', GREEN); b.tree(1250, 530, .8, 'birch', GREEN);
    b.pave(540, '#eadfcd', '#d7c9b3');
    b.house(800, 560, 420, 210, '#f9ead7', '#b4584b');
    b.poly([[760, 560], [840, 560], [960, 900], [640, 900]], '#d6c7b0');
    b.fence(150, 640, 620, 70, '#fffaf6'); b.fence(960, 1450, 620, 70, '#fffaf6');
    b.zone('soil', rectP(580, 566, 100, 26), { sharp: true, sw: 3 }); b.zone('soil', rectP(920, 566, 100, 26), { sharp: true, sw: 3 });
    b.zone('grass', [[80, 700], [330, 650], [560, 662], [610, 770], [450, 880], [60, 880]]);
    b.zone('grass', [[1520, 700], [1270, 650], [1040, 662], [990, 770], [1150, 880], [1540, 880]]);
  });

  def('Red Roof House', { persp: [570, 880], kr: [.4, 1.15] }, function (b) {
    b.sky([[0, '#a9d8f0'], [.6, '#def1f2'], [1, '#fcf1df']]); b.cloud(500, 130, 1.3, .9); b.cloud(1250, 220, 1, .8);
    b.hills(440, 30, '#c3e0b5', 3);
    b.tree(1250, 530, 1.3, 'round', DEEP); b.tree(1420, 540, .9, 'round', GREEN); b.tree(130, 530, 1, 'pine', PINE);
    b.pave(550, '#e8dcc9', '#d3c4ac');
    b.house(560, 580, 440, 240, '#fbefe0', '#c2483f', { door: '#4f6d8a' });
    b.poly([[520, 580], [600, 580], [720, 900], [400, 900]], '#d3c4ac');
    b.zone('soil', rectP(330, 586, 150, 28), { sharp: true, sw: 3 }); b.zone('soil', rectP(640, 586, 150, 28), { sharp: true, sw: 3 });
    b.zone('grass', [[900, 660], [1060, 610], [1360, 610], [1560, 680], [1540, 820], [1250, 890], [960, 850]]);
    b.zone('grass', [[60, 700], [260, 660], [420, 690], [330, 800], [200, 880], [40, 860]]);
  });

  def('Modern House · Evening', { persp: [590, 880], kr: [.4, 1.15] }, function (b) {
    b.sky([[0, '#4f5a9a'], [.55, '#d98fb0'], [1, '#ffcfa6']]); b.sun(220, 460, 60, '#ffe2b8');
    b.cloud(700, 160, 1.2, .4, '#ffc9d6'); b.cloud(1300, 260, 1, .4, '#ffc9d6');
    b.hills(500, 20, '#7d7aa6', 2);
    b.tree(150, 545, 1, 'pine', DUSK); b.tree(1460, 545, 1.1, 'pine', DUSK);
    b.pave(555, '#cfc0cf', '#b0a1b4');
    // flat-roof modern house
    b.rect(380, 330, 840, 14, '#3f4256');
    b.rect(400, 344, 800, 216, '#e9ddd4');
    b.rect(400, 344, 330, 216, '#3f4256', 'opacity=".12"');
    b.rect(430, 380, 280, 150, '#ffe3a8', 'stroke="#3f4256" stroke-width="8"');
    b.rect(840, 380, 330, 150, '#ffe3a8', 'stroke="#3f4256" stroke-width="8"');
    b.add('<path d="M570,380v150M1005,380v150" stroke="#3f4256" stroke-width="6"/>');
    b.poly([[700, 560], [900, 560], [1060, 900], [560, 900]], '#b5a6b8');
    b.zone('soil', [[230, 660], [660, 624], [680, 690], [250, 730]], { sharp: false, c1: '#7a5240', c2: '#573626' });
    b.zone('soil', [[960, 624], [1380, 660], [1360, 730], [940, 690]], { c1: '#7a5240', c2: '#573626' });
    b.zone('grass', [[150, 780], [500, 750], [560, 860], [180, 890]], { c1: '#8ec07f', c2: '#62985a' });
    b.zone('grass', [[1100, 760], [1470, 780], [1450, 890], [1050, 860]], { c1: '#8ec07f', c2: '#62985a' });
  });

  def('Farmhouse Barn', { persp: [580, 880] }, function (b) {
    b.sky([[0, '#f4a68e'], [.45, '#fbd0a4'], [1, '#fff0d0']]); b.sun(1250, 400, 66, '#fff1c0');
    b.cloud(350, 160, 1.3, .6, '#ffe2dc'); b.cloud(900, 240, 1, .6, '#ffe2dc');
    b.hills(470, 28, '#d9c79a', 2); b.hills(510, 22, '#c3b27e', 4);
    // barn
    b.rect(300, 330, 330, 200, '#b8483c'); b.poly([[280, 336], [465, 240], [650, 336]], '#8f3a32');
    b.rect(398, 400, 134, 130, '#7a2f2a'); b.add('<path d="M398,400L532,530M532,400L398,530" stroke="#f2d9c8" stroke-width="7"/>');
    b.rect(398, 400, 134, 130, 'none', 'stroke="#f2d9c8" stroke-width="7"');
    b.rect(650, 360, 70, 170, '#d8cdb8'); b.add('<path d="M650,360a35,30 0 0 1 70,0z" fill="#b9ad98"/>');
    b.tree(1300, 530, 1.2, 'round', GOLD); b.tree(130, 535, .9, 'round', AUTUMN);
    b.pave(545, '#e0c9a0', '#c9ae82');
    b.zone('soil', [[110, 650], [560, 615], [700, 680], [640, 800], [250, 840], [100, 770]], { pat: 'pFurrow', c1: '#8b5b3c', c2: '#6a4229' });
    b.zone('grass', [[900, 660], [1200, 612], [1520, 650], [1540, 780], [1260, 870], [940, 810]], { c1: '#c6d68a', c2: '#9ab55f', edge: '#7a954a' });
    b.zone('grass', [[620, 820], [780, 800], [860, 880], [640, 890]], { c1: '#c6d68a', c2: '#9ab55f', edge: '#7a954a' });
  });

  // --- greenhouse ---
  function ghBack(b, tone) {
    b.sky(tone || [[0, '#e3f4ea'], [1, '#f6fbf0']]);
    b.rays(4, '#fff', .35);
    for (var x = 120; x < VW; x += 190) b.bush(x + b.r() * 30, 480, 1.4 + b.r() * .5, '#4f9a5a', '#d8ffd8');
    b.glass(0, 0, VW, 500, 160, 125);
  }
  var POTS = ['#d98a62', '#e5a07e', '#c9744e', '#e8b896'];
  function potRow(b, y, s, xs, off) {
    xs.forEach(function (x, i) { b.pot(x, y, s, POTS[(i + (off || 0)) % POTS.length]); });
  }

  def('Greenhouse Shelves', { persp: [450, 880], kr: [.55, 1.0], fs: .62, count: 16 }, function (b) {
    ghBack(b);
    b.rect(0, 500, VW, 400, b.grad([[0, '#d9d2c3'], [1, '#c2b8a4']])); b.rect(0, 500, VW, 400, 'url(#pTile)');
    // upper + lower shelves
    [[470, 120, 1480], [700, 90, 1510]].forEach(function (s, i) {
      b.rect(s[1], s[0], s[2] - s[1], 20, '#b98a5a'); b.rect(s[1], s[0], s[2] - s[1], 5, '#e0b88a');
      [s[1] + 30, (s[1] + s[2]) / 2, s[2] - 50].forEach(function (lx) { b.rect(lx, s[0] + 20, 14, 170, '#9a6f44'); });
    });
    potRow(b, 468, .78, [300, 480, 660, 840, 1020, 1200, 1380], 0);
    potRow(b, 698, 1.0, [260, 480, 700, 920, 1140, 1360], 1);
    potRow(b, 890, 1.45, [330, 800, 1270], 2);
  });

  def('Greenhouse Floor', { persp: [560, 880], kr: [.5, 1.05], fs: .62, count: 18 }, function (b) {
    ghBack(b, [[0, '#dff3f1'], [1, '#f4faee']]);
    b.rect(0, 500, VW, 400, b.grad([[0, '#d2cbb9'], [1, '#bbb09a']])); b.rect(0, 500, VW, 400, 'url(#pTile)');
    potRow(b, 640, .7, [180, 360, 540, 720, 900, 1080, 1260, 1440], 0);
    potRow(b, 770, .95, [280, 500, 720, 940, 1160, 1380], 1);
    potRow(b, 890, 1.25, [200, 520, 840, 1160, 1480], 2);
  });

  def('Potting Bench', { persp: [450, 880], kr: [.55, 1.0], fs: .66, count: 16 }, function (b) {
    b.rect(0, 0, VW, VH, b.grad([[0, '#ead9bd'], [1, '#d6bf9c']]));
    for (var x = 0; x < VW; x += 80) b.rect(x, 0, 3, 640, '#000', 'opacity=".07"');
    b.rect(160, 120, 300, 300, '#cfe9f2', 'stroke="#fff6e8" stroke-width="16"');
    b.add('<path d="M310,120v300M160,270h300" stroke="#fff6e8" stroke-width="10"/>');
    b.rect(1100, 160, 360, 14, '#b98a5a');
    [1140, 1230, 1330, 1400].forEach(function (x, i) { b.rect(x, 110, 40, 50, ['#93b8a0', '#d8a77a', '#9bb4d0', '#d08a8a'][i]); });
    // bench
    b.rect(120, 600, 1360, 28, '#c79a62'); b.rect(120, 600, 1360, 6, '#e8c49a');
    b.rect(150, 628, 26, 280, '#9a6f44'); b.rect(1424, 628, 26, 280, '#9a6f44'); b.rect(176, 790, 1248, 18, '#a97a4c');
    b.add('<rect x="120" y="880" width="1360" height="30" fill="#000" opacity=".1"/>');
    b.bed(230, 600, 380, 54, 44); b.bed(690, 600, 380, 54, 44); b.bed(1150, 600, 260, 54, 44);
    b.pot(1250, 880, 1.5, '#d98a62'); b.pot(380, 880, 1.4, '#c9744e'); b.pot(820, 880, 1.6, '#e5a07e');
  });

  // --- backyard ---
  def('Backyard Deck', { persp: [590, 880] }, function (b) {
    b.sky(dayCol); b.sun(1250, 160, 56, '#fff4c8'); b.cloud(850, 120, 1, .85);
    b.tree(700, 460, 1.7, 'round', GREEN); b.tree(1050, 470, 1.5, 'round', DEEP); b.tree(1420, 460, 1.7, 'round', GREEN);
    b.pave(520, '#dccfbc', '#c8b9a3', 'pCobble');
    b.fence(560, 1620, 525, 140, '#c9985f', true);
    // house wall + deck
    b.rect(0, 40, 540, 580, '#eadfd0'); for (var y = 80; y < 620; y += 34) b.rect(0, y, 540, 3, '#000', 'opacity=".07"');
    b.rect(60, 160, 170, 190, '#cfe7f3', 'stroke="#fff" stroke-width="10"'); b.rect(300, 330, 150, 290, '#9a6a4a'); b.rect(320, 350, 110, 150, '#cfe7f3', 'stroke="#c9ab8a" stroke-width="4"');
    b.poly([[-40, 640], [560, 612], [680, 900], [-40, 900]], '#c79a62'); b.poly([[-40, 640], [560, 612], [680, 900], [-40, 900]], 'url(#pPlank)');
    b.zone('soil', [[700, 548], [1540, 548], [1560, 592], [680, 592]], { c1: '#7d5439', c2: '#5d3b28' });
    b.zone('grass', [[780, 664], [1050, 620], [1400, 626], [1650, 670], [1660, 900], [800, 900]]);
  });

  def('Raised Garden Beds', { persp: [560, 890], kr: [.45, 1.1], fs: .8, count: 40 }, function (b) {
    b.sky(dayCol); b.cloud(400, 140, 1.2, .9); b.cloud(1150, 100, .9, .8);
    b.tree(150, 450, 1.4, 'round', GREEN); b.tree(1000, 460, 1.3, 'round', GREEN); b.tree(1560, 450, 1.5, 'round', DEEP);
    b.pave(500, '#e0d4c0', '#cbbca5');
    b.fence(0, 1600, 505, 130, '#fffaf6');
    // shed
    b.rect(1250, 300, 270, 210, '#8fae93'); b.poly([[1230, 306], [1385, 230], [1540, 306]], '#6e8a73'); b.rect(1330, 380, 100, 130, '#6a4a34');
    [[200, 345], [630, 345], [1060, 345]].forEach(function (p) { b.bed(p[0], 690, p[1] - 5, 50, 42); });
    b.bed(330, 880, 440, 62, 56); b.bed(830, 880, 440, 62, 56);
  });

  def('Evening Lawn & Swing', { persp: [590, 880] }, function (b) {
    b.sky([[0, '#454a86'], [.5, '#cf88b0'], [1, '#ffc9a0']]); b.sun(1250, 470, 56, '#ffdcae');
    b.cloud(450, 160, 1.2, .35, '#ffc6d4');
    b.tree(210, 520, 1.6, 'round', DUSK); b.tree(1350, 520, 1.5, 'round', DUSK); b.tree(900, 530, 1, 'round', DUSK);
    // swing
    b.add('<path d="M120,330v190M360,330v190M120,330h240M180,330L195,520M300,330L285,520" stroke="#8a6a50" stroke-width="9" fill="none"/>');
    b.rect(195, 490, 90, 12, '#c79a62');
    b.pave(535, '#b9a9bb', '#9b8da3');
    b.fence(0, 1600, 540, 120, '#8a6d5c', true);
    for (var i = 0; i < 24; i++) { var x = i * 70 + 10; b.circ(x, 330 + Math.sin(i / 3) * 24 + 60, 7, '#ffe9a8'); b.circ(x, 330 + Math.sin(i / 3) * 24 + 60, 18, '#ffe9a8', 'opacity=".2"'); }
    b.zone('grass', [[230, 700], [420, 620], [800, 600], [1200, 622], [1420, 700], [1250, 830], [800, 880], [420, 830]], { c1: '#88b97c', c2: '#5e9158', edge: '#497a47' });
  });

  // --- forest ---
  function trunks(b, list, fog) {
    list.forEach(function (t) {
      b.rect(t[0], 0, t[1], t[2], b.grad([[0, '#6d4f38'], [1, '#4b3425']], true));
      b.rect(t[0] + t[1] * .7, 0, t[1] * .3, t[2], '#000', 'opacity=".12"');
      b.ell(t[0] + t[1] / 2, t[2], t[1] * .9, 12, '#000', 'opacity=".2"');
    });
  }
  def('Sunlit Forest Clearing', { persp: [560, 880] }, function (b) {
    b.sky([[0, '#d6efc8'], [1, '#a9d49a']]);
    b.rays(5, '#fff6c8', .16);
    trunks(b, [[40, 100, 560], [330, 70, 520], [640, 60, 500], [1010, 80, 510], [1260, 70, 530], [1470, 130, 570]]);
    b.add('<ellipse cx="800" cy="40" rx="1000" ry="210" fill="#3f7f48"/><ellipse cx="300" cy="130" rx="420" ry="130" fill="#4a8d4f"/><ellipse cx="1300" cy="120" rx="420" ry="140" fill="#4a8d4f"/>');
    b.rect(0, 540, VW, 360, b.grad([[0, '#35553a'], [1, '#27432f']]));
    for (var i = 0; i < 16; i++) b.bush(60 + i * 100, 585 + b.r() * 20, .8 + b.r() * .5, '#3f7a47', '#bfe6b0');
    b.rock(1050, 640, .9); b.log(120, 680, 220, 44);
    b.zone('grass', [[330, 660], [600, 612], [1000, 618], [1260, 665], [1230, 780], [900, 870], [520, 860], [330, 780]], { c1: '#c4e68a', c2: '#8cc45a', edge: '#6aa044' });
    b.zone('grass', [[1330, 760], [1480, 730], [1560, 800], [1440, 870]], { c1: '#a4d176', c2: '#79b252' });
    b.zone('grass', [[60, 790], [210, 775], [270, 850], [110, 886]], { c1: '#a4d176', c2: '#79b252' });
  });

  def('Misty Pine Forest', { persp: [560, 880] }, function (b) {
    b.sky([[0, '#cfe3e6'], [1, '#ecf3ee']]);
    b.treeRow(470, 1.4, ['#8fb0aa', '#a5c3bb'], 'pine', 0, VW + 80, 150);
    b.rect(0, 400, VW, 120, '#eef5f1', 'opacity=".55"');
    b.treeRow(520, 1.5, FOG, 'pine', 20, VW + 80, 210);
    b.rect(0, 440, VW, 120, '#eef5f1', 'opacity=".35"');
    b.tree(130, 600, 1.9, 'pine', PINE); b.tree(1480, 600, 2.0, 'pine', PINE);
    b.rect(0, 580, VW, 320, b.grad([[0, '#36594e'], [1, '#27443c']]));
    b.log(440, 624, 300, 46); b.rock(1160, 650, 1);
    b.zone('grass', [[250, 720], [520, 690], [800, 704], [1000, 740], [900, 840], [560, 880], [300, 830]], { c1: '#a3c98a', c2: '#6f9f5f', edge: '#567f4c' });
    b.zone('soil', [[1080, 720], [1300, 700], [1450, 760], [1360, 850], [1120, 840]], { c1: '#8a6446', c2: '#664630' });
  });

  def('Autumn Woods', { persp: [560, 880] }, function (b) {
    b.sky([[0, '#f7d3a2'], [.6, '#fde9c4'], [1, '#fff5e0']]); b.sun(900, 250, 60, '#fff0c0');
    b.rays(4, '#fff1c0', .14);
    b.treeRow(500, 1.2, AUTUMN, 'round', 0, VW + 80, 200);
    b.treeRow(540, 1.5, GOLD, 'round', 90, VW + 80, 260);
    b.tree(150, 600, 1.8, 'birch', AUTUMN); b.tree(1460, 600, 1.9, 'round', ['#c9561f', '#ee8a3a']);
    b.rect(0, 585, VW, 315, b.grad([[0, '#8a5a30'], [1, '#6e4524']]));
    for (var i = 0; i < 60; i++) b.ell(b.r() * VW, 600 + b.r() * 290, 9, 4, ['#d9822f', '#c9561f', '#f2b255'][i % 3], 'opacity=".55"');
    b.log(1000, 640, 280, 46);
    b.zone('grass', [[250, 700], [560, 650], [900, 660], [1100, 730], [980, 840], [600, 880], [300, 830]], { c1: '#d7c26c', c2: '#a98f3f', edge: '#8a7430' });
    b.zone('soil', [[1180, 780], [1360, 750], [1520, 810], [1420, 880], [1200, 870]], { c1: '#80583a', c2: '#5f3d27' });
  });

  /* ---------- public API ---------- */

  var cache = {};
  g.Scenes = {
    VW: VW, VH: VH,
    list: LIST,
    get: function (i) {
      var s = LIST[i];
      if (!cache[i]) {
        var b = Builder(1000 + i * 77);
        s.draw(b);
        cache[i] = b.build();
      }
      return {
        name: s.name,
        svg: cache[i].svg,
        zones: cache[i].zones,
        persp: s.persp,
        kr: s.kr || [.38, 1.33],
        fs: s.fs || 1,
        count: s.count || 0
      };
    }
  };
})(window);
