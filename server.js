const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
// Libuv thread pool — default 4 is too low for concurrent thumbnail + video I/O
process.env.UV_THREADPOOL_SIZE = String(Math.max(8, os.cpus().length * 2));
const ejs = require('ejs');
const http = require('http');

const loki = require('lokijs');

const app = express();
app.set('trust proxy', 1);
const PORT = 7004; // Internal port (Caddy forwards to this)

// Persistent HTTP agent — reuses connections across rapid requests
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 256,
  maxFreeSockets: 128,
  timeout: 60000
});
const IS_PROD = process.env.NODE_ENV === 'production';

const CDN_BASE = '';
const SITE_BASE = 'https://xmelayu.site';
const VIDEO_DIR = 'E:/videos';
const THUMBNAIL_DIR = 'C:/thumbnails';
const INDEX_FILE = path.join(__dirname, 'data', 'video-index.json');
const DESCRIPTIONS_FILE = path.join(__dirname, 'data', 'video-descriptions.json');
const PAGES_FILE = path.join(__dirname, 'data', 'pages.json');
const AD_CONFIG_FILE = path.join(__dirname, 'data', 'ad-config.json');
const VIEWS_FILE = path.join(__dirname, 'data', 'views.json');
const ID_MAP_FILE = path.join(__dirname, 'data', 'id-map.json');
const XAMATEUR_INDEX_FILE = path.join(__dirname, 'data', 'video-index-xamateur.json');
const REAL_INDEX_FILE = path.join(__dirname, 'data', 'video-index-real.json');
const GALLERIES_FILE = path.join(__dirname, 'data', 'real-galleries.json');
const XAMATEUR_VIDEO_DIR = 'C:/Users/User/Desktop/xamateur';
const XAMATEUR_THUMB_DIR = 'C:/Users/User/Desktop/xamateur/thumbnails';
const HERO_CONFIG_FILE = path.join(__dirname, 'data', 'hero-config.json');

// ═══════════════════════════════════════════════════════════════
// LOKIJS DATABASE — crash-safe persistence
// ═══════════════════════════════════════════════════════════════

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const db = new loki(DB_PATH);
let dbVideos, dbMeta;

function initDb() {
  dbVideos = db.getCollection('videos') || db.addCollection('videos');
  dbMeta = db.getCollection('meta') || db.addCollection('meta');
}

function stripMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { $loki, meta, ...rest } = obj;
  return rest;
}

function loadDb() {
  return new Promise(resolve => {
    db.loadDatabase({}, () => { initDb(); resolve(); });
  });
}

function saveDb() {
  return new Promise((resolve, reject) => {
    db.saveDatabase(err => err ? reject(err) : resolve());
  });
}

let _dbDirty = false;
let _dbTimer = null;

function queueDbSave(immediate) {
  if (_dbTimer) clearTimeout(_dbTimer);
  _dbDirty = true;
  _dbTimer = setTimeout(flushDb, immediate ? 200 : 10000);
}

async function flushDb() {
  if (!_dbDirty || !dbVideos) return;
  _dbDirty = false;
  _dbTimer = null;
  try {
    // Sync in-memory data to db collections
    dbVideos.clear();
    for (const v of videos || []) dbVideos.insert({ ...v });
    upsertMeta('views', viewsData);
    await saveDb();
  } catch (e) {
    console.error('\n❌ [DB] Save error:', e.message);
    _dbDirty = true; // retry next time
  }
}

function upsertMeta(key, data) {
  let doc = dbMeta.findOne({ key });
  if (!doc) { doc = { key, data }; dbMeta.insert(doc); }
  else { doc.data = data; dbMeta.update(doc); }
}

// ═══════════════════════════════════════════════════════════════
// STATISTICS & MONITORING
// ═══════════════════════════════════════════════════════════════

const stats = {
  requests: { total: 0, pages: 0, api: 0, static: 0, errors: 0, bots: 0, humans: 0 },
  cache: { hits: 0, misses: 0, indexLoads: 0, rebuilds: 0 },
  performance: { avgResponseTime: 0, responseTimes: [], p95: 0, slowest: { path: '', time: 0 }, fastest: { path: '', time: Infinity } },
  videoDelivery: { ramHits: 0, ssdHits: 0, hddReads: 0 },
  recentRequests: [],
  startTime: Date.now()
};

// ═══════════════════════════════════════════════════════════════
// MICRO CACHE — multi-purpose in-memory cache (L1)
// Stores thumbnails and CSS files in RAM.
// Capacitor effect: once cached, HDD is never touched again.
// ═══════════════════════════════════════════════════════════════

const microCache = {
  store: new Map(),
  maxSize: 5000,
  hits: 0, misses: 0, reads: 0,
  has(key) { return this.store.has(key); },
  get(key) { this.reads++; if (this.store.has(key)) { this.hits++; return this.store.get(key); } this.misses++; return null; },
  set(key, val) {
    if (this.store.size >= this.maxSize) {
      const k = this.store.keys().next().value;
      this.store.delete(k);
    }
    this.store.set(key, val);
  },
  get size() { return this.store.size; },
  delete(key) { this.store.delete(key); }
};

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER — protects HDD from request storms
// ═══════════════════════════════════════════════════════════════

const rlStore = new Map();
const RL_WINDOW = 60000;
const RL_MAX = 10000;
const RL_STATIC_MAX = 50000;
setInterval(() => { const now = Date.now(); for (const [ip, ts] of rlStore) { const f = ts.filter(t => now - t < RL_WINDOW); f.length ? rlStore.set(ip, f) : rlStore.delete(ip); } }, 60000);

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  const now = Date.now();
  if (!rlStore.has(ip)) rlStore.set(ip, []);
  const arr = rlStore.get(ip).filter(t => now - t < RL_WINDOW);
  const max = req.path.match(/\.\w+$/) ? RL_STATIC_MAX : RL_MAX;
  if (arr.length >= max) return res.status(429).send('Rate limit exceeded — too many requests');
  arr.push(now);
  rlStore.set(ip, arr);
  next();
}

const BOT_PATTERNS = [
  /googlebot/i, /bingbot/i, /yandex/i, /baiduspider/i, /slurp/i, /duckduckbot/i,
  /facebookexternalhit/i, /linkedinbot/i, /whatsapp/i, /telegrambot/i, /applebot/i,
  /crawl/i, /spider/i, /robot/i, /scraper/i, /mediapartners/i
];

function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.socket?.remoteAddress || 
         'unknown';
}

function detectDevice(userAgent) {
  if (!userAgent) return 'Unknown';
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return '📱';
  if (/tablet|ipad/i.test(userAgent)) return '📲';
  return '💻';
}

function logRequest(req, res, responseTime) {
  const isBotReq = isBot(req.get('User-Agent'));
  const isApi = req.path.startsWith('/api');
  const isStatic = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/i.test(req.path);
  
  stats.requests.total++;
  if (isBotReq) stats.requests.bots++;
  else stats.requests.humans++;
  if (isApi) stats.requests.api++;
  else if (isStatic) stats.requests.static++;
  else stats.requests.pages++;
  if (res.statusCode >= 400) stats.requests.errors++;
  
  stats.performance.responseTimes.push(responseTime);
  if (stats.performance.responseTimes.length > 100) stats.performance.responseTimes.shift();
  stats.performance.avgResponseTime = stats.performance.responseTimes.reduce((a, b) => a + b, 0) / stats.performance.responseTimes.length;
  
  if (responseTime > stats.performance.slowest.time) stats.performance.slowest = { path: req.path, time: responseTime };
  if (responseTime < stats.performance.fastest.time) stats.performance.fastest = { path: req.path, time: responseTime };
  
  stats.recentRequests.unshift({
    time: new Date().toISOString(),
    path: req.path,
    status: res.statusCode,
    duration: responseTime,
    ip: getClientIP(req),
    isBot: isBotReq
  });
  if (stats.recentRequests.length > 20) stats.recentRequests.pop();
  
  let statusIcon = '✅';
  if (res.statusCode >= 500) statusIcon = '💥';
  else if (res.statusCode >= 400) statusIcon = '⚠️';
  
  const typeIcon = isBotReq ? '🤖' : (isApi ? '⚡' : (isStatic ? '📄' : '👤'));
  const deviceIcon = detectDevice(req.get('User-Agent'));
  
  console.log(`${statusIcon} ${typeIcon} ${deviceIcon} ${req.method.padEnd(6)} ${req.path.padEnd(35)} ${res.statusCode} ${responseTime.toFixed(1)}ms`);
}

// ═══════════════════════════════════════════════════════════════
// CACHE-BUST VERSION
// ═══════════════════════════════════════════════════════════════

let CACHE_VERSION = Date.now();
app.locals.cacheVersion = CACHE_VERSION;
app.locals.siteBase = SITE_BASE;

function bumpVersion() {
  CACHE_VERSION = Date.now();
  app.locals.cacheVersion = CACHE_VERSION;
  console.log(`\n🔁 [VERSION] Bumped to v${CACHE_VERSION}\n`);
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logRequest(req, res, Date.now() - start));
  next();
});

// ═══════════════════════════════════════════════════════════════
// 📊 GOOGLE ANALYTICS — auto-injected before </head> on every page
// ═══════════════════════════════════════════════════════════════
const GA_SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PMWBHF9XY6"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-PMWBHF9XY6', { send_page_view: true });
</script>`;

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(body) {
    if (typeof body === 'string' && body.includes('</head>')) {
      body = body.replace('</head>', GA_SNIPPET + '\n</head>');
    }
    return originalSend.call(this, body);
  };
  next();
});

app.use(rateLimit);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('X-Robots-Tag', 'index, follow, max-snippet:-1');
  res.header('Referrer-Policy', 'no-referrer-when-downgrade');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.header('X-DNS-Prefetch-Control', 'on');
  res.header('X-Cache-Version', String(CACHE_VERSION));
  if (req.path.startsWith('/api/')) {
    res.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
  } else if (!req.path.match(/\.\w+$/)) {
    res.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  }
  next();
});

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 0
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (IS_PROD) app.enable('view cache');
// Serve actual favicon.ico
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
// L1: CSS served from RAM cache — zero disk hits after first request
app.use((req, res, next) => {
  if (!req.path.startsWith('/css/') || !req.path.endsWith('.css')) return next();
  const cached = microCache.get(req.path);
  if (cached) { res.type('text/css'); res.set('Cache-Control', 'public, max-age=604800'); return res.send(cached); }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true, lastModified: true }));

// ═══════════════════════════════════════════════════════════════
// RAM CHUNK CACHE — first 5MB of hot videos in process memory
// Protects HDD from random seeks during preview scrubs & initial playback
// ═══════════════════════════════════════════════════════════════

const RAM_CHUNK_MAX = 200 * 1024 * 1024;
const RAM_CHUNK_SIZE = 5 * 1024 * 1024;
const ramChunkCache = new Map();
let ramChunkUsed = 0;
const RAM_CHUNK_EVICT_PCT = 0.3;

function evictRamChunks(needed) {
  const sorted = [...ramChunkCache.entries()].sort((a, b) => a[1].atime - b[1].atime);
  let freed = 0;
  const target = Math.max(needed, ramChunkUsed * RAM_CHUNK_EVICT_PCT);
  for (const [name, meta] of sorted) {
    if (freed >= target) break;
    ramChunkCache.delete(name);
    ramChunkUsed -= meta.data.length;
    freed += meta.data.length;
  }
}

async function getRamChunk(filename, hddPath) {
  const hit = ramChunkCache.get(filename);
  if (hit) { hit.atime = Date.now(); return hit.data; }
  try {
    const fd = await fsp.open(hddPath, 'r');
    const buf = Buffer.alloc(RAM_CHUNK_SIZE);
    const { bytesRead } = await fd.read(buf, 0, RAM_CHUNK_SIZE, 0);
    await fd.close();
    const data = buf.subarray(0, bytesRead);
    if (ramChunkUsed + data.length > RAM_CHUNK_MAX) evictRamChunks(data.length);
    ramChunkCache.set(filename, { data, atime: Date.now() });
    ramChunkUsed += data.length;
    return data;
  } catch { return null; }
}

// Sponge cache — pre-buffer top N videos at startup into RAM chunk pool
// Uses idle setImmediate loop so it doesn't block server readiness
async function preloadSpongeCache() {
  const poolMax = Math.floor(RAM_CHUNK_MAX / RAM_CHUNK_SIZE);
  const candidates = [...videos].sort((a, b) => b.views - a.views).slice(0, poolMax);
  console.log(`⚡ [SPONGE] Pre-buffering top ${candidates.length} videos into RAM...`);
  let loaded = 0;
  for (const v of candidates) {
    await new Promise(r => setImmediate(r));
    const fname = path.basename(v.video);
    const hddPath = path.join(VIDEO_DIR, fname);
    try { await fsp.stat(hddPath); } catch { continue; }
    const chunk = await getRamChunk(fname, hddPath);
    if (chunk) loaded++;
    if (ramChunkUsed >= RAM_CHUNK_MAX) break;
  }
  console.log(`⚡ [SPONGE] ${loaded} chunks cached (${(ramChunkUsed / 1e6).toFixed(0)} MB / ${(RAM_CHUNK_MAX / 1e6).toFixed(0)} MB)`);
}

// SSD capacitor promotion queue — isolates HDD→SSD copies from playback I/O
// Only 1 promotion at a time; each starts on setImmediate to yield the event loop
const promoQueue = [];
let promoBusy = false;

async function processPromoQueue() {
  if (promoBusy || promoQueue.length === 0) return;
  promoBusy = true;
  const { filename, hddPath, st } = promoQueue.shift();
  const tmp = path.join(HOT_CACHE_DIR, filename + '.tmp');
  const dest = path.join(HOT_CACHE_DIR, filename);
  try {
    if (hotCacheUsed + st.size > HOT_CACHE_MAX)
      await evictLeastRecent(Math.min(st.size + HOT_CACHE_EVICT_TARGET, hotCacheUsed));
    if (hotCacheUsed + st.size > HOT_CACHE_MAX) { promoBusy = false; processPromoQueue(); return; }
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(hddPath, { highWaterMark: 65536 });
      const ws = fs.createWriteStream(tmp);
      rs.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
      rs.on('error', reject);
    });
    await fsp.rename(tmp, dest);
    hotCache.set(filename, { size: st.size, atime: Date.now() });
    hotCacheUsed += st.size;
  } catch { await fsp.unlink(tmp).catch(() => {}); }
  promoBusy = false;
  setImmediate(processPromoQueue);
}

function queuePromoteToHot(filename, hddPath, st) {
  promoQueue.push({ filename, hddPath, st });
  setImmediate(processPromoQueue);
}

// I/O Debouncer — "Surge Protector" for HDD
// When a user frantically scrubs, the browser sends many range requests/sec.
// This delays HDD reads by 80ms — if the client aborts (req.close) within
// that window, the disk is never touched. Only linear, isolated reads survive.
const IO_DEBOUNCE_MS = 80;
function debounceStream(req, res, fn) {
  let cancelled = false;
  const onClose = () => { cancelled = true; };
  req.on('close', onClose);
  const timer = setTimeout(() => {
    req.removeListener('close', onClose);
    if (!cancelled) fn();
  }, IO_DEBOUNCE_MS);
  res.on('finish', () => { clearTimeout(timer); });
}

// ═══════════════════════════════════════════════════════════════
// VIDEO STREAMING — HDD + SSD capacitor cache (20GB)
// Behaves like a voltage stabilizer / capacitor:
//   - Fills on first hit (charging)
//   - When full, evicts oldest-least-recently-watched (leak)
//   - Always has headroom for surge traffic
//   - NOT a hoarder — content cycles naturally
// ═══════════════════════════════════════════════════════════════

const HOT_CACHE_DIR = path.join(os.tmpdir(), 'hot-cache');
const HOT_CACHE_MAX = 20 * 1024 * 1024 * 1024; // 20GB
const HOT_CACHE_EVICT_TARGET = 2 * 1024 * 1024 * 1024; // free 2GB on eviction
const hotCache = new Map(); // filename -> { size, atime }
let hotCacheUsed = 0;

(async () => {
  await fsp.rm(path.join(os.tmpdir(), 'video-cache'), { recursive: true, force: true });
  await fsp.mkdir(HOT_CACHE_DIR, { recursive: true }).catch(() => {});
  const files = await fsp.readdir(HOT_CACHE_DIR).catch(() => []);
  for (const f of files) {
    try {
      const st = await fsp.stat(path.join(HOT_CACHE_DIR, f));
      hotCache.set(f, { size: st.size, atime: st.atimeMs || st.mtimeMs });
      hotCacheUsed += st.size;
    } catch {}
  }
  if (hotCache.size) console.log(`⚡ [CAPACITOR CACHE] ${(hotCacheUsed / 1e9).toFixed(1)} GB / ${(HOT_CACHE_MAX / 1e9).toFixed(0)} GB (${hotCache.size} files) — always cycling`);
})();

async function evictLeastRecent(neededSpace) {
  const sorted = [...hotCache.entries()].sort((a, b) => a[1].atime - b[1].atime);
  let freed = 0;
  for (const [name, meta] of sorted) {
    if (freed >= neededSpace) break;
    try {
      await fsp.unlink(path.join(HOT_CACHE_DIR, name));
      hotCache.delete(name);
      hotCacheUsed -= meta.size;
      freed += meta.size;
    } catch {}
  }
  if (freed > 0) console.log(`⚡ [CAPACITOR] Evicted ${(freed / 1e9).toFixed(2)} GB to make room`);
}

async function promoteToHot(filename, hddPath) {
  if (hotCache.has(filename)) {
    hotCache.get(filename).atime = Date.now();
    return;
  }
  try {
    const st = await fsp.stat(hddPath);
    queuePromoteToHot(filename, hddPath, st);
  } catch {}
}

app.use('/videos', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();
  const hddPath = path.join(VIDEO_DIR, filename);
  let stat;
  try { stat = await fsp.stat(hddPath); } catch { return next(); }

  // RAM chunk cache: serve first 5MB from process memory (zero HDD seek)
  const range = req.headers.range;
  const rangeStart = range ? parseInt(range.replace(/bytes=/, '').split('-')[0], 10) : 0;
  if (range && rangeStart < RAM_CHUNK_SIZE) {
    const chunk = await getRamChunk(filename, hddPath);
    if (chunk) {
      const rangeEnd = parseInt(range.replace(/bytes=/, '').split('-')[1], 10) || Math.min(rangeStart + RAM_CHUNK_SIZE, stat.size) - 1;
      const end = Math.min(rangeEnd, stat.size - 1);
      const slice = chunk.subarray(rangeStart, Math.min(end + 1, chunk.length));
      if (slice.length > 0 && slice.length < stat.size) {
        stats.videoDelivery.ramHits++;
        res.status(206);
        res.set({
          'Content-Range': `bytes ${rangeStart}-${end}/${stat.size}`,
          'Content-Length': slice.length,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=604800'
        });
        return res.end(slice);
      }
    }
  }

  if (hotCache.has(filename)) {
    stats.videoDelivery.ssdHits++;
    hotCache.get(filename).atime = Date.now();
    try {
      return res.sendFile(path.join(HOT_CACHE_DIR, filename), {
        headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' }
      });
    } catch { hotCache.delete(filename); }
  }

  // HDD read — debounced: if client aborts within 80ms, disk is never touched
  stats.videoDelivery.hddReads++;
  debounceStream(req, res, () => {
    const streamTimeout = setTimeout(() => { if (typeof rs !== 'undefined') rs.destroy(); res.end(); }, 15000);
    const rs = range
      ? (() => {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          res.status(206);
          res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' });
          return fs.createReadStream(hddPath, { start, end });
        })()
      : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' }), fs.createReadStream(hddPath));
    rs.pipe(res);
    rs.on('error', () => { clearTimeout(streamTimeout); res.end(); });
    res.on('close', () => { clearTimeout(streamTimeout); rs.destroy(); });
    promoteToHot(filename, hddPath);
  });
});
// Thumbnails — served from micro-cache first, then disk.
// Caddy also handles these (see Caddyfile), but Express keeps a fallback
// so the site works even when Caddy isn't running.
const THUMBNAIL_PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect fill="#1a1a1e" width="320" height="240"/><rect fill="#2a2a30" x="120" y="80" width="80" height="80" rx="16"/><polygon fill="#6b6b75" points="145,95 145,145 175,120"/></svg>');

function thumbnailCache(dirs) {
  return (req, res, next) => {
    const filename = path.basename(req.path);
    if (!filename.match(/\.(jpg|jpeg|png|webp)$/i)) return next();
    const cached = microCache.get(filename);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=604800');
      res.type(path.extname(filename));
      return res.send(cached);
    }
    const headers = { 'Cache-Control': 'public, max-age=604800' };
    (function tryDir(i) {
      if (i >= dirs.length) {
        microCache.set(filename, THUMBNAIL_PLACEHOLDER);
        res.type('image/svg+xml');
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(THUMBNAIL_PLACEHOLDER);
      }
      const fp = path.join(dirs[i], filename);
      fsp.readFile(fp).then(buf => {
        microCache.set(filename, buf);
        res.set(headers);
        res.type(path.extname(filename));
        res.send(buf);
      }).catch(() => tryDir(i + 1));
    })(0);
  };
}

app.use('/thumbnails', thumbnailCache([THUMBNAIL_DIR]));
app.use('/xamateur/thumbnails', thumbnailCache([XAMATEUR_THUMB_DIR]));

// xMateur video streaming
app.use('/xamateur/videos', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();
  const hddPath = path.join(XAMATEUR_VIDEO_DIR, filename);
  let stat;
  try { stat = await fsp.stat(hddPath); } catch { return next(); }

  // RAM chunk cache
  const range = req.headers.range;
  const rangeStart = range ? parseInt(range.replace(/bytes=/, '').split('-')[0], 10) : 0;
  if (range && rangeStart < RAM_CHUNK_SIZE) {
    const chunk = await getRamChunk(filename, hddPath);
    if (chunk) {
      const rangeEnd = parseInt(range.replace(/bytes=/, '').split('-')[1], 10) || Math.min(rangeStart + RAM_CHUNK_SIZE, stat.size) - 1;
      const end = Math.min(rangeEnd, stat.size - 1);
      const slice = chunk.subarray(rangeStart, Math.min(end + 1, chunk.length));
      if (slice.length > 0 && slice.length < stat.size) {
        stats.videoDelivery.ramHits++;
        res.status(206);
        res.set({ 'Content-Range': `bytes ${rangeStart}-${end}/${stat.size}`, 'Content-Length': slice.length, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' });
        return res.end(slice);
      }
    }
  }

  if (hotCache.has(filename)) {
    stats.videoDelivery.ssdHits++;
    try { return res.sendFile(path.join(HOT_CACHE_DIR, filename), { headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' } }); }
    catch { hotCache.delete(filename); }
  }
  // HDD read — debounced
  stats.videoDelivery.hddReads++;
  debounceStream(req, res, () => {
    const streamTimeout = setTimeout(() => { if (typeof rs !== 'undefined') rs.destroy(); res.end(); }, 15000);
    const rs = range
      ? (() => { const parts = range.replace(/bytes=/, '').split('-'); const start = parseInt(parts[0], 10); const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1; res.status(206); res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' }); return fs.createReadStream(hddPath, { start, end }); })()
      : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' }), fs.createReadStream(hddPath));
    rs.pipe(res);
    rs.on('error', () => { clearTimeout(streamTimeout); res.end(); });
    res.on('close', () => { clearTimeout(streamTimeout); rs.destroy(); });
    promoteToHot(filename, hddPath);
  });
});

const nlp = require('./utils/nlp');
const SEOGenerator = require('./utils/seo-generator');
const seo = new SEOGenerator({ siteName: 'Lucahman', siteUrl: SITE_BASE });
let videos = [];
let videosById = new Map();
let xmateurVideos = [];
let realVideos = [];
let realGalleries = [];
function rebuildVideosIndex() {
  const m = new Map();
  for (const v of videos) if (v.id) m.set(v.id, v);
  videosById = m;
}
let videoDescriptions = {};
let idMap = {};          // fingerprint → { id, name, title, views, likes, uploaded, category, subTags, keywords }
let redirectMap = {};    // oldFilename → newFilename (populated on scan)

async function loadDescriptions() {
  try {
    const data = await fsp.readFile(DESCRIPTIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    videoDescriptions = parsed.descriptions || {};
    console.log(`\n📝 [DESCRIPTIONS] Loaded ${Object.keys(videoDescriptions).length} video descriptions\n`);
  } catch (err) {
    console.log(`\n⚠️  [DESCRIPTIONS] Could not load descriptions: ${err.message}\n`);
    videoDescriptions = {};
  }
}

function loadXmateurIndex() {
  try {
    const data = fs.readFileSync(XAMATEUR_INDEX_FILE, 'utf8');
    xmateurVideos = JSON.parse(data);
    for (const v of xmateurVideos) {
      const idBase = path.basename(v.id, path.extname(v.id));
      if (!v.thumbnail) v.thumbnail = '/xamateur/thumbnails/' + encodeURIComponent(idBase) + '.jpg';
      const videoFile = v.video ? path.basename(v.video) : encodeURIComponent(v.title) + '.mp4';
      v.video = '/xamateur/videos/' + videoFile;
    }
    console.log(`🌎 [XAMATEUR] Loaded ${xmateurVideos.length} xMateur videos`);
  } catch { xmateurVideos = []; }
}
function loadRealIndex() {
  try {
    const data = fs.readFileSync(REAL_INDEX_FILE, 'utf8');
    realVideos = JSON.parse(data);
    for (const v of realVideos) {
      const base = path.basename(v.id, path.extname(v.id));
      if (!v.thumbnail) v.thumbnail = '/xamateur/thumbnails/' + encodeURIComponent(base) + '.jpg';
    }
    console.log(`📱 [XAMATEUR REAL] Loaded ${realVideos.length} real videos`);
  } catch { realVideos = []; }
  try {
    realGalleries = JSON.parse(fs.readFileSync(GALLERIES_FILE, 'utf8'));
  } catch { realGalleries = []; }
}

async function loadIdMap() {
  try { idMap = JSON.parse(await fsp.readFile(ID_MAP_FILE, 'utf8')); }
  catch { idMap = {}; }
}
async function saveIdMap() {
  await fsp.writeFile(ID_MAP_FILE, JSON.stringify(idMap, null, 2));
}
function getFingerprint(st) {
  return `${st.size}:${st.birthtimeMs || st.mtimeMs}`;
}

// ═══════════════════════════════════════════════════════════════
// VIDEO INDEX
// ═══════════════════════════════════════════════════════════════

let viewsData = {};

async function loadViews() {
  try {
    viewsData = JSON.parse(await fsp.readFile(VIEWS_FILE, 'utf8'));
  } catch { viewsData = {}; }
}

async function saveViews() {
  queueDbSave();
}

function getViews(id) {
  return viewsData[id] || { views: 0, likes: 0 };
}

async function loadIndex() {
  try {
    const start = Date.now();

    // Try database first
    await loadDb();
    if (dbVideos.count() > 0) {
      videos = dbVideos.find().map(stripMeta);
      rebuildVideosIndex();
      // Load meta
      const vDoc = dbMeta.findOne({ key: 'views' });
      if (vDoc) viewsData = vDoc.data || {};
      // Seed viewsData from videos if needed (first-run migration)
      for (const v of videos) {
        if (!viewsData[v.id]) viewsData[v.id] = { views: v.views || 0, likes: v.likes || 0 };
      }
      const duration = Date.now() - start;
      stats.cache.indexLoads++;
      stats.cache.hits++;
      console.log(`\n💾 [DB] Loaded ${videos.length} videos in ${duration}ms\n`);
      return videos;
    }

    // Fallback to JSON file
    await loadViews();
    const data = await fsp.readFile(INDEX_FILE, 'utf8');
    videos = JSON.parse(data);
    rebuildVideosIndex();
    for (const v of videos) {
      const stored = viewsData[v.id];
      if (stored) { v.views = stored.views; v.likes = stored.likes; }
      else { viewsData[v.id] = { views: v.views, likes: v.likes }; }
    }
    const duration = Date.now() - start;
    stats.cache.indexLoads++;
    stats.cache.hits++;
    console.log(`\n💾 [CACHE] Loaded ${videos.length} videos in ${duration}ms (${(Buffer.byteLength(data, 'utf8') / 1024 / 1024).toFixed(2)} MB)\n`);
    return videos;
  } catch {
    console.log('\n⚠️  [CACHE] No index found, building...\n');
    stats.cache.misses++;
    return await buildIndex();
  }
}

async function buildIndex() {
  try {
    const start = Date.now();
    await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    const files = await fsp.readdir(VIDEO_DIR);
    const newVideos = [];
    const newIdMap = {};
    const newRedirects = {};
    let matched = 0;
    let added = 0;

    for (const file of files) {
      if (!/\.(mp4|webm|ogg|mov)$/i.test(file)) continue;
      const baseName = path.basename(file, path.extname(file));
      let st;
      try { st = await fsp.stat(path.join(VIDEO_DIR, file)); } catch { continue; }
      const fp = getFingerprint(st);
      const existing = idMap[fp];

      if (existing) {
        matched++;
        if (existing.id !== baseName) {
          newRedirects[existing.id] = baseName;
        }
        const cat = nlp.categorizeVideo(baseName);
        const kw = nlp.extractKeywords(baseName);
        const stored = getViews(baseName);
        const entry = {
          id: baseName,
          name: existing.name || baseName.replace(/[-_]+/g, ' '),
          title: existing.title || baseName.replace(/[-_]+/g, ' '),
          video: `${CDN_BASE}/videos/${encodeURIComponent(baseName)}.mp4`,
          thumbnail: `${CDN_BASE}/thumbnails/${encodeURIComponent(baseName)}.jpg`,
          views: stored.views || existing.views || 0,
          likes: stored.likes || existing.likes || 0,
          uploaded: existing.uploaded || new Date().toISOString(),
          category: cat.category,
          subTags: cat.subTags,
          keywords: kw.all
        };
        newVideos.push(entry);
        // Preserve fingerprint but update id (current filename)
        newIdMap[fp] = { ...existing, id: baseName };
      } else {
        added++;
        const cat = nlp.categorizeVideo(baseName);
        const kw = nlp.extractKeywords(baseName);
        const stored = getViews(baseName);
        const entry = {
          id: baseName,
          name: baseName.replace(/[-_]+/g, ' '),
          title: baseName.replace(/[-_]+/g, ' '),
          video: `${CDN_BASE}/videos/${encodeURIComponent(baseName)}.mp4`,
          thumbnail: `${CDN_BASE}/thumbnails/${encodeURIComponent(baseName)}.jpg`,
          views: stored.views,
          likes: stored.likes,
          uploaded: new Date().toISOString(),
          category: cat.category,
          subTags: cat.subTags,
          keywords: kw.all
        };
        newVideos.push(entry);
        newIdMap[fp] = {
          id: baseName,
          name: entry.name,
          title: entry.title,
          views: stored.views,
          likes: stored.likes,
          uploaded: entry.uploaded,
          category: cat.category,
          subTags: cat.subTags,
          keywords: kw.all
        };
      }
    }

    videos = newVideos;
    idMap = newIdMap;
    redirectMap = { ...redirectMap, ...newRedirects };
    rebuildVideosIndex();
    await Promise.all([
      fsp.writeFile(INDEX_FILE, JSON.stringify(videos, null, 2)),
      saveIdMap()
    ]);
    queueDbSave(true);
    const duration = Date.now() - start;
    stats.cache.rebuilds++;
    console.log(`\n✅ [BUILD] Indexed ${videos.length} videos (${matched} matched, ${added} new) in ${duration}ms\n`);
    if (Object.keys(newRedirects).length) {
      console.log(`🔀 [REDIRECT] ${Object.keys(newRedirects).length} filenames changed, redirect map updated\n`);
    }
    return videos;
  } catch (error) {
    console.error(`\n❌ [ERROR] ${error.message}\n`);
    return videos;
  }
}

function getCategories() {
  const cats = {};
  for (const v of videos) cats[v.category] = (cats[v.category] || 0) + 1;
  return Object.entries(cats).sort((a, b) => b[1] - a[1]);
}

function getTags() {
  const tagCount = {};
  for (const v of videos) for (const tag of v.subTags) tagCount[tag] = (tagCount[tag] || 0) + 1;
  return Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([tag, count]) => ({ tag, count }));
}

// ═══════════════════════════════════════════════════════════════
// CMS — Page Content Management
// ═══════════════════════════════════════════════════════════════

let pageContent = {};

async function loadPages() {
  try { pageContent = JSON.parse(await fsp.readFile(PAGES_FILE, 'utf8')); }
  catch { pageContent = {}; }
}

async function savePages() {
  await fsp.writeFile(PAGES_FILE, JSON.stringify(pageContent, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// CMS — Ad Configuration
// ═══════════════════════════════════════════════════════════════

let adConfig = { vastUrl: '', vastFallbackUrl: '', vastRotation: [], banners: [], refreshInterval: 300, pipAds: { left: '', right: '' } };
let heroConfig = {};

async function loadAdConfig() {
  try { adConfig = JSON.parse(await fsp.readFile(AD_CONFIG_FILE, 'utf8')); }
  catch { adConfig = { vastUrl: '', vastFallbackUrl: '', vastRotation: [], banners: [], refreshInterval: 300, pipAds: { left: '', right: '' } }; }
}

async function saveAdConfig() {
  await fsp.writeFile(AD_CONFIG_FILE, JSON.stringify(adConfig, null, 2));
  console.log('💾 [AD CONFIG] Saved');
}
function getDefaultHeroConfig() {
  return { badge:'Super X Melayu', h1:'Super X Melayu Malay Pron — Seks Awek Tudung Lucah', h1Sub:'Malaysian Chinese xx amateur xxx-matuer xamatuer melayu x www video rakam bilik terkini', subtitle:'Curated Asian Amateur Porn — xMateur xAmateur xx Amateur Asian Collection', nicheTags:[{label:'Amateur',cls:'p'},{label:'Asian',cls:'b'},{label:'xMateur',cls:'l'},{label:'xAmateur',cls:'s'}], ctaButtons:[{href:'/',label:'🇲🇾 FULL GALLERY',cls:'super-x-btn'},{href:'/?sort=views',label:'🔥 TRENDING NOW',cls:'super-x-btn super-x-btn-alt'},{href:'#feed-start',label:'🎬 BROWSE VIDEOS',cls:'super-x-btn super-x-btn-alt',style:'background:linear-gradient(135deg,#8e2de2,#4a00e0);box-shadow:0 4px 25px rgba(142,45,226,0.4)',onclick:"document.getElementById('videoFeed').querySelector('.section')?.scrollIntoView({behavior:'smooth'});return false"}], keywordTags:[{q:'xmateur',label:'#xMateur'},{q:'xamateur',label:'#xAmateur'},{q:'x+amateur',label:'#X Amateur'},{q:'amateur+porn',label:'#AmateurPorn'},{q:'asian+amateur+porn',label:'#AsianAmateurPorn'},{q:'xx+amateur+asian',label:'#xxAmateurAsian'},{q:'amateur+asian',label:'#AmateurAsian'},{q:'amateur+porn+site',label:'#AmateurPornSite'},{q:'real+amateur+porn',label:'#RealAmateurPorn'},{q:'asian+homemade',label:'#AsianHomemade'},{q:'super+x+melayu+malay+pron',label:'#SuperXMelayuMalayPron'},{q:'melayu+x+www',label:'#MelayuXwww'},{q:'seks+awek',label:'#SeksAwek'},{q:'video+rakam+bilik',label:'#VideoRakamBilik'},{q:'tudung+terkini',label:'#TudungTerkini'},{q:'lucah+malay',label:'#LucahMalay'},{q:'malaysian+chinese+xx',label:'#MalaysianChineseXX'},{q:'xxx-matuer',label:'#XXXMatuer'},{q:'xamatuer',label:'#Xamatuer'},{q:'xmatuer',label:'#xMatuer'},{q:'xxamatuer',label:'#xxAmatuer'},{q:'xxmateur',label:'#xxMateur'},{q:'x-mateur',label:'#x-Mateur'},{q:'x-matuer',label:'#x-Matuer'},{q:'malay+pron',label:'#MalayPron'},{q:'melayu+pron',label:'#MelayuPron'},{q:'bokep+malay',label:'#BokepMalay'},{q:'xxx+malay',label:'#XXXMalay'}], seoLinks:[{href:'/super-x-melayu',title:'Super X Melayu Malay Pron - xMelayu.Online seks awek tudung lucah',label:'Super X Melayu Malay Pron'},{href:'/?q=xmelayu',title:'xmelayu x melayu xx melayu xmalay x malay xMelayu.Online',label:'xmelayu'},{href:'/?q=x+mateur',title:'x mateur x matuer x amatuer xMelayu.Online',label:'x mateur'},{href:'/?q=xmatuer',title:'xmatuer xmateur xamatuer xMelayu.Online',label:'xmatuer'},{href:'/?q=xxamatuer',title:'xxamatuer xxmateur x-mateur xMelayu.Online',label:'xxamatuer'},{href:'/?q=melayu+pron',title:'melayu pron malay pron melayu porn xMelayu.Online',label:'melayu pron'},{href:'/?q=malay+porn',title:'malay porn bokep malay xxx malay xMelayu.Online',label:'malay porn'},{href:'/?q=bokep+melayu',title:'bokep melayu bokep malay xMelayu.Online',label:'bokep melayu'},{href:'/?q=awek+tudung',title:'awek tudung xMelayu.Online melayu',label:'awek tudung'},{href:'/?q=melayu+x+www',title:'melayu x www xMelayu.Online',label:'melayu x www'},{href:'/?q=seks',title:'seks awek xMelayu.Online',label:'seks'},{href:'/?q=video+rakam',title:'video rakam bilik xMelayu.Online',label:'video rakam'},{href:'/?q=tudung',title:'tudung terkini xMelayu.Online',label:'tudung'},{href:'/?q=lucah',title:'lucah malay xMelayu.Online',label:'lucah'},{href:'/?q=xxx-matuer',title:'xxx-matuer xamatuer xMelayu.Online',label:'xxx-matuer'},{href:'/?q=xamatuer',title:'xamatuer amateur xMelayu.Online',label:'xamatuer'}], sectionTitles:{s1:'✨ Discover',s2:'🔥 Hot Now',s3:'🧕 Awek Tudung',s4:'💦 Montok'}, sectionSubs:{s1:'Handpicked Recommendations',s2:'Trending Now',s3:'Awek tudung malay terbaru',s4:'Montok melayu gemuk'}, cats:{tudung:'🧕 Awek Tudung',montok:'💦 Montok Hot',indonesian:'🇮🇩 Indonesian',thai:'🇹🇭 Thai Sexy',milf:'🔥 MILF',chubby:'🍑 Chubby',viral:'📈 Viral',janda:'💋 Janda',kolej:'🎓 Kolej'} };
}
async function loadHeroConfig() {
  try { heroConfig = JSON.parse(await fsp.readFile(HERO_CONFIG_FILE, 'utf8')); }
  catch { heroConfig = getDefaultHeroConfig(); }
  console.log(`🎨 [HERO] Loaded super-x hero config`);
}
async function saveHeroConfig() {
  await fsp.writeFile(HERO_CONFIG_FILE, JSON.stringify(heroConfig, null, 2));
  console.log('💾 [HERO] Saved');
}

// ═══════════════════════════════════════════════════════════════
// CMS — SEO Keyword Badges
// ═══════════════════════════════════════════════════════════════

const KEYWORD_BADGES_FILE = path.join(__dirname, 'data', 'keyword-badges.json');
let keywordBadges = [];

async function loadKeywordBadges() {
  try { keywordBadges = JSON.parse(await fsp.readFile(KEYWORD_BADGES_FILE, 'utf8')); }
  catch { keywordBadges = []; }
}

async function saveKeywordBadges() {
  await fsp.writeFile(KEYWORD_BADGES_FILE, JSON.stringify(keywordBadges, null, 2));
}

// Simple in-memory API cache — avoids repeated identical filter/sort hits
const apiCache = new Map();
const API_CACHE_TTL = 60000;
setInterval(() => { const n = Date.now(); for (const [k, v] of apiCache) if (n - v.ts > API_CACHE_TTL) apiCache.delete(k); }, 300000);

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// L2: CSS RAM cache — pre-load CSS files into memory on startup (never hit disk again)
(async () => {
  const cssDir = path.join(__dirname, 'public', 'css');
  const files = await fsp.readdir(cssDir).catch(() => []);
  for (const f of files) {
    if (!f.endsWith('.css')) continue;
    microCache.set('/css/' + f, await fsp.readFile(path.join(cssDir, f)));
  }
  if (files.length) console.log(`📄 [CSS CACHE] Pre-loaded ${files.length} CSS files into RAM`);
})();

// L3: Page burst cache — absorbs burst traffic on high-traffic HTML pages (5s TTL)
const burstCache = new Map();
const BURST_CACHE_TTL = 5000;
function cachePage(req, res, next) {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  const cached = burstCache.get(key);
  if (cached && Date.now() - cached.ts < BURST_CACHE_TTL) return res.send(cached.html);
  const _render = res.render.bind(res);
  res.render = (view, options, callback) => {
    _render(view, options, (err, html) => {
      if (err) return callback ? callback(err) : res.status(500).send(err);
      burstCache.set(key, { html, ts: Date.now() });
      callback ? callback(null, html) : res.send(html);
    });
  };
  next();
}

const SEO_KW = ['super x melayu malay pron','melayu x www','seks','awek','video rakam','bilik','tudung','terkini','lucah','malay','malaysian chinese','xx','amateur','xxx-matuer','xamatuer'];
function seoInject(text) {
  const kw = SEO_KW.filter(() => Math.random() > 0.6);
  if (!kw.length) return text;
  const suffix = ' — ' + kw.slice(0, Math.min(3, kw.length)).join(' ').replace(/[^\w\s-]/g, '');
  return text + suffix;
}

app.get('/', cachePage, async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const tags = getTags();
  const extraTag = SEO_KW.sort(() => Math.random() - 0.5).slice(0, 4);
  const extraTags = extraTag.map(t => ({ tag: t, count: Math.floor(Math.random() * 500) + 50 }));
  res.render('gallery', {
    title: seoInject('Lucahman - Melayu Porn | Awek Tudung Video | Malaysia 18+'),
    metaDesc: 'Malay seks awek tudung lucah malaysian chinese xx amateur video rakam bilik terkini xxx-matuer xamatuer Melayu x www. Free Malay porn, Melayu lucah, awek tudung bokep malay video.',
    metaKeywords: 'seks melayu, awek tudung, lucah, malay porn, malaysian chinese, xx amateur, xxx-matuer, xamatuer, video rakam, bilik, melayu x www, super x melayu malay pron, terkini',
    categories: getCategories(),
    topTags: tags.concat(extraTags).sort(() => Math.random() - 0.5),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: false,
    isSuperX: false,
    heroConfig
  });
});

app.get('/super-x-melayu', cachePage, async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/super-x-melayu';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const tags = getTags();
  const extraTag = SEO_KW.sort(() => Math.random() - 0.5).slice(0, 4);
  const extraTags = extraTag.map(t => ({ tag: t, count: Math.floor(Math.random() * 500) + 50 }));
  res.render('gallery', {
    title: seoInject('xMateur Porn & Asian Amateur Videos | Super X Melayu'),
    metaDesc: 'Malay seks awek tudung lucah malaysian chinese xx amateur video rakam bilik terkini xxx-matuer xamatuer melayu x www. xMateur asian amateur porn. Best amateur xxx-matuer xamatuer site.',
    metaKeywords: 'xmateur, xamateur, x amateur, amateur porn, melayu x www, seks awek, video rakam bilik, tudung terkini, lucah malay, malaysian chinese, xx amateur, xxx-matuer, xamatuer, asian amateur porn, super x melayu malay pron',
    categories: getCategories(),
    topTags: tags.concat(extraTags).sort(() => Math.random() - 0.5),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: true,
    isSuperX: true,
    heroConfig
  });
});

app.get('/mega-x-melayu', cachePage, async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/mega-x-melayu';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  res.render('mega', {
    title: 'Mega X Melayu — Bigger. Bolder. Crunchier. Malay Porn | Awek Tudung',
    categories: getCategories(),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    videos: videos.slice(0, 500),
    cacheVersion: CACHE_VERSION
  });
});

app.get('/xmateur', cachePage, async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/xmateur';
  res.render('xmateur', {
    title: 'Super Duper xMateur Malaysia — Premium Amateur Asian Porn',
    totalVideos: videos.length,
    canonicalUrl,
    videos: videos.slice(0, 250),
    cacheVersion: CACHE_VERSION
  });
});

app.get('/tudung-porn', cachePage, async (req, res) => {
  const tudungVideos = videos.filter(v =>
    v.category.toLowerCase().includes('tudung') ||
    v.subTags.some(s => s.toLowerCase().includes('tudung')) ||
    v.keywords.some(k => k.toLowerCase().includes('tudung'))
  );
  const canonicalUrl = 'https://xmelayu.site/tudung-porn';
  res.render('tudung', {
    title: 'Tudung Porn — Awek Tudung Melayu Video | Lucahman',
    totalVideos: tudungVideos.length,
    canonicalUrl,
    videos: tudungVideos.slice(0, 250),
    cacheVersion: CACHE_VERSION
  });
});

// ═══════════════════════════════════════════════════════════════
// xMateur — Tier 1 English Routes
// ═══════════════════════════════════════════════════════════════

app.get('/xamateur', cachePage, (req, res) => {
  const latest = xmateurVideos.slice(0, 5);
  const popular = [...xmateurVideos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  const articleContent = `<p>Welcome to <strong>xMateur</strong> — American amateur video collection.</p>
    <p>With ${xmateurVideos.length} videos and growing.</p>
    <h2>Latest Videos</h2>
    <ul>${latest.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a></li>`).join('')}</ul>
    <h2>Popular Videos</h2>
    <ul>${popular.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a></li>`).join('')}</ul>`;
  res.render('cornerstone', {
    title: 'xMateur - American Amateur Videos',
    metaDescription: `Watch ${xmateurVideos.length} American amateur videos. xMateur premium amateur collection.`,
    heading: `xMateur — ${xmateurVideos.length} Videos`,
    content: articleContent,
    videos: xmateurVideos,
    isXmateur: true
  });
});

app.get('/xamateur/about', (req, res) => {
  res.render('about', { title: 'About xMateur', metaDescription: 'Learn about xMateur premium amateur videos.' });
});

app.get('/xamateur/real', async (req, res) => {
  if (!realVideos.length) return res.status(404).render('error', { message: 'Real section not available' });
  const totalVideos = realVideos.length;
  const latest = [...realVideos].reverse().slice(0, 20);
  const galleriesWithPreviews = realGalleries.map(g => {
    const gvideos = realVideos.filter(v => v.gallery === g.slug).slice(0, 3);
    return { ...g, previews: gvideos.map(v => v.thumbnail).filter(Boolean) };
  });
  res.render('cornerstone-real', {
    title: 'xMateur Real - Phone Amateur Videos',
    metaDescription: `Watch ${totalVideos} phone-recorded amateur videos. Real amateur content.`,
    heading: `xMateur Real — ${totalVideos} Videos`,
    content: '<p>Welcome to xMateur Real — phone-recorded amateur content.</p>',
    totalVideos,
    galleries: galleriesWithPreviews,
    latest,
    isGallery: false,
    isXmateur: true
  });
});

app.get('/xamateur/real/:slug', async (req, res) => {
  const gallery = realGalleries.find(g => g.slug === req.params.slug);
  if (!gallery) return res.status(404).render('error', { message: 'Gallery not found' });
  const gvideos = realVideos.filter(v => v.gallery === gallery.slug);
  res.render('cornerstone-real', {
    title: `${gallery.title} - xMateur Real`,
    metaDescription: `Watch ${gvideos.length} phone-recorded amateur videos in ${gallery.title}.`,
    heading: gallery.title,
    content: '<p>' + gallery.description + '</p>',
    totalVideos: gvideos.length,
    gallery,
    videos: gvideos,
    isGallery: true,
    isXmateur: true
  });
});

app.get('/xamateur/real/v/:id', async (req, res) => {
  const video = realVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });
  const related = realVideos.filter(v => v.id !== video.id && v.gallery === video.gallery).slice(0, 12);
  res.render('player-en', { title: video.title + ' - xMateur Real', video, related, isXmateur: true });
});

app.get('/xamateur/:id', async (req, res) => {
  const video = xmateurVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });
  const related = xmateurVideos.filter(v => v.id !== video.id).map(v => {
    let score = 0;
    if (v.category === video.category) score += 3;
    const kwOverlap = video.keywords?.filter(k => v.keywords?.includes(k)).length || 0;
    score += kwOverlap * 2;
    return { v, score };
  }).sort((a, b) => b.score - a.score).slice(0, 12).map(x => x.v);
  res.render('player-en', { title: video.title + ' - xMateur', video, related, isXmateur: true });
});

// xMateur API
app.get('/api/xmateur/search', async (req, res) => {
  const { q = '', sort = 'newest', page = 1, limit = 24 } = req.query;
  let results = [...xmateurVideos];
  if (q) {
    const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    results = results.filter(v => { const text = (v.title + ' ' + (v.keywords || []).join(' ')).toLowerCase(); return terms.some(t => text.includes(t)); });
  }
  if (sort === 'views') results.sort((a, b) => b.views - a.views);
  else results.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  const p = parseInt(page);
  const lim = Math.min(parseInt(limit) || 72, 700);
  const start = (p - 1) * lim;
  res.json({ videos: results.slice(start, start + lim), total: results.length, page: p, totalPages: Math.ceil(results.length / lim), hasMore: start + lim < results.length });
});

// ═══════════════════════════════════════════════════════════════
// Main Site API
// ═══════════════════════════════════════════════════════════════

app.get('/api/search', async (req, res) => {
  const start = Date.now();
  const cacheKey = req.originalUrl;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL) { return res.json(cached.data); }
  const { q = '', category = '', tag = '', sort = 'newest', page = 1, limit = 24 } = req.query;
  let results = [...videos];
  if (q) {
    const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    results = results.filter(v => {
      const text = (v.name + ' ' + v.keywords.join(' ')).toLowerCase();
      return terms.some(t => text.includes(t));
    });
  }
  if (category && category.toLowerCase() !== 'all') results = results.filter(v => v.category.toLowerCase() === category.toLowerCase());
  if (tag) results = results.filter(v => v.subTags.some(t => t.toLowerCase().includes(tag.toLowerCase())) || v.keywords.some(k => k.toLowerCase().includes(tag.toLowerCase())));
  if (sort === 'views') results.sort((a, b) => b.views - a.views);
  else if (sort === 'likes') results.sort((a, b) => b.likes - a.likes);
  else results.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 72, 700);
  const start_idx = (pageNum - 1) * limitNum;
  const data = { videos: results.slice(start_idx, start_idx + limitNum), total: results.length, page: pageNum, totalPages: Math.ceil(results.length / limitNum), hasMore: start_idx + limitNum < results.length, queryTime: Date.now() - start };
  apiCache.set(cacheKey, { data, ts: Date.now() });
  res.json(data);
});

app.get('/api/stats', (req, res) => {
  const mem = process.memoryUsage();
  const uptime = Date.now() - stats.startTime;
  // 95th percentile: sort response times, pick the 95% position
  const sorted = [...stats.performance.responseTimes].sort((a, b) => a - b);
  const p95 = sorted.length > 0 ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0;
  const totalDeliveries = stats.videoDelivery.ramHits + stats.videoDelivery.ssdHits + stats.videoDelivery.hddReads;
  const hddPressure = totalDeliveries > 0 ? ((stats.videoDelivery.hddReads / totalDeliveries) * 100).toFixed(1) : 0;
  res.json({
    requests: stats.requests,
    videos: videos.length,
    cache: {
      ...stats.cache,
      microCache: { size: microCache.size, hits: microCache.hits, misses: microCache.misses, reads: microCache.reads },
      burstCache: { size: burstCache.size },
      hotCache: { files: hotCache.size, usedGB: (hotCacheUsed / 1e9).toFixed(1), maxGB: (HOT_CACHE_MAX / 1e9).toFixed(0), usedPct: hotCacheUsed > 0 ? ((hotCacheUsed / HOT_CACHE_MAX) * 100).toFixed(1) : 0 }
    },
    performance: {
      avgResponseTime: stats.performance.avgResponseTime.toFixed(2),
      p95: p95.toFixed(2),
      slowest: stats.performance.slowest,
      fastest: stats.performance.fastest.time === Infinity ? null : stats.performance.fastest
    },
    memory: {
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB'
    },
    videoDelivery: {
      ...stats.videoDelivery,
      total: totalDeliveries,
      ramPct: totalDeliveries > 0 ? ((stats.videoDelivery.ramHits / totalDeliveries) * 100).toFixed(1) : 0,
      ssdPct: totalDeliveries > 0 ? ((stats.videoDelivery.ssdHits / totalDeliveries) * 100).toFixed(1) : 0,
      hddPct: hddPressure,
      hddPressure: hddPressure
    },
    ramChunk: {
      usedMB: (ramChunkUsed / 1024 / 1024).toFixed(1),
      maxMB: (RAM_CHUNK_MAX / 1024 / 1024).toFixed(0),
      usedPct: ramChunkUsed > 0 ? ((ramChunkUsed / RAM_CHUNK_MAX) * 100).toFixed(1) : 0,
      entries: ramChunkCache.size
    },
    promoQueue: {
      length: promoQueue.length,
      busy: promoBusy
    },
    uptime: { seconds: Math.floor(uptime / 1000), human: formatUptime(uptime) },
    system: { cpus: os.cpus().length, freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB', platform: os.platform() },
    recentRequests: stats.recentRequests.slice(0, 10)
  });
});

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({ status: 'ok', timestamp: new Date().toISOString(), videos: videos.length, uptime: process.uptime(), memory: { heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB' } });
});

app.get('/api/refresh', adminAuth, async (req, res) => { console.log('\n🔄 [ADMIN] Refresh requested...\n'); videos = await loadIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });
app.get('/api/vast', (req, res) => {
  const vastRotation = adConfig.vastRotation || [];
  let vastUrl = '';
  if (vastRotation.length) {
    const idx = Math.floor(Math.random() * vastRotation.length);
    vastUrl = vastRotation[idx];
  }
  const VAST_AD_URL = vastUrl || adConfig.vastUrl || process.env.VAST_AD_URL || '';
  if (!VAST_AD_URL) { return res.status(204).end(); }
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<VAST xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="vast.xsd" version="3.0">
  <Ad id="1">
    <InLine>
      <AdSystem>JuicyAds</AdSystem>
      <AdTitle>Advertisement</AdTitle>
      <Impression><![CDATA[]]></Impression>
      <Creatives>
        <Creative id="1" sequence="1">
          <Linear>
            <Duration>00:00:15</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[]]></Tracking>
              <Tracking event="firstQuartile"><![CDATA[]]></Tracking>
              <Tracking event="midpoint"><![CDATA[]]></Tracking>
              <Tracking event="thirdQuartile"><![CDATA[]]></Tracking>
              <Tracking event="complete"><![CDATA[]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough><![CDATA[]]></ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="640" height="480">
                <![CDATA[${VAST_AD_URL}]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`);
});

// Video ad config for Fluid Player — rate-limited per IP (max 1 ad per 5 min)
const adIpTimestamps = new Map();
app.get('/api/video-ad-config', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const lastAd = adIpTimestamps.get(ip) || 0;
  const showAd = (now - lastAd) > 300000; // 5 min cooldown
  if (showAd) adIpTimestamps.set(ip, now);

  const vastRotation = adConfig.vastRotation || [];
  let vastUrl = '';
  if (vastRotation.length) {
    vastUrl = vastRotation[Math.floor(Math.random() * vastRotation.length)];
  }
  const vastTag = vastUrl || adConfig.vastUrl || process.env.VAST_AD_URL || '';

  res.json({
    showAd,
    rollType: 'preRoll',
    vastTag: showAd ? vastTag : ''
  });
});

app.get('/robots.txt', (req, res) => {
  stats.cache.hits++;
  res.type('text/plain').send(`User-agent: *
Allow: /
Allow: /about
Allow: /terms
Allow: /privacy
Allow: /dmca
Allow: /2257
Disallow: /api/
Disallow: /admin
Disallow: /temp/
Disallow: /*?*
Disallow: /*.json$

# Googlebot
User-agent: Googlebot
Allow: /
Allow: /about
Allow: /terms
Allow: /privacy
Allow: /dmca
Allow: /2257
Disallow: /api/

# Bingbot
User-agent: Bingbot
Allow: /
Allow: /about
Allow: /terms
Allow: /privacy
Allow: /dmca
Allow: /2257
Disallow: /api/

# Crawl delay
Crawl-delay: 0.5

# Sitemaps
Sitemap: https://xmelayu.site/sitemap.xml
`);
});

function sanitizeSitemapText(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\b(incest|revenge\s*porn|slut|shaming|crot|dalam)\b/gi, 'xxx');
}

app.get('/sitemap.xml', (req, res) => {
  stats.cache.hits++;
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ';
  xml += 'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n';
  
  xml += '  <url><loc>https://xmelayu.site/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>\n';
  
  ['about', 'terms', 'privacy', 'dmca', '2257'].forEach(page => {
    xml += `  <url><loc>https://xmelayu.site/${page}</loc><priority>0.5</priority></url>\n`;
  });
  
  const now = new Date().toISOString();
  videos.slice(0, 1000).forEach(v => {
    const st = sanitizeSitemapText(v.title);
    const desc = videoDescriptions[v.id] ? sanitizeSitemapText(videoDescriptions[v.id].text.substring(0, 200)) : `${st} - Homemade adult video`;
    const tags = videoDescriptions[v.id]?.keywords?.slice(0, 5) || [];
    xml += `  <url>
    <loc>https://xmelayu.site/${v.id}</loc>
    <lastmod>${now}</lastmod>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
    <video:video>
      <video:title>${st}</video:title>
      <video:description>${desc}</video:description>
      <video:thumbnail_loc>${SITE_BASE}${v.thumbnail}</video:thumbnail_loc>
      <video:content_loc>${SITE_BASE}${v.video}</video:content_loc>
      <video:category>${v.category}</video:category>
      <video:family_friendly>no</video:family_friendly>
      <video:duration>${v.duration || 180}</video:duration>
      <video:tag>${v.category}</video:tag>${tags.map(t => `\n      <video:tag>${sanitizeSitemapText(t)}</video:tag>`).join('')}
    </video:video>
  </url>\n`;
  });
  
  xml += '</urlset>';
  res.type('application/xml').send(xml);
});

const PAGE_ROUTES = ['terms', 'privacy', 'dmca', '2257', 'about'];
for (const name of PAGE_ROUTES) {
  app.get('/' + name, (req, res) => {
    stats.cache.hits++;
    const p = pageContent[name] || { title: name.charAt(0).toUpperCase() + name.slice(1), metaDescription: '', content: '<h1>Coming soon</h1><p>This page has not been set up yet.</p>' };
    res.render('page', { title: p.title || name, metaDescription: p.metaDescription || '', content: p.content || '', canonicalUrl: `https://xmelayu.site/${name}` });
  });
}

// Serve player page directly for crawl consistency (no redirect)
app.get('/player/:id', (req, res) => {
  res.redirect(308, `/${req.params.id}`);
});

// Basic auth middleware for admin routes
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'xmelayu2026';
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const buf = Buffer.from(auth.slice(6), 'base64').toString();
  const colon = buf.indexOf(':');
  if (colon === -1 || buf.slice(0, colon) !== ADMIN_USER || buf.slice(colon + 1) !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Invalid credentials');
  }
  next();
}

// Admin panel — must be before /:id wildcard
app.get('/admin', adminAuth, (req, res) => {
  res.render('admin', { title: 'Server Admin' });
});
app.get('/admin/pages', adminAuth, (req, res) => {
  res.render('admin-pages', { title: 'Pages', pages: pageContent });
});
app.get('/admin/videos', adminAuth, (req, res) => {
  res.render('admin-videos', { title: 'Videos' });
});
app.get('/admin/ads', adminAuth, (req, res) => {
  res.render('admin-ads', { title: 'Ads' });
});
app.get('/admin/keywords', adminAuth, (req, res) => {
  res.render('admin-keywords', { title: 'SEO Keywords' });
});
app.get('/admin/super-x', adminAuth, (req, res) => {
  res.render('admin-superx', { title: 'Super X Hero' });
});

app.get('/:id', async (req, res) => {
  // 301 redirect if file was renamed
  const redirectTarget = redirectMap[req.params.id];
  if (redirectTarget) return res.redirect(301, `/${redirectTarget}`);

  const video = videosById.get(req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });

  const vd = viewsData[video.id] = viewsData[video.id] || { views: 0, likes: 0 };
  vd.views++;
  video.views = vd.views;
  if (vd.views % 50 === 0) saveViews().catch(() => {});

  const related = [];
  const catRelated = [];
  const otherRelated = [];
  const vCat = video.category;
  const vKeywords = video.keywords;
  const vSubTags = video.subTags;
  const vTitle = video.title;
  for (const v of videos) {
    if (v.id === video.id) continue;
    let score = 0;
    if (v.category === vCat) score += 3;
    if (vKeywords && v.keywords) {
      for (let i = 0; i < vKeywords.length; i++)
        if (v.keywords.includes(vKeywords[i])) score += 2;
    }
    if (vSubTags && v.subTags) {
      for (let i = 0; i < vSubTags.length; i++)
        if (v.subTags.includes(vSubTags[i])) score += 2;
    }
    if (score > 0) {
      if (v.category === vCat) catRelated.push({ v, score });
      else otherRelated.push({ v, score });
    }
  }
  catRelated.sort((a, b) => b.score - a.score);
  otherRelated.sort((a, b) => b.score - a.score);
  for (let i = 0; i < catRelated.length && related.length < 30; i++) related.push(catRelated[i].v);
  for (let i = 0; i < otherRelated.length && related.length < 30; i++) related.push(otherRelated[i].v);
  const canonicalUrl = `https://xmelayu.site/${req.params.id}`;
  const videoDesc = videoDescriptions[video.id] || null;
  const videoSchema = seo.generateStructuredData('video', {
    title: video.title,
    description: videoDesc?.text || `${video.title} - Homemade adult video`,
    thumbnailUrl: SITE_BASE + video.thumbnail,
    contentUrl: SITE_BASE + video.video,
    embedUrl: SITE_BASE + video.video,
    uploadDate: video.uploaded,
    views: video.views,
    filename: video.id
  });
  res.render('player', { title: video.title, video, related, canonicalUrl, siteBase: SITE_BASE, videoDescription: videoDesc, structuredData: [videoSchema], adConfig });
});

// Video JSON API for soft navigation (SPA player swap)
app.get('/api/video/:id', (req, res) => {
  const video = videosById.get(req.params.id);
  if (!video) return res.status(404).json({ error: 'not found' });

  const related = [];
  const catRelated = [];
  const otherRelated = [];
  const vCat = video.category;
  const vKeywords = video.keywords;
  const vSubTags = video.subTags;
  const vTitle = video.title;
  for (const v of videos) {
    if (v.id === video.id) continue;
    let score = 0;
    if (v.category === vCat) score += 3;
    if (vKeywords && v.keywords) {
      for (let i = 0; i < vKeywords.length; i++)
        if (v.keywords.includes(vKeywords[i])) score += 2;
    }
    if (vSubTags && v.subTags) {
      for (let i = 0; i < vSubTags.length; i++)
        if (v.subTags.includes(vSubTags[i])) score += 2;
    }
    if (score > 0) {
      if (v.category === vCat) catRelated.push({ v, score });
      else otherRelated.push({ v, score });
    }
  }
  catRelated.sort((a, b) => b.score - a.score);
  otherRelated.sort((a, b) => b.score - a.score);
  for (let i = 0; i < catRelated.length && related.length < 30; i++) related.push(catRelated[i].v);
  for (let i = 0; i < otherRelated.length && related.length < 30; i++) related.push(otherRelated[i].v);

  const videoDesc = videoDescriptions[video.id] || null;
  res.json({
    video: { ...video, description: videoDesc?.text || '' },
    related: related.map(v => ({ ...v, description: videoDescriptions[v.id]?.text || '' })),
    videoDescription: videoDesc
  });
});

// Protect all /api/admin routes with basic auth
app.use('/api/admin', adminAuth);

// Admin API — Pages
app.get('/api/admin/pages', (req, res) => { res.json(pageContent); });
app.post('/api/admin/pages/:name', async (req, res) => {
  const { name } = req.params;
  const { title, metaDescription, content } = req.body;
  pageContent[name] = { title, metaDescription, content, updated: new Date().toISOString() };
  await savePages();
  bumpVersion();
  res.json({ success: true });
});

// Admin API — Videos
app.get('/api/admin/videos', (req, res) => {
  const { q, page = 1, limit = 50 } = req.query;
  let filtered = videos;
  if (q) {
    const terms = q.toLowerCase().split(/\s+/);
    filtered = videos.filter(v => terms.some(t => v.id.toLowerCase().includes(t) || v.title.toLowerCase().includes(t)));
  }
  const start = (parseInt(page) - 1) * parseInt(limit);
  const withDesc = filtered.slice(start, start + parseInt(limit)).map(v => ({
    ...v,
    description: videoDescriptions[v.id]?.text || ''
  }));
  res.json({
    videos: withDesc,
    total: filtered.length,
    page: parseInt(page),
    totalPages: Math.ceil(filtered.length / Math.max(1, parseInt(limit)))
  });
});
app.post('/api/admin/videos/bulk', async (req, res) => {
  const { ids, operation, text, prefix, suffix, start: s, pad } = req.body;
  let count = 0;
  let idx = 0;
  for (const v of videos) {
    if (!ids.includes(v.id)) continue;
    if (operation === 'prepend') { v.title = (text || '') + v.title; v.name = v.title; }
    else if (operation === 'append') { v.title = v.title + (text || ''); v.name = v.title; }
    else if (operation === 'replace') { v.title = text || ''; v.name = v.title; }
    else if (operation === 'renumber') {
      const num = String((parseInt(s) || 1) + idx).padStart(parseInt(pad) || 3, '0');
      v.title = (prefix || '') + num + (suffix || '');
      v.name = v.title;
      idx++;
    }
    count++;
  }
  await fsp.writeFile(INDEX_FILE, JSON.stringify(videos, null, 2));
  queueDbSave(true);
  bumpVersion();
  res.json({ success: true, count });
});

async function saveDescriptions() {
  await fsp.writeFile(DESCRIPTIONS_FILE, JSON.stringify({ descriptions: videoDescriptions }, null, 2));
}

// Video description API (used by gallery floating player)
app.get('/api/video-descriptions/:id', (req, res) => {
  const desc = videoDescriptions[req.params.id];
  res.json(desc ? { text: desc.text, keywords: desc.keywords } : { text: '', keywords: [] });
});

// Single video title/description update — also persists to id-map for rebuild safety
app.patch('/api/admin/videos/:id', async (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const { title, description } = req.body;
  if (typeof title !== 'string') return res.status(400).json({ error: 'Title required' });
  video.title = title.trim() || video.id.replace(/[-_]+/g, ' ');
  video.name = video.title;
  // Persist custom title to id-map (find by current id across all fingerprints)
  for (const fp of Object.keys(idMap)) {
    if (idMap[fp].id === video.id) {
      idMap[fp].title = video.title;
      idMap[fp].name = video.name;
      break;
    }
  }
  const tasks = [
    fsp.writeFile(INDEX_FILE, JSON.stringify(videos, null, 2)),
    saveIdMap()
  ];
  // Persist description to videoDescriptions + descriptions file
  if (typeof description === 'string') {
    if (!videoDescriptions[video.id]) {
      videoDescriptions[video.id] = { text: '', keywords: [], autoGenerated: false, regenerated: false, updatedAt: new Date().toISOString() };
    }
    videoDescriptions[video.id].text = description;
    videoDescriptions[video.id].updatedAt = new Date().toISOString();
    tasks.push(saveDescriptions());
  }
  await Promise.all(tasks);
  queueDbSave(true);
  bumpVersion();
  res.json({ success: true, video });
});

// Admin API — Ads
app.get('/api/admin/ads', (req, res) => { res.json(adConfig); });
app.post('/api/admin/ads', async (req, res) => {
  adConfig = { ...adConfig, ...req.body };
  await saveAdConfig();
  res.json({ success: true });
});

// Admin API — SEO Keyword Badges
app.get('/api/admin/keywords', (req, res) => { res.json(keywordBadges); });
app.post('/api/admin/keywords', async (req, res) => {
  const b = req.body;
  if (!b.text || !b.patterns || !b.shape) return res.status(400).json({ error: 'text, patterns, shape required' });
  b.id = b.id || b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  b.group = b.group || 'custom';
  b.priority = b.priority || 50;
  b.color = b.color || '#6b6b75';
  b.bg = b.bg || '#6b6b75';
  b.enabled = b.enabled !== false;
  keywordBadges.push(b);
  await saveKeywordBadges();
  res.json({ success: true, badges: keywordBadges });
});
app.put('/api/admin/keywords/:id', async (req, res) => {
  const idx = keywordBadges.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  keywordBadges[idx] = { ...keywordBadges[idx], ...req.body, id: req.params.id };
  await saveKeywordBadges();
  res.json({ success: true, badges: keywordBadges });
});
app.delete('/api/admin/keywords/:id', async (req, res) => {
  keywordBadges = keywordBadges.filter(b => b.id !== req.params.id);
  await saveKeywordBadges();
  res.json({ success: true, badges: keywordBadges });
});

// Super X Hero Config API
app.get('/api/admin/super-x', (req, res) => { res.json(heroConfig); });
app.post('/api/admin/super-x', async (req, res) => {
  heroConfig = { ...getDefaultHeroConfig(), ...req.body };
  if (req.body.sectionTitles) heroConfig.sectionTitles = { ...heroConfig.sectionTitles, ...req.body.sectionTitles };
  if (req.body.sectionSubs) heroConfig.sectionSubs = { ...heroConfig.sectionSubs, ...req.body.sectionSubs };
  if (req.body.cats) heroConfig.cats = { ...heroConfig.cats, ...req.body.cats };
  if (req.body.nicheTags) heroConfig.nicheTags = req.body.nicheTags;
  if (req.body.keywordTags) heroConfig.keywordTags = req.body.keywordTags;
  if (req.body.ctaButtons) heroConfig.ctaButtons = req.body.ctaButtons;
  if (req.body.seoLinks) heroConfig.seoLinks = req.body.seoLinks;
  await saveHeroConfig();
  res.json({ success: true });
});

// Public API — Keyword Badges (cached, no admin needed)
app.get('/api/keyword-badges', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(keywordBadges.filter(b => b.enabled !== false));
});

// Admin API — Non-destructive re-scan
app.get('/api/scan', adminAuth, async (req, res) => {
  const oldCount = videos.length;
  const oldFingerprints = Object.keys(idMap).length;
  const start = Date.now();
  videos = await buildIndex();
  bumpVersion();
  const duration = Date.now() - start;
  const redirectCount = Object.keys(redirectMap).length;
  res.json({
    success: true,
    before: { videos: oldCount, fingerprints: oldFingerprints },
    after: { videos: videos.length, fingerprints: Object.keys(idMap).length },
    redirects: redirectCount,
    duration
  });
});

app.use((req, res) => { res.status(404).render('error', { message: 'Page not found' }); });

function formatUptime(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const server = http.createServer({
  timeout: 60000,
  keepAliveTimeout: 30000,
  headersTimeout: 65000
}, app);

// Crash recovery — don't take the site down on a bad request
process.on('uncaughtException', err => {
  console.error(`[UNCAUGHT] ${err.message}`);
});
process.on('unhandledRejection', err => {
  console.error(`[UNHANDLED] ${err?.message || err}`);
});

(async () => {
  loadXmateurIndex();
  loadRealIndex();
  await loadIdMap();
  await loadIndex();
  await loadPages();
  await loadAdConfig();
  await loadHeroConfig();
  await loadKeywordBadges();
  loadDescriptions();
  server.listen(PORT, () => {
    // Fire sponge preload after listen — doesn't block server readiness
    preloadSpongeCache();
    const totalViews = videos.reduce((s, v) => s + v.views, 0);
    const cats = getCategories();
    const topCats = cats.slice(0, 5).map(([c, n]) => `${c}:${n}`).join('  ');
    const extraCats = cats.length > 5 ? `  +${cats.length - 5}` : '';
    const memTotal = (os.totalmem() / 1e9).toFixed(1);
    const memUsed = ((os.totalmem() - os.freemem()) / 1e9).toFixed(1);
    const caps = (hotCacheUsed / 1e9).toFixed(1);
    const capPct = hotCacheUsed > 0 ? ` (${((hotCacheUsed / HOT_CACHE_MAX) * 100).toFixed(0)}%)` : '';
    const microPct = microCache.reads > 0 ? ` (${((microCache.hits / microCache.reads) * 100).toFixed(0)}% hit)` : '';
    const totalLikes = videos.reduce((s, v) => s + (v.likes || 0), 0);
    const viewsLen = Object.keys(viewsData).length;
    const L = s => `║  ${s.padEnd(62)}║`;
    const D = `║${' '.repeat(64)}║`;
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                     🎬  MEGA X MELAYU  🎬                     ║
║              https://xmelayu.site                              ║
╠══════════════════════════════════════════════════════════════════╣
║  SERVER                                                         ║
${L(`PID ${process.pid}  │  Port ${PORT}  │  ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`)}
${L(`Node ${process.version}  │  ${os.platform()}  │  ${os.cpus().length} vCPU  │  ${memUsed}/${memTotal} GB RAM`)}
${D}
║  CONTENT                                                        ║
${L(`${videos.length.toLocaleString()} videos  │  ${totalViews.toLocaleString()} views  │  ${totalLikes.toLocaleString()} likes`)}
${L(`xMateur: ${xmateurVideos.length}  │  Real: ${realVideos.length}  │  Galleries: ${realGalleries.length}`)}
${L(`${topCats}${extraCats}`)}
${D}
║  PERSISTENCE                                                    ║
${L(`LokiDB: data/database.json  │  ${viewsLen} tracked views`)}
${L(`video-index.json  │  id-map: ${Object.keys(idMap).length} fingerprints`)}
${D}
║  CACHING                                                        ║
${L(`microCache: ${microCache.size} items${microPct}  │  burstCache: 5s TTL`)}
${L(`SSD capacitor: ${caps}GB / 20GB${capPct}  │  LRU eviction`)}
${D}
║  RATE LIMITS                                                    ║
${L(`Pages: ${RL_MAX}/min  │  Static: ${RL_STATIC_MAX}/min  │  Bots: unlimited`)}
${D}
║  STORAGE PATHS                                                  ║
${L(`Videos: ${VIDEO_DIR}`)}
${L(`Thumbnails: ${THUMBNAIL_DIR}`)}
${D}
║  KEY ROUTES                                                     ║
${L(`/            Gallery  │  /:id           Player`)}
${L(`/super-x-melayu Super X │  /admin         Dashboard`)}
${L(`/sitemap.xml  Sitemap  │  /admin/videos  Bulk editor`)}
${D}
║  LEGEND: 2xx OK  │  4xx Rate-limit  │  5xx Error              ║
╚══════════════════════════════════════════════════════════════════╝
`);
  });
})();
