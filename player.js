/*
  Music: search (via the local server + yt-dlp), upload, and a small player.
  Every song you play or upload is kept in the browser's Cache Storage, so it
  loads instantly next time and works offline. Only the song list lives in localStorage.
*/
(function (g) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var LIB_KEY = 'field.library.v1', PREF_KEY = 'field.prefs.v1', CACHE = 'field-music-v1';

  var panel = $('panel'), player = $('player'), list = $('list'), form = $('searchForm'), q = $('q');
  var seek = $('seek'), vol = $('vol'), playBtn = $('play');

  var audio = new Audio();
  audio.preload = 'auto';

  var lib = [];            // saved songs [{ id, title, artist, thumb, kind }]
  var results = [];        // last search results
  var cur = -1;            // index in lib of the loaded song
  var curUrl = null;       // object URL for the loaded song
  var tab = 'results';
  var searching = false;
  var searchError = '';
  var searched = false;
  var loading = {};        // ids being fetched from the server
  var mem = {};            // fallback if Cache Storage isn't available
  var seeking = false;
  var prefs = { vol: 70, auto: true };
  var hooks = { toast: function () {}, click: function () {} };

  /* ---------- persistence ---------- */

  try { lib = JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch (e) { lib = []; }
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY)) || {}); } catch (e) { /* defaults */ }

  function saveLib() { try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); } catch (e) { /* full */ } }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }

  var hasCache = 'caches' in window;
  function ckey(id) { return '/__music/' + encodeURIComponent(id); }

  function putBlob(id, blob) {
    if (!hasCache) { mem[id] = blob; return Promise.resolve(); }
    return caches.open(CACHE).then(function (c) {
      return c.put(ckey(id), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
    });
  }
  function getBlob(id) {
    if (mem[id]) return Promise.resolve(mem[id]);
    if (!hasCache) return Promise.resolve(null);
    return caches.open(CACHE).then(function (c) { return c.match(ckey(id)); }).then(function (r) { return r ? r.blob() : null; });
  }
  function delBlob(id) {
    delete mem[id];
    if (!hasCache) return Promise.resolve();
    return caches.open(CACHE).then(function (c) { return c['delete'](ckey(id)); });
  }

  // forget songs whose audio was cleared from the browser cache
  function syncLibrary() {
    if (!hasCache || !lib.length) return render();
    caches.open(CACHE).then(function (c) { return c.keys(); }).then(function (keys) {
      var have = {};
      keys.forEach(function (k) { have[new URL(k.url).pathname] = true; });
      var before = lib.length;
      lib = lib.filter(function (s) { return have[ckey(s.id)]; });
      if (lib.length !== before) saveLib();
      render();
    })['catch'](render);
  }

  /* ---------- helpers ---------- */

  function indexOfId(id) { for (var i = 0; i < lib.length; i++) if (lib[i].id === id) return i; return -1; }
  function mmss(s) {
    if (!s) return '';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var ICON = {
    play: '<svg class="solid" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>'
  };

  function setRange(input) {
    var p = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--p', p + '%');
  }

  /* ---------- list rendering ---------- */

  function row(item, opts) {
    var d = el('div', 'row'), id = opts.id;
    d.setAttribute('role', 'listitem'); d.tabIndex = 0;
    if (opts.now) d.classList.add('now');
    if (loading[id]) d.classList.add('busy');

    var th = el('div', 'thumb');
    th.innerHTML = ICON.note;
    if (item.thumb) {
      var im = new Image(); im.alt = ''; im.src = item.thumb; im.referrerPolicy = 'no-referrer';
      im.onerror = function () { im.remove(); };
      th.appendChild(im);
    }
    var info = el('div', 'info'), t = el('b', '', item.title), s = el('span', '', (item.artist || '') + (item.duration ? ' · ' + mmss(item.duration) : ''));
    if (opts.badge) s.appendChild(el('em', 'badge', opts.badge));
    info.appendChild(t); info.appendChild(s);

    var act = el('button', 'act' + (opts.del ? ' del' : ''));
    act.type = 'button'; act.setAttribute('data-sfx', 'none');
    act.setAttribute('aria-label', opts.del ? 'Remove' : 'Play');
    act.innerHTML = opts.del ? ICON.del : ICON.play;

    d.appendChild(th); d.appendChild(info); d.appendChild(act);
    d.addEventListener('click', function (e) {
      if (opts.del && e.target.closest('.act')) return;
      hooks.click(); opts.play();
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Enter') { hooks.click(); opts.play(); } });
    if (opts.del) {
      act.addEventListener('click', function (e) { e.stopPropagation(); hooks.click(); removeSong(id); });
    }
    return d;
  }

  function message(html, cls) {
    var d = el('div', 'empty' + (cls ? ' ' + cls : ''));
    d.innerHTML = html;
    return d;
  }

  function render() {
    $('libCount').textContent = lib.length;
    $('libCount').hidden = !lib.length;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    list.textContent = '';

    if (tab === 'results') {
      if (searching) return list.appendChild(message('<span class="em">🔍</span>Searching…'));
      if (searchError) return list.appendChild(message('<span class="em">🥀</span>' + searchError, 'err'));
      if (!searched) return list.appendChild(message('<span class="em">🎶</span><b>Search any song</b><br>and it will be saved in your browser for next time.'));
      if (!results.length) return list.appendChild(message('<span class="em">🌧️</span>Nothing found. Try other words.'));
      results.forEach(function (r) {
        var id = 'yt:' + r.id, i = indexOfId(id);
        list.appendChild(row(r, {
          id: id, now: i >= 0 && i === cur, badge: i >= 0 ? 'SAVED' : '',
          play: function () { playResult(r); }
        }));
      });
    } else {
      if (!lib.length) return list.appendChild(message('<span class="em">📼</span><b>No saved songs yet</b><br>Play a search result or upload a file and it shows up here.'));
      lib.forEach(function (s, i) {
        list.appendChild(row(s, {
          id: s.id, now: i === cur, del: true, badge: s.kind === 'up' ? 'UPLOAD' : '',
          play: function () { playIndex(i); }
        }));
      });
    }
  }

  /* ---------- playback ---------- */

  function setBusyUI() {
    var busy = Object.keys(loading).length > 0;
    $('spin').hidden = !busy;
    $('icoPlay').hidden = busy || !audio.paused;
    $('icoPause').hidden = busy || audio.paused;
    player.classList.toggle('playing', !audio.paused);
    playBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }

  function showNow() {
    var s = lib[cur];
    $('title').textContent = s ? s.title : 'Field of Flowers';
    $('sub').textContent = s ? (s.artist || '') : 'Click search to play music';
    player.classList.toggle('has-track', !!s);
    var art = $('art');
    if (s && s.thumb) { art.src = s.thumb; art.hidden = false; $('artPh').hidden = true; art.onerror = function () { art.hidden = true; $('artPh').hidden = false; }; }
    else { art.hidden = true; $('artPh').hidden = false; }
    if ('mediaSession' in navigator && s) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist || '', artwork: s.thumb ? [{ src: s.thumb }] : [] }); } catch (e) { /* ignore */ }
    }
    setBusyUI();
  }

  function playIndex(i) {
    if (i < 0 || i >= lib.length) return;
    var s = lib[i];
    showPlayer();
    return getBlob(s.id).then(function (blob) {
      if (!blob) {
        hooks.toast('That song is no longer in the browser cache');
        lib.splice(i, 1); saveLib(); render();
        return;
      }
      if (curUrl) URL.revokeObjectURL(curUrl);
      curUrl = URL.createObjectURL(blob);
      cur = i;
      audio.src = curUrl;
      showNow(); render();
      return audio.play()['catch'](function () { /* needs a gesture; user can press play */ });
    });
  }

  function addSong(s) {
    var i = indexOfId(s.id);
    if (i >= 0) { lib[i] = s; } else { lib.push(s); i = lib.length - 1; }
    saveLib();
    return i;
  }

  function playResult(r) {
    var id = 'yt:' + r.id, i = indexOfId(id);
    if (i >= 0) return playIndex(i);
    if (loading[id]) return;
    loading[id] = true; render(); setBusyUI();
    hooks.toast('Fetching “' + r.title + '”…');

    fetch('/api/audio?id=' + encodeURIComponent(r.id)).then(function (res) {
      if (!res.ok) return res.json()['catch'](function () { return {}; }).then(function (j) { throw new Error(j.error || 'Download failed (' + res.status + ')'); });
      return res.blob();
    }).then(function (blob) {
      return putBlob(id, blob);
    }).then(function () {
      var idx = addSong({ id: id, title: r.title, artist: r.artist, thumb: r.thumb, kind: 'yt' });
      delete loading[id];
      return playIndex(idx);
    })['catch'](function (e) {
      delete loading[id]; render(); setBusyUI();
      hooks.toast(e instanceof TypeError ? 'Can’t reach the local server. Run npm start.' : e.message);
    });
  }

  function removeSong(id) {
    var i = indexOfId(id);
    if (i < 0) return;
    delBlob(id);
    lib.splice(i, 1); saveLib();
    if (i === cur) { audio.pause(); audio.removeAttribute('src'); cur = -1; showNow(); }
    else if (i < cur) cur--;
    render();
  }

  function toggle() {
    if (cur < 0) {
      if (lib.length) return playIndex(0);
      hooks.toast('Search or upload a song first');
      return setPanel(true);
    }
    if (audio.paused) audio.play()['catch'](function () {}); else audio.pause();
  }
  function step(d) {
    if (!lib.length) return hooks.toast('Search or upload a song first');
    playIndex(cur < 0 ? 0 : (cur + d + lib.length) % lib.length);
  }
  function prev() {
    if (cur >= 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
    step(-1);
  }

  audio.addEventListener('play', setBusyUI);
  audio.addEventListener('pause', setBusyUI);
  audio.addEventListener('timeupdate', function () {
    if (seeking || !audio.duration) return;
    seek.value = audio.currentTime / audio.duration * 1000; setRange(seek);
  });
  audio.addEventListener('ended', function () {
    if (prefs.auto && lib.length) step(1);
    else { seek.value = 0; setRange(seek); setBusyUI(); }
  });
  audio.addEventListener('error', function () { if (audio.src) hooks.toast('Couldn’t play that file'); });

  /* ---------- controls ---------- */

  $('play').addEventListener('click', function () { hooks.click(); toggle(); });
  $('next').addEventListener('click', function () { hooks.click(); step(1); });
  $('prev').addEventListener('click', function () { hooks.click(); prev(); });

  var btnPlayerSearch = $('btnPlayerSearch');
  if (btnPlayerSearch) {
    btnPlayerSearch.addEventListener('click', function () {
      hooks.click();
      setPanel(panel.hidden);
    });
  }

  function applyAuto() {
    var b = $('auto');
    b.classList.toggle('on', !!prefs.auto);
    b.setAttribute('aria-pressed', prefs.auto ? 'true' : 'false');
  }
  $('auto').addEventListener('click', function () {
    hooks.click();
    prefs.auto = !prefs.auto; savePrefs(); applyAuto();
    hooks.toast(prefs.auto ? 'Autoplay on' : 'Autoplay off');
  });

  vol.value = prefs.vol; audio.volume = prefs.vol / 100; setRange(vol);
  vol.addEventListener('input', function () {
    prefs.vol = +vol.value; audio.volume = prefs.vol / 100; setRange(vol); savePrefs();
    $('icoVol').style.opacity = prefs.vol === 0 ? .4 : 1;
  });

  var btnMute = $('btnMute');
  var lastVol = 70;
  if (btnMute) {
    btnMute.addEventListener('click', function () {
      hooks.click();
      if (prefs.vol > 0) {
        lastVol = prefs.vol;
        prefs.vol = 0;
      } else {
        prefs.vol = lastVol || 70;
      }
      vol.value = prefs.vol;
      audio.volume = prefs.vol / 100;
      setRange(vol);
      savePrefs();
      $('icoVol').style.opacity = prefs.vol === 0 ? .4 : 1;
    });
  }

  seek.addEventListener('input', function () { seeking = true; setRange(seek); });
  seek.addEventListener('change', function () {
    if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
    seeking = false;
  });
  setRange(seek);

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', function () { step(1); });
    } catch (e) { /* not supported */ }
  }

  /* ---------- search ---------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = q.value.trim();
    if (!text || searching) return;
    searching = true; searchError = ''; tab = 'results'; render();
    q.blur();

    fetch('/api/search?q=' + encodeURIComponent(text)).then(function (res) {
      return res.json()['catch'](function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || 'Search failed (' + res.status + ')');
        return j;
      });
    }).then(function (j) {
      results = j.results || []; searched = true;
    })['catch'](function (e) {
      searched = true; results = [];
      searchError = (e instanceof TypeError || location.protocol === 'file:')
        ? '<b>Search needs the local server.</b><br>Run <code>npm start</code> and open <code>http://localhost:3000</code>.<br>Uploading music works without it.'
        : e.message;
    }).then(function () { searching = false; render(); });
  });

  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); });
  });

  /* ---------- upload ---------- */

  var fileInput = $('file');
  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []).filter(function (f) { return /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|opus|flac|aac|webm)$/i.test(f.name); });
    fileInput.value = '';
    if (!files.length) return hooks.toast('Pick an audio file');
    var first = -1;
    files.reduce(function (p, f) {
      return p.then(function () {
        var id = 'up:' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        return putBlob(id, f).then(function () {
          var i = addSong({ id: id, title: f.name.replace(/\.[^.]+$/, ''), artist: 'Uploaded', thumb: '', kind: 'up' });
          if (first < 0) first = i;
        });
      });
    }, Promise.resolve()).then(function () {
      hooks.toast(files.length > 1 ? files.length + ' songs added' : 'Song added');
      render();
      return playIndex(first);
    })['catch'](function () { hooks.toast('Couldn’t save that file in the browser'); });
  });

  /* ---------- panel / dock visibility ---------- */

  function showPlayer() { player.hidden = false; }

  function setPanel(open) {
    panel.hidden = !open;
    $('btnSearch').classList.toggle('active', open);
    if ($('btnPlayerSearch')) $('btnPlayerSearch').classList.toggle('active', open);
    if (open) {
      render();
      if (!lib.length || tab === 'results') setTimeout(function () { if (!panel.hidden && window.innerWidth > 700) q.focus(); }, 60);
    }
  }

  g.Player = {
    init: function (h) {
      Object.assign(hooks, h || {});
      applyAuto();
      $('icoVol').style.opacity = prefs.vol === 0 ? .4 : 1;
      player.hidden = false;
      syncLibrary();
    },
    isPanelOpen: function () { return !panel.hidden; },
    togglePanel: function () { setPanel(panel.hidden); return !panel.hidden; },
    closePanel: function () { if (!panel.hidden) setPanel(false); },
    upload: function () { showPlayer(); fileInput.click(); }
  };

  $('panelClose').addEventListener('click', function () { setPanel(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') Player.closePanel(); });
})(window);
