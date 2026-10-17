/* Tiny synthesized sound effects (no audio files needed). */
(function (g) {
  'use strict';

  var ctx = null, master = null;
  var SCALE = [0, 2, 4, 7, 9, 12, 14, 16];     // major pentatonic, so planting always sounds pleasant
  var ROOT = 523.25;                            // C5

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function hz(semi) { return ROOT * Math.pow(2, semi / 12); }

  // one enveloped oscillator
  function tone(freq, t0, dur, o) {
    o = o || {};
    var c = ctx, osc = c.createOscillator(), gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    var v = o.vol == null ? 0.2 : o.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + (o.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // soft burst of filtered noise (soil / whoosh)
  function noise(t0, dur, o) {
    o = o || {};
    var c = ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(), flt = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = buf;
    flt.type = o.type || 'lowpass';
    flt.frequency.setValueAtTime(o.f0 || 600, t0);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    flt.Q.value = o.q || 0.8;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.vol || 0.15, t0 + (o.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(gain); gain.connect(master);
    src.start(t0);
  }

  var Sfx = {
    // unlock audio on the first touch / click (browsers require a gesture)
    unlock: function () { ac(); },

    // UI button
    click: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      tone(980, t, 0.07, { type: 'triangle', to: 700, vol: 0.14 });
      tone(1960, t, 0.04, { vol: 0.04 });
    },

    // a flower going into the soil: soft thud + little bell
    plant: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      noise(t, 0.09, { f0: 700, f1: 200, vol: 0.2 });
      tone(150, t, 0.12, { to: 70, vol: 0.28 });
      var n = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.15 ? 12 : 0), f = hz(n);
      tone(f, t + 0.04, 0.55, { vol: 0.16, attack: 0.006 });
      tone(f * 2.01, t + 0.04, 0.3, { vol: 0.05 });
      tone(f * 3, t + 0.04, 0.16, { type: 'triangle', vol: 0.025 });
    },

    // tapped somewhere flowers can't grow
    nope: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      tone(210, t, 0.14, { type: 'triangle', to: 130, vol: 0.16 });
    },

    // settings menu
    open: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      noise(t, 0.28, { type: 'bandpass', f0: 400, f1: 2400, q: 1.2, vol: 0.09, attack: 0.05 });
      [0, 4, 7].forEach(function (s, i) { tone(hz(s), t + i * 0.05, 0.22, { vol: 0.09, type: 'triangle' }); });
    },
    close: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      noise(t, 0.22, { type: 'bandpass', f0: 2200, f1: 350, q: 1.2, vol: 0.07, attack: 0.03 });
      [7, 4, 0].forEach(function (s, i) { tone(hz(s), t + i * 0.045, 0.16, { vol: 0.07, type: 'triangle' }); });
    },

    // new background: sparkly arpeggio
    swap: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      noise(t, 0.4, { type: 'bandpass', f0: 600, f1: 3000, q: 0.9, vol: 0.08, attack: 0.1 });
      [0, 4, 7, 12, 16].forEach(function (s, i) { tone(hz(s + 7), t + i * 0.06, 0.4, { vol: 0.1 }); });
    },

    // reload flowers: falling shimmer then a little pop-pop-pop
    reload: function () {
      if (!ac()) return;
      var t = ctx.currentTime;
      [16, 12, 9, 7, 4].forEach(function (s, i) { tone(hz(s), t + i * 0.05, 0.25, { vol: 0.09, type: 'triangle' }); });
      for (var i = 0; i < 4; i++) tone(260 + i * 90, t + 0.3 + i * 0.07, 0.1, { to: 120 + i * 40, vol: 0.12 });
    }
  };

  g.Sfx = Sfx;
})(window);
