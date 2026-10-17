/*
  Local helper server for the flower field.

    npm start        ->  http://localhost:3000

  - serves the static site
  - GET /api/health          what's available (API key? yt-dlp?)
  - GET /api/search?q=...    YouTube Data API v3 search (falls back to `yt-dlp ytsearch` without a key)
  - GET /api/audio?id=...    runs yt-dlp, returns the audio file; the browser keeps it in its own cache

  Secrets live in .env (copy .env.example). The key never reaches the browser.
*/
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;

/* ---------- .env (tiny parser, no dependencies) ---------- */

try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) return;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  });
} catch (e) { /* no .env yet, that's fine */ }

const PORT = parseInt(process.env.PORT, 10) || 3000;
const API_KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const YTDLP = (process.env.YT_DLP_PATH || 'yt-dlp').trim();
const TMP = path.join(os.tmpdir(), 'flower-field-audio');
fs.mkdirSync(TMP, { recursive: true });

const hasKey = API_KEY && API_KEY !== 'your_api_key_here';

/* ---------- helpers ---------- */

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (r.statusCode >= 400) reject(new Error((j.error && j.error.message) || 'YouTube API error ' + r.statusCode));
          else resolve(j);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    let p;
    try { p = spawn(YTDLP, args, { windowsHide: true }); } catch (e) { return reject(e); }
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('error', (e) => reject(e));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').pop() || 'yt-dlp failed'))));
  });
}

function isoToSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

/* ---------- API ---------- */

async function searchApi(q) {
  const s = await getJSON('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
    part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '12', q, key: API_KEY
  }));
  const ids = s.items.map((i) => i.id.videoId).filter(Boolean);
  let dur = {};
  if (ids.length) {
    const v = await getJSON('https://www.googleapis.com/youtube/v3/videos?' + new URLSearchParams({
      part: 'contentDetails', id: ids.join(','), key: API_KEY
    }));
    v.items.forEach((i) => (dur[i.id] = isoToSec(i.contentDetails.duration)));
  }
  const decode = (t) => t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return s.items.filter((i) => i.id.videoId).map((i) => ({
    id: i.id.videoId,
    title: decode(i.snippet.title),
    artist: decode(i.snippet.channelTitle),
    thumb: (i.snippet.thumbnails.medium || i.snippet.thumbnails.default || {}).url || '',
    duration: dur[i.id.videoId] || 0
  }));
}

async function searchYtDlp(q) {
  const out = await runYtDlp(['ytsearch12:' + q, '--flat-playlist', '--dump-json', '--no-warnings']);
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((e) => ({
    id: e.id,
    title: e.title,
    artist: e.channel || e.uploader || '',
    thumb: 'https://i.ytimg.com/vi/' + e.id + '/mqdefault.jpg',
    duration: Math.round(e.duration || 0)
  }));
}

const MIME = { '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

async function sendAudio(res, id) {
  const stamp = id + '-' + Date.now();
  try {
    await runYtDlp([
      '-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--no-part', '--no-warnings',
      '-o', path.join(TMP, stamp + '.%(ext)s'), 'https://www.youtube.com/watch?v=' + id
    ]);
  } catch (e) {
    if (e.code === 'ENOENT') return json(res, 501, { error: 'yt-dlp is not installed (or not on PATH). See README.' });
    return json(res, 502, { error: e.message });
  }
  const file = fs.readdirSync(TMP).find((n) => n.startsWith(stamp + '.'));
  if (!file) return json(res, 502, { error: 'yt-dlp produced no file' });
  const full = path.join(TMP, file), ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': fs.statSync(full).size,
    'Cache-Control': 'no-store'
  });
  const rs = fs.createReadStream(full);
  rs.pipe(res);
  const clean = () => fs.unlink(full, () => {});
  rs.on('close', clean);
  res.on('close', clean);
}

/* ---------- static files ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const HIDDEN = new Set(['server.js', 'package.json', 'package-lock.json', 'readme.md']);

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p === 'node_modules' || HIDDEN.has(p.toLowerCase()))) { res.writeHead(404); return res.end('Not found'); }
  const full = path.join(ROOT, ...parts);
  const ext = path.extname(full).toLowerCase();
  if (!full.startsWith(ROOT) || !TYPES[ext]) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---------- router ---------- */

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/health') {
      let ytdlp = true;
      try { await runYtDlp(['--version']); } catch (e) { ytdlp = false; }
      return json(res, 200, { ok: true, youtubeKey: !!hasKey, ytdlp });
    }
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
      if (!q) return json(res, 400, { error: 'Type something to search for.' });
      let results;
      try {
        results = hasKey ? await searchApi(q) : await searchYtDlp(q);
      } catch (e) {
        if (e.code === 'ENOENT') return json(res, 501, { error: 'No YOUTUBE_API_KEY in .env and yt-dlp is not installed. See README.' });
        return json(res, 502, { error: e.message });
      }
      return json(res, 200, { source: hasKey ? 'youtube-api' : 'yt-dlp', results });
    }
    if (url.pathname === '/api/audio') {
      const id = url.searchParams.get('id') || '';
      if (!/^[\w-]{11}$/.test(id)) return json(res, 400, { error: 'Bad video id' });
      return sendAudio(res, id);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log('\n  Flower field running at http://localhost:' + PORT);
  console.log('  YouTube API key : ' + (hasKey ? 'found' : 'missing  (search will use yt-dlp instead)'));
  console.log('  yt-dlp          : ' + YTDLP + '\n');
});
