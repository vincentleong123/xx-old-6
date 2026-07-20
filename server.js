const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const ejs = require('ejs');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const loki = require('lokijs');

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT) || 7004; // Internal port (Caddy forwards to this)

// Persistent HTTP agent — reuses connections across rapid requests
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: Infinity,
  maxFreeSockets: 256
});
const IS_PROD = process.env.NODE_ENV === 'production';

const CDN_BASE = '';
const SITE_BASE = 'https://xmelayu.site';
const VIDEO_DIR = 'E:/videos';
const THUMBNAIL_DIR = 'C:/thumbnails';
const INDEX_FILE = path.join(__dirname, 'data', 'video-index.json');
const DESCRIPTIONS_FILE = path.join(__dirname, 'data', 'video-descriptions.json');
const PAGES_FILE = path.join(__dirname, 'data', 'pages.json');

const HERO_CONFIG_FILE = path.join(__dirname, 'data', 'hero-config.json');
const CORNERSTONE_FILE = path.join(__dirname, 'data', 'cornerstone-pages.json');
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const XAMATEUR_DIR = 'C:/Users/User/Desktop/xamateur';
const chatServer = require('./utils/chat-server');
let xmateurVideos = [];

// ═══════════════════════════════════════════════════════════════
// STATISTICS & MONITORING
// ═══════════════════════════════════════════════════════════════

const stats = {
  requests: { total: 0, pages: 0, api: 0, static: 0, errors: 0, bots: 0, humans: 0 },
  cache: { hits: 0, misses: 0, indexLoads: 0, rebuilds: 0 },
  performance: { avgResponseTime: 0, responseTimes: [], slowest: { path: '', time: 0 }, fastest: { path: '', time: Infinity } },
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
const RL_MAX = 120;
const RL_STATIC_MAX = 300;
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
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => logRequest(req, res, Date.now() - start));
  next();
});

app.use(rateLimit);
app.use(require('cookie-parser')());
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  next();
});

// Visitor ID cookie — persists across page loads for chat tracking
app.use((req, res, next) => {
  let vid = req.cookies?._vid;
  if (!vid) {
    vid = uuidv4();
    res.cookie('_vid', vid, { maxAge: 365 * 86400000, httpOnly: true, sameSite: 'lax' });
  }
  req.visitorId = vid;
  res.locals.visitorId = vid;
  res.locals.adminName = 'Lucahman';
  res.locals.isAdminPage = false;
  res.locals.siteUrl = SITE_BASE;
  next();
});

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
  if (cached) { res.type('text/css'); res.set('Cache-Control', 'public, max-age=604800, immutable'); return res.send(cached); }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true, lastModified: true }));

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
  const tmp = path.join(HOT_CACHE_DIR, filename + '.tmp');
  const dest = path.join(HOT_CACHE_DIR, filename);
  try {
    const st = await fsp.stat(hddPath);
    if (hotCacheUsed + st.size > HOT_CACHE_MAX)
      await evictLeastRecent(Math.min(st.size + HOT_CACHE_EVICT_TARGET, hotCacheUsed));
    if (hotCacheUsed + st.size > HOT_CACHE_MAX) return;
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(hddPath);
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
}

// ═══════════════════════════════════════════════════════════════
// /videos/:slug and /xamateur/videos/:slug → 301 redirect to player page
// ═══════════════════════════════════════════════════════════════
app.get('/videos/:slug', (req, res, next) => {
  const videoId = req.params.slug.replace(/\.mp4$/i, '');
  if (!videos.some(v => v.id === videoId)) return next();
  res.redirect(301, `/${videoId}`);
});
app.get('/xamateur/videos/:slug', (req, res, next) => {
  const videoId = req.params.slug.replace(/\.mp4$/i, '');
  const match = xmateurVideos.find(v => v.filename?.replace(/\.mp4$/i, '') === videoId);
  if (!match) return next();
  res.redirect(301, `/xamateur/${match.id}`);
});
// ═══════════════════════════════════════════════════════════════
// RAW VIDEO STREAM — /raw/videos/:filename  (internal, not in sitemap)
// ═══════════════════════════════════════════════════════════════
app.use('/raw/videos', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();
  const hddPath = path.join(VIDEO_DIR, filename);
  let stat;
  try { stat = await fsp.stat(hddPath); } catch { return next(); }

  if (hotCache.has(filename)) {
    hotCache.get(filename).atime = Date.now();
    try {
      return res.sendFile(path.join(HOT_CACHE_DIR, filename), {
        headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable' }
      });
    } catch { hotCache.delete(filename); }
  }

  const range = req.headers.range;
  const rs = range
    ? (() => {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.status(206);
        res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable' });
        return fs.createReadStream(hddPath, { start, end });
      })()
    : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable' }), fs.createReadStream(hddPath));

  rs.pipe(res);
  res.on('close', () => rs.destroy());

  promoteToHot(filename, hddPath);
});
// ═══════════════════════════════════════════════════════════════
// RAW VIDEO STREAM — /raw/xamateur/:filename  (internal, not in sitemap)
// ═══════════════════════════════════════════════════════════════
app.use('/raw/xamateur', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();
  const filePath = path.join(XAMATEUR_DIR, filename);
  try { await fsp.stat(filePath); } catch { return next(); }
  const stat = await fsp.stat(filePath);
  const range = req.headers.range;
  const rs = range
    ? (() => {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.status(206);
        res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' });
        return fs.createReadStream(filePath, { start, end });
      })()
    : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' }), fs.createReadStream(filePath));
  rs.pipe(res);
  res.on('close', () => rs.destroy());
});
// Thumbnails — served from micro-cache first, then disk
const THUMBNAIL_PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect fill="#1a1a1e" width="320" height="240"/><rect fill="#2a2a30" x="120" y="80" width="80" height="80" rx="16"/><polygon fill="#6b6b75" points="145,95 145,145 175,120"/></svg>');

function thumbnailCache(dirs) {
  return (req, res, next) => {
    const filename = path.basename(req.path);
    if (!filename.match(/\.(jpg|jpeg|png|webp)$/i)) return next();

    const cached = microCache.get(filename);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=604800, immutable');
      res.type(path.extname(filename));
      return res.send(cached);
    }

    const headers = { 'Cache-Control': 'public, max-age=604800, immutable' };

    (function tryDir(i) {
      if (i >= dirs.length) {
        microCache.set(filename, THUMBNAIL_PLACEHOLDER);
        res.type('image/svg+xml');
        res.set('Cache-Control', 'public, max-age=300');
        return res.send(THUMBNAIL_PLACEHOLDER);
      }
      const fp = path.join(dirs[i], filename);
      res.sendFile(fp, { headers }, (err) => {
        if (err) tryDir(i + 1);
      });
    })(0);
  };
}

app.use('/thumbnails', thumbnailCache([THUMBNAIL_DIR]));

const nlp = require('./utils/nlp');
const SEOGenerator = require('./utils/seo-generator');
const seo = new SEOGenerator({ siteName: 'xMelayu', siteUrl: SITE_BASE });
let videos = [];
let videoDescriptions = {};
let cornerstonePages = {};

// ═══════════════════════════════════════════════════════════════
// LOKIJS DATABASE
// ═══════════════════════════════════════════════════════════════

const db = new loki(DB_FILE, {
  autoload: true,
  autosave: true,
  autosaveInterval: 4000,
  autoloadCallback: () => {
    if (!db.getCollection('videos')) db.addCollection('videos', { indices: ['id', 'category', 'views'] });
    if (!db.getCollection('pageConfigs')) db.addCollection('pageConfigs', { indices: ['route'] });
    if (!db.getCollection('descriptions')) db.addCollection('descriptions', { indices: ['videoId'] });

    if (!db.getCollection('heroConfig')) db.addCollection('heroConfig');
    if (!db.getCollection('cornerstonePages')) db.addCollection('cornerstonePages', { indices: ['route'] });
    if (!db.getCollection('likes')) db.addCollection('likes', { indices: ['videoId'] });
    if (!db.getCollection('chatMessages')) db.addCollection('chatMessages');
    // Migrate existing likes.json data into LokiJS
    const likesCol = db.getCollection('likes');
    if (likesCol.count() === 0) {
      try {
        const legacy = JSON.parse(fs.readFileSync(LIKES_FILE, 'utf8'));
        const entries = Object.entries(legacy).filter(([_, v]) => v.count > 0);
        if (entries.length > 0) {
          entries.forEach(([videoId, data]) => likesCol.insert({ videoId, count: data.count, ips: data.ips }));
          db.saveDatabase();
          console.log(`✅ [LIKES] Migrated ${entries.length} entries from likes.json to LokiJS`);
        }
      } catch {}
    }
  }
});

function getVideosCollection() { return db.getCollection('videos'); }
function getPageConfigsCollection() { return db.getCollection('pageConfigs'); }
function getCornerstoneCollection() { return db.getCollection('cornerstonePages'); }
function getLikesCollection() { return db.getCollection('likes'); }

async function syncVideosToDb() {
  const col = getVideosCollection();
  if (!col) return;
  col.clear();
  videos.forEach(v => col.insert(Object.assign({}, v)));
  db.saveDatabase();
}

async function loadVideosFromDb() {
  const col = getVideosCollection();
  if (!col || col.count() === 0) return null;
  return col.chain().data().map(v => { const d = Object.assign({}, v); delete d.$loki; delete d.meta; return d; });
}

async function syncIndexToLoki() {
  const col = getVideosCollection();
  if (!col) return;
  col.clear();
  videos.forEach(v => col.insert(Object.assign({}, v)));
  db.saveDatabase();
  console.log(`\n💾 [LOKIJS] Synced ${videos.length} videos to database\n`);
}

async function loadCornerstonePages() {
  try {
    const data = await fsp.readFile(CORNERSTONE_FILE, 'utf8');
    cornerstonePages = JSON.parse(data);
    const col = getCornerstoneCollection();
    if (col) {
      col.clear();
      Object.entries(cornerstonePages).forEach(([route, config]) => col.insert({ route, ...config }));
      db.saveDatabase();
    }
  } catch { cornerstonePages = {}; }
}

async function saveCornerstonePages() {
  await fsp.writeFile(CORNERSTONE_FILE, JSON.stringify(cornerstonePages, null, 2));
  const col = getCornerstoneCollection();
  if (col) {
    col.clear();
    Object.entries(cornerstonePages).forEach(([route, config]) => col.insert({ route, ...config }));
    db.saveDatabase();
  }
}

async function loadDescriptions() {
  try {
    const data = await fsp.readFile(DESCRIPTIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    videoDescriptions = parsed.descriptions || {};
    invalidateSitemapCache();
    console.log(`\n📝 [DESCRIPTIONS] Loaded ${Object.keys(videoDescriptions).length} video descriptions\n`);
  } catch (err) {
    console.log(`\n⚠️  [DESCRIPTIONS] Could not load descriptions: ${err.message}\n`);
    videoDescriptions = {};
  }
}

// ═══════════════════════════════════════════════════════════════
// CACHE-BUST VERSION (browser localStorage check)
// ═══════════════════════════════════════════════════════════════

let CACHE_VERSION = Date.now();
app.locals.cacheVersion = CACHE_VERSION;
app.locals.siteBase = SITE_BASE;
app.locals.cleanAlt = (v) => {
  const base = (v && (v.title || v.id || ''))
    .replace(/\s*[-–|]\s*xMelayu\s*$/i, '')
    .replace(/\.mp4$/i, '')
    .replace(/-[0-9A-F]{4,}$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = base.split(/\s+/).filter(w => w.length > 1 && !EXPLICIT_WORDS.has(w.toLowerCase()) && !ALT_ONLY_WORDS.has(w.toLowerCase()));
  return (words.length ? words.join(' ') : base || 'Video');
};

app.locals.cleanAltText = (text) => {
  if (!text) return '';
  return text.split(/\s+/).filter(w => !ALT_ONLY_WORDS.has(w.toLowerCase())).join(' ') || text;
};

function cleanVideoTitle(video) {
  let t = (video.title || video.id || '');
  t = t.replace(/\s*[-–|]\s*xMelayu\s*$/i, '').replace(/\.mp4$/i, '').replace(/-[0-9A-F]{4,}$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = t.split(/\s+/).filter(w => w.length > 1 && !EXPLICIT_WORDS.has(w.toLowerCase()));
  if (!words.length) return 'Video';
  const title = words.join(' ').replace(/\b\w/g, c => c.toUpperCase());
  if (title.toLowerCase().includes('xmelayu')) return title;
  return title + ' - xMelayu';
}

function bumpVersion() {
  CACHE_VERSION = Date.now();
  app.locals.cacheVersion = CACHE_VERSION;
  app.locals.siteBase = SITE_BASE;
  invalidateSitemapCache();
  console.log(`\n🔁 [VERSION] Bumped to v${CACHE_VERSION}\n`);
}

// ═══════════════════════════════════════════════════════════════
// VIDEO INDEX
// ═══════════════════════════════════════════════════════════════

async function loadIndex() {
  // Try LokiJS first
  try {
    const dbVideos = await loadVideosFromDb();
    if (dbVideos && dbVideos.length > 0) {
      videos = dbVideos;
      stats.cache.hits++;
      stats.cache.indexLoads++;
      console.log(`\n💾 [LOKIJS] Loaded ${videos.length} videos from database\n`);
      videos.forEach(v => { v._rawVideoUrl = `/raw/videos/${encodeURIComponent(v.id)}.mp4`; });
      return videos;
    }
  } catch (e) { /* fallback to file */ }

  // Fallback to file-based loading
  try {
    const start = Date.now();
    const data = await fsp.readFile(INDEX_FILE, 'utf8');
    videos = JSON.parse(data);
    const duration = Date.now() - start;
    stats.cache.indexLoads++;
    stats.cache.hits++;
    console.log(`\n💾 [CACHE] Loaded ${videos.length} videos in ${duration}ms (${(Buffer.byteLength(data, 'utf8') / 1024 / 1024).toFixed(2)} MB)\n`);
    videos.forEach(v => { v._rawVideoUrl = `/raw/videos/${encodeURIComponent(v.id)}.mp4`; });
    // Sync to LokiJS
    await syncIndexToLoki();
    return videos;
  } catch {
    console.log('\n⚠️  [CACHE] No index found, building...\n');
    stats.cache.misses++;
    return await buildIndex();
  }
}

async function loadXamateurIndex() {
  try {
    const data = await fsp.readFile(path.join(XAMATEUR_DIR, 'data', 'video-index.json'), 'utf8');
    const raw = JSON.parse(data);
    xmateurVideos = raw.map(v => ({
      id: v.id,
      name: v.name || v.title,
      title: v.title,
      filename: v.filename,
      video: '/xamateur/videos/' + encodeURIComponent(v.filename),
      _rawVideoUrl: '/raw/xamateur/' + encodeURIComponent(v.filename),
      thumbnail: '/thumbnails/' + encodeURIComponent(v.filename.replace(/\.mp4$/i, '.jpg')),
      views: v.views || 0,
      keywords: v.keywords || [],
      category: v.category || 'Amateur',
      uploaded: v.uploaded || new Date().toISOString(),
      description: v.description || ''
    }));
    console.log(`\n🔶 [XAMATEUR] Loaded ${xmateurVideos.length} xMateur videos\n`);
  } catch (err) {
    xmateurVideos = [];
    console.log(`\n🔶 [XAMATEUR] Could not load: ${err.message}\n`);
  }
}

const EXPLICIT_WORDS = new Set([
  'lucah','bogel','pancut','memek','kontol','ngentot','sundal','pantat','kimak',
  'telanjang','bugil','coli','stagen','crot',
  'mesum','cabul','bejat','entot','ngewe','ngocok','masturbasi'
]);

const BANNED_WORDS = new Set(['incest','revenge porn','slut','shaming']);
const ALT_ONLY_WORDS = new Set(['pussy','tits','ass','boobs','dick','cock','cum','fuck','suck','blowjob','handjob','orgasm','anal','dildo','vibrator','masturbate','moan','creampie','gangbang','threesome','foursome','deepthroat','squirting','facial','cuckold','nude','naked','xxx','sex','porn']);

function makeCleanTitle(baseName, category, keywords) {
  const words = (baseName || '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !EXPLICIT_WORDS.has(w.toLowerCase()))
    .slice(0, 6);
  if (words.length) {
    const title = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return title + ' - xMelayu';
  }
  const cat = (category || 'Video').replace(/[-_]/g, ' ');
  return cat.charAt(0).toUpperCase() + cat.slice(1) + ' Video - xMelayu';
}

function cleanAltText(text) {
  if (!text) return '';
  return text.split(/\s+/).filter(w => !ALT_ONLY_WORDS.has(w.toLowerCase())).join(' ') || text;
}

async function buildIndex() {
  try {
    const start = Date.now();
    await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    const files = await fsp.readdir(VIDEO_DIR);
    const newVideos = [];
    const usedTitles = new Set();
    
    for (const file of files) {
      if (!/\.(mp4|webm|ogg|mov)$/i.test(file)) continue;
      const baseName = path.basename(file, path.extname(file));
      const cat = nlp.categorizeVideo(baseName);
      const kw = nlp.extractKeywords(baseName);
      let cleanTitle = makeCleanTitle(baseName, cat.category, kw.all);
      let counter = 1;
      while (usedTitles.has(cleanTitle)) {
        cleanTitle = makeCleanTitle(baseName, cat.category, kw.all) + '-' + counter;
        counter++;
      }
      usedTitles.add(cleanTitle);
      newVideos.push({
        id: baseName,
        name: cleanTitle,
        title: cleanTitle,
        video: `${CDN_BASE}/videos/${encodeURIComponent(baseName)}.mp4`,
        thumbnail: `${CDN_BASE}/thumbnails/${encodeURIComponent(baseName)}.jpg`,
        _rawVideoUrl: `/raw/videos/${encodeURIComponent(baseName)}.mp4`,
        views: Math.floor(Math.random() * 50000) + 100,
        likes: Math.floor(Math.random() * 5000) + 10,
        uploaded: new Date().toISOString(),
        category: cat.category,
        subTags: cat.subTags,
        keywords: kw.all
      });
    }
    
    videos = newVideos;
    await fsp.writeFile(INDEX_FILE, JSON.stringify(videos, null, 2));
    await syncIndexToLoki();
    const duration = Date.now() - start;
    stats.cache.rebuilds++;
    console.log(`\n✅ [BUILD] Indexed ${videos.length} videos in ${duration}ms\n`);
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
// CMS — Super X Hero Config
// ═══════════════════════════════════════════════════════════════

let heroConfig = {};

function getDefaultHeroConfig() {
  return { badge:'Super X Melayu', h1:'Super X Melayu', ctaButtons:[{href:'/',label:'Browse Videos',cls:'super-x-btn'},{href:'/?sort=views',label:'Trending',cls:'super-x-btn super-x-btn-alt'}] };
}
async function loadHeroConfig() {
  try { heroConfig = JSON.parse(await fsp.readFile(HERO_CONFIG_FILE, 'utf8')); }
  catch { heroConfig = getDefaultHeroConfig(); }
}
async function saveHeroConfig() {
  await fsp.writeFile(HERO_CONFIG_FILE, JSON.stringify(heroConfig, null, 2));
}
// Simple in-memory API cache — avoids repeated identical filter/sort hits
const apiCache = new Map();
const API_CACHE_TTL = 60000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of apiCache) if (n - v.ts > API_CACHE_TTL) apiCache.delete(k); }, 300000);

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
</script>
<script>
(function(){
  var _mouseTrack = false;
  document.addEventListener('mouseover', function(e) {
    if (_mouseTrack) return;
    _mouseTrack = true;
    gtag('event', 'first_hover', { });
  }, { once: true, passive: true });
  document.addEventListener('click', function(e) {
    var card = e.target.closest('[data-id]');
    if (card) {
      gtag('event', 'card_click', { video_id: card.dataset.id });
    }
  }, { passive: true });
})();
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
  const SEO_KW = ['amateur', 'homemade', 'malaysian', 'southeast asian', 'authentic', 'xmelayu', 'xmateur'];

  app.get('/', cachePage, async (req, res) => {
    const canonicalUrl = `${SITE_BASE}/`;
    const websiteSchema = seo.generateStructuredData('website');
    const orgSchema = seo.generateStructuredData('organization');
    const tags = getTags();
    const extraTags = [];

    const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
    const updatedLabel = 'Today';

  const filterCategory = req.query.cat || '';
  let filterTitle = 'xMelayu - Malaysian Amateur Video Collection';
  let filterH1 = null;
  let filterDesc = 'xMelayu Malaysian amateur video collection featuring authentic homemade content from Malaysia and Southeast Asia.';
  let filterKw = 'xmelayu, malaysian amateur, malay video, southeast asian content';
  if (filterCategory) {
    filterTitle = `xMelayu - ${filterCategory} Malaysian Amateur Videos`;
    filterH1 = `xMelayu — ${filterCategory} Malaysian Videos`;
    filterDesc = `xMelayu ${filterCategory} malaysian amateur videos. Authentic homemade content.`;
  }

  const ssrVideos = videos
    .filter(v => !filterCategory || v.category.toLowerCase() === filterCategory.toLowerCase())
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
    .slice(0, 40)
    .map(v => ({ id: v.id, title: v.title, thumbnail: v.thumbnail, category: v.category, views: v.views || 0, likes: v.likes || 0, _rawVideoUrl: v._rawVideoUrl || `/raw/videos/${encodeURIComponent(v.id)}.mp4` }));

  res.render('gallery', {
    title: filterTitle,
    filterCategory,
    filterH1,
    metaDesc: filterDesc,
    metaKeywords: filterKw,
    topTags: tags.concat(extraTags).sort(() => Math.random() - 0.5),
    totalVideos: videos.length,
    totalViews,
    updatedLabel,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: false,
    isSuperX: false,
    heroConfig,
    ssrVideos
  });
});

app.get('/mega-x', cachePage, async (req, res) => {
  return res.redirect(301, '/mega-x-melayu');
});

function computeTotalViews() {
  try {
    return videos.reduce((s, v) => s + (v.views || 0), 0);
  } catch {
    return 0;
  }
}

function computeUpdatedLabel() {
  // Keep cheap + deterministic for SSR; if you later want "MMM d" you can derive from videos[0].uploaded.
  return 'Today';
}

function renderSuperX(req, res, pageSlug) {
  const canonicalUrl = `${SITE_BASE}/super-x-melayu`;
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const tags = getTags();
  const extraTag = SEO_KW.sort(() => Math.random() - 0.5).slice(0, 4);
  const extraTags = extraTag.map(t => ({ tag: t, count: Math.floor(Math.random() * 500) + 50 }));
  res.render('gallery', {
    title: 'Super X Melayu - Malaysian Amateur Video Collection',
    metaDesc: 'xMateur asian amateur video collection featuring authentic homemade content from Malaysia and Southeast Asia.',
    metaKeywords: 'xmateur, xamateur, amateur, asian amateur, homemade, malaysia, southeast asia',
    categories: getCategories(),
    topTags: tags.concat(extraTags).sort(() => Math.random() - 0.5),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: true,
    isSuperX: true,
    heroConfig
  });
}

app.get('/super-x-melayu', cachePage, (req, res) => renderSuperX(req, res, ''));
app.get('/mega-x-melayu', cachePage, (req, res) => {
  const canonicalUrl = `${SITE_BASE}/mega-x-melayu`;
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  res.render('gallery', {
    title: 'Mega X Melayu - Malaysian Amateur Videos',
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: true
  });
});

// ═══════════════════════════════════════════════════════════════
// TIER 1 PAGES — cornerstone / filtered gallery routes
// ═══════════════════════════════════════════════════════════════

function filterVideosByConfig(filter) {
  if (!filter) return videos;
  let filtered = [...videos];
  if (filter.category) filtered = filtered.filter(v => v.category === filter.category);
  if (filter.keyword) filtered = filtered.filter(v => v.keywords.some(k => k.toLowerCase().includes(filter.keyword.toLowerCase())));
  if (filter.sort === 'views') filtered.sort((a, b) => b.views - a.views);
  else filtered.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  if (filter.max) filtered = filtered.slice(0, filter.max);
  return filtered;
}

function renderCornerstonePage(req, res, route) {
  const config = cornerstonePages[route];
  if (!config) return res.status(404).render('error', { message: 'Page not found' });
  const canonicalUrl = `${SITE_BASE}${route}`;
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const filteredVideos = filterVideosByConfig(config.videoFilter);

  if (config.template === 'cornerstone-real') {
    return res.render('cornerstone-real', {
      title: config.title,
      metaDescription: config.metaDescription,
      heading: config.heading,
      totalVideos: filteredVideos.length,
      videos: filteredVideos,
      content: config.content,
      galleries: (config.galleries || []).map(g => ({
        slug: g,
        title: g.charAt(0).toUpperCase() + g.slice(1) + ' Collection',
        videoCount: filteredVideos.length,
        previews: filteredVideos.slice(0, 3).map(v => v.thumbnail)
      })),
      latest: filteredVideos.slice(0, 20),
      isGallery: false,
      canonicalUrl,
      structuredData: [websiteSchema, orgSchema]
    });
  }

  if (config.template === 'cornerstone') {
    return res.render('cornerstone', {
      title: config.title,
      metaDescription: config.metaDescription,
      heading: config.heading,
      videos: filteredVideos,
      content: config.content,
      canonicalUrl,
      structuredData: [websiteSchema, orgSchema]
    });
  }

  // Fallback to gallery
  res.render('gallery', {
    title: config.title,
    metaDescription: config.metaDescription,
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: filteredVideos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: !!config.simplifiedSidebar,
    heroConfig
  });
}

// Tier 1 page routes (explicit — must be before /:id catch-all)
app.get('/xamateur', cachePage, (req, res) => {
  const canonicalUrl = `${SITE_BASE}/xamateur`;
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const articles = xmateurVideos.slice(0, 5);
  const popular = [...xmateurVideos].sort((a, b) => b.views - a.views).slice(0, 5);
  const content = `<p>Welcome to <strong>xAmateur</strong> — premium American amateur video collection with ${xmateurVideos.length} authentic videos and growing daily.</p>
<h2>Latest Videos</h2>
<ul>${articles.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a></li>`).join('')}</ul>
<h2>Most Popular</h2>
<ul>${popular.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a> — ${(v.views || 0).toLocaleString()} views</li>`).join('')}</ul>
<h2>What is xAmateur?</h2>
<p>xAmateur is the USA Tier 1 amateur collection on xMelayu, featuring real homemade American amateur content. Every video is authentic, unfiltered, and exclusive to xAmateur.</p>
<h2>Why USA Tier 1 Content?</h2>
<p>Our <strong>USA Tier 1 amateur videos</strong> are curated for English-speaking audiences with higher engagement and premium quality. These videos target search intent from US, UK, Canada, and Australia viewers.</p>`;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_BASE },
      { "@type": "ListItem", "position": 2, "name": "xAmateur", "item": `${SITE_BASE}/xamateur` }
    ]
  };
  res.render('cornerstone', {
    title: 'xAmateur — USA Amateur Videos | Tier 1 Amateur Porn Collection',
    metaDescription: `Watch ${xmateurVideos.length} American amateur porn videos. xAmateur premium USA amateur collection featuring authentic homemade content. Free access, HD streaming.`,
    heading: `xAmateur — ${xmateurVideos.length} USA Amateur Videos`,
    content,
    videos: xmateurVideos,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema, breadcrumbSchema],
    isXmateur: true
  });
});
app.get('/xamateur/real', cachePage, (req, res) => renderCornerstonePage(req, res, '/xamateur/real'));
app.get('/tudung-porn', cachePage, (req, res) => renderCornerstonePage(req, res, '/tudung-porn'));

app.get('/xmateur', cachePage, (req, res) => {
  const canonicalUrl = `${SITE_BASE}/xmateur`;
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const config = cornerstonePages['/xmateur'];
  const filtered = config ? filterVideosByConfig(config.videoFilter) : videos;
  res.render('gallery', {
    title: 'xMateur — Amateur Malay Porn | Malaysian Amateur Videos',
    metaDescription: 'xMateur — Amateur Malay porn collection. Real amateur videos from Malaysia, Indonesian and Southeast Asian couples.',
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: filtered.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: true,
    heroConfig
  });
});

app.get('/api/search', async (req, res) => {
  const start = Date.now();
  const cacheKey = req.originalUrl;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL) { return res.json(cached.data); }
  const { q = '', category = '', tag = '', sort = 'shuffle', page = 1, limit = 1000 } = req.query;
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

  if (sort === 'shuffle') {
    results = shuffle(results).slice(0, parseInt(limit));
  } else if (sort === 'views') results.sort((a, b) => b.views - a.views);
  else if (sort === 'likes') results.sort((a, b) => b.likes - a.likes);
  else results.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  const pageNum = parseInt(page);
  const limitNum = sort === 'shuffle' ? results.length : Math.min(parseInt(limit) || 72, 1000);
  const start_idx = (pageNum - 1) * limitNum;
  const data = { videos: results.slice(start_idx, start_idx + limitNum), total: results.length, page: pageNum, totalPages: Math.ceil(results.length / limitNum), hasMore: start_idx + limitNum < results.length, queryTime: Date.now() - start };
  apiCache.set(cacheKey, { data, ts: Date.now() });
  res.json(data);
});

app.get('/api/stats', (req, res) => {
  const mem = process.memoryUsage();
  const uptime = Date.now() - stats.startTime;
  res.json({
    requests: stats.requests,
    cache: { ...stats.cache, hotCache: { files: hotCache.size, usedGB: (hotCacheUsed / 1e9).toFixed(1) } },
    performance: { avgResponseTime: stats.performance.avgResponseTime.toFixed(2), slowest: stats.performance.slowest, fastest: stats.performance.fastest.time === Infinity ? null : stats.performance.fastest },
    memory: { heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB', heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB', rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB' },
    uptime: { seconds: Math.floor(uptime / 1000), human: formatUptime(uptime) },
    system: { cpus: os.cpus().length, freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB', platform: os.platform() },
    recentRequests: stats.recentRequests.slice(0, 10)
  });
});

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({ status: 'ok', timestamp: new Date().toISOString(), videos: videos.length, uptime: process.uptime(), memory: { heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB' } });
});
app.get('/api/video-descriptions/:id', (req, res) => {
  const desc = videoDescriptions[req.params.id];
  if (desc) return res.json({ text: desc.text || '', keywords: desc.keywords || [] });
  res.json({ text: '', keywords: [] });
});
app.get('/api/refresh', async (req, res) => { console.log('\n🔄 [ADMIN] Refresh requested...\n'); videos = await loadIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });
app.get('/robots.txt', (req, res) => {
  stats.cache.hits++;
  res.type('text/plain').send(`User-agent: *
Disallow:

User-agent: Googlebot
Disallow: /*?*

Sitemap: ${SITE_BASE}/sitemap.xml
`);
});

function sanitizeSitemapText(text) {
  if (!text) return '';
  let result = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  result = result.split(/\s+/).filter(w => !EXPLICIT_WORDS.has(w.toLowerCase()) && !BANNED_WORDS.has(w.toLowerCase())).join(' ');
  return result;
}

function isCleanKeyword(kw) {
  if (!kw || kw.length < 3) return false;
  // reject hex IDs like 4978e7, a94b39
  if (/^[0-9a-f]{4,}$/i.test(kw)) return false;
  // reject purely numeric
  if (/^\d{3,}$/.test(kw)) return false;
  return true;
}

let cachedSitemapXml = null;
let cachedSitemapLength = 0;

function buildSitemapXml() {
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ');
  parts.push('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" ');
  parts.push('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n');
  parts.push(`  <url><loc>${SITE_BASE}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>\n`);
  ['about', 'faq', 'collections'].forEach(page => {
    parts.push(`  <url><loc>${SITE_BASE}/${page}</loc><priority>0.5</priority></url>\n`);
  });
  ['super-x-melayu', 'mega-x-melayu', 'xmateur', 'xamateur', 'tudung-porn'].forEach(page => {
    parts.push(`  <url><loc>${SITE_BASE}/${page}</loc><priority>0.9</priority><changefreq>daily</changefreq></url>\n`);
  });
  videos.forEach(v => {
    const st = sanitizeSitemapText(v.title);
    const desc = videoDescriptions[v.id] ? sanitizeSitemapText(videoDescriptions[v.id].text.replace(/<[^>]*>/g, '').substring(0, 150)) : `${st} - Homemade adult video`;
    const rawTags = (videoDescriptions[v.id]?.keywords || []);
    const cleanTags = [...new Set(rawTags)].filter(isCleanKeyword).slice(0, 3);
    parts.push(`  <url><loc>${SITE_BASE}/${v.id}</loc>`);
    parts.push(`<video:video><video:title>${st}</video:title><video:description>${desc}</video:description>`);
    parts.push(`<video:thumbnail_loc>${SITE_BASE}${v.thumbnail}</video:thumbnail_loc><video:player_loc>${SITE_BASE}/${v.id}</video:player_loc>`);
    parts.push(`<video:category>${v.category}</video:category><video:family_friendly>no</video:family_friendly>`);
    cleanTags.forEach(t => { parts.push(`<video:tag>${sanitizeSitemapText(t)}</video:tag>`); });
    parts.push(`</video:video>`);
    parts.push(`<image:image><image:loc>${SITE_BASE}${v.thumbnail}</image:loc><image:title>${st}</image:title></image:image>`);
    parts.push(`</url>\n`);
  });
  parts.push('</urlset>');
  const xml = parts.join('');
  cachedSitemapXml = xml;
  cachedSitemapLength = Buffer.byteLength(xml, 'utf8');
  return xml;
}

function invalidateSitemapCache() { cachedSitemapXml = null; }

app.get('/sitemap.xml', (req, res) => {
  stats.cache.hits++;
  if (!cachedSitemapXml) buildSitemapXml();
  res.set({
    'Content-Type': 'application/xml',
    'Content-Length': cachedSitemapLength,
    'Cache-Control': 'public, max-age=3600, s-maxage=7200'
  });
  res.send(cachedSitemapXml);
});

const PAGE_ROUTES = ['terms', 'privacy', 'dmca', '2257', 'about'];

app.get('/faq', (req, res) => {
  const faqQuestions = [
    { q: 'What is xMelayu?', a: 'xMelayu is a free amateur video platform featuring authentic Malaysian, Indonesian, and Southeast Asian homemade content. All videos are user-submitted and verified.' },
    { q: 'Is xMelayu free to use?', a: 'Yes, xMelayu is completely free. All videos can be streamed in HD quality without any subscription or payment required.' },
    { q: 'How many videos are available?', a: 'xMelayu hosts over 5,000 amateur videos across dozens of categories including amateur, homemade, tudung, viral, and more. New content is added daily.' },
    { q: 'What video quality is available?', a: 'All videos are available in HD quality with fast streaming. We use adaptive streaming technology to ensure smooth playback on any device.' },
    { q: 'Is xMelayu mobile-friendly?', a: 'Yes, xMelayu is fully responsive and works great on all devices including smartphones, tablets, and desktops. No app download required.' },
    { q: 'How do I search for specific videos?', a: 'Use the search bar at the top of any page to search by keywords, categories, or tags. You can also browse by category using the sidebar navigation.' },
    { q: 'What categories are available?', a: 'We cover a wide range of categories including amateur, homemade, tudung/hijab, viral, MILF, couple, POV, and many more. Each category is curated for quality content.' },
    { q: 'How often is new content added?', a: 'New videos are added daily. Our library grows continuously with fresh amateur content from creators across Southeast Asia.' },
    { q: 'Can I request content removal?', a: 'Yes, we take content removal seriously. If you see content that infringes your rights, please use our DMCA page to submit a removal request.' },
    { q: 'Is my browsing data private?', a: 'xMelayu respects your privacy. We collect minimal anonymous usage data through cookies. We do not sell personal data to third parties.' },
    { q: 'What is Super X Melayu?', a: 'Super X Melayu is our premium curated collection featuring the highest quality and most popular Malaysian amateur videos, handpicked by our editors.' },
    { q: 'How do I contact xMelayu?', a: 'For inquiries, content removal requests, or partnerships, visit our About page or submit a request through the DMCA section.' }
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqQuestions.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };

  const content = '<h1>Frequently Asked Questions</h1>\n' +
    faqQuestions.map(f => `<h2>${f.q}</h2><p>${f.a}</p>`).join('\n');

  res.render('page', {
    title: 'FAQ — xMelayu | Malaysian Amateur Videos',
    metaDescription: 'Frequently asked questions about xMelayu. Learn about our free Malaysian amateur video platform, content, privacy, and more.',
    canonicalUrl: `${SITE_BASE}/faq`,
    content,
    faqSchema
  });
});

// Collections index — aggregates all cornerstone pages
app.get('/collections', (req, res) => {
  const pages = Object.entries(cornerstonePages).map(([slug, p]) => ({
    slug,
    title: p.heading || p.title,
    description: p.metaDescription || '',
    count: (p.videoFilter && p.videoFilter.max) || 0
  }));

  res.render('page', {
    title: 'Video Collections — Browse by Topic | xMelayu',
    metaDescription: 'Browse xMelayu video collections. Find Malaysian, Malay, Asian amateur, and more categorized content.',
    canonicalUrl: SITE_BASE + '/collections',
    content: '<h1>Video Collections</h1><p>Browse our curated video collections organized by topic and category.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-top:24px">' + pages.map(p => '<a href="' + p.slug + '" style="display:block;padding:24px;background:#1a1a2e;border-radius:12px;text-decoration:none;color:white;border:1px solid #333;transition:border-color 0.2s"><h2 style="margin:0 0 8px;font-size:18px">' + p.title.replace(/<[^>]*>/g, '') + '</h2><p style="margin:0 0 12px;color:#aaa;font-size:14px">' + p.description + '</p><span style="color:#e91e63;font-size:13px;font-weight:600">' + p.count + ' videos</span></a>').join('\n') + '</div>'
  });
});

for (const name of PAGE_ROUTES) {
  app.get('/' + name, (req, res) => {
    stats.cache.hits++;
    const p = pageContent[name] || { title: name.charAt(0).toUpperCase() + name.slice(1), metaDescription: '', content: '<h1>Coming soon</h1><p>This page has not been set up yet.</p>' };
    res.render('page', { title: p.title || name, metaDescription: p.metaDescription || '', content: p.content || '', canonicalUrl: `${SITE_BASE}/${name}` });
  });
}

// Serve player page directly for crawl consistency (no redirect)
app.get('/player/:id', (req, res) => {
  res.redirect(308, `/${req.params.id}`);
});

app.get('/embed/:id', (req, res) => {
  const video = videos.find(v => v.id === req.params.id) || xmateurVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).send('Video not found');
  video._rawVideoUrl = video.filename
    ? `/raw/xamateur/${encodeURIComponent(video.filename)}`
    : `/raw/videos/${video.id}.mp4`;
  res.removeHeader('X-Frame-Options');
  res.render('embed', {
    title: video.title,
    src: `${SITE_BASE}${video._rawVideoUrl}`,
    poster: `${SITE_BASE}${video.thumbnail}`,
    videoId: video.id,
    siteBase: SITE_BASE
  });
});

// ═══════════════════════════════════════════════════════════════
// NLP KEYWORD LANDING PAGES — auto-generated SEO content in English
// Targets Tier 1 search traffic with NLP-powered content generation
// ═══════════════════════════════════════════════════════════════

const SEO_CONTENT_TEMPLATES = {
  'amateur': { title: 'Amateur', h1: 'Amateur — Real Homemade Asian Amateur Videos', emoji: '📹' },
  'homemade': { title: 'Homemade', h1: 'Homemade — Real Amateur Home Videos', emoji: '🏠' },
  'tudung': { title: 'Tudung', h1: 'Tudung — Malaysian Hijab Amateur Videos', emoji: '🧕' },
  'hijab': { title: 'Hijab', h1: 'Hijab — Malay Muslimah Amateur Videos', emoji: '🧕' },
  'malay': { title: 'Malay', h1: 'Malay — Malaysian Amateur Videos', emoji: '🇲🇾' },
  'melayu': { title: 'Melayu', h1: 'Melayu — Malay Amateur Videos', emoji: '🇲🇾' },
  'indonesian': { title: 'Indonesian', h1: 'Indonesian — Real Indo Amateur Videos', emoji: '🇮🇩' },
  'indo': { title: 'Indo', h1: 'Indo — Indonesian Amateur Videos', emoji: '🇮🇩' },
  'thai': { title: 'Thai', h1: 'Thai — Real Thai Amateur Videos', emoji: '🇹🇭' },
  'japanese': { title: 'Japanese', h1: 'Japanese — Real Jap Amateur Videos', emoji: '🇯🇵' },
  'korean': { title: 'Korean', h1: 'Korean — Real South Korean Amateur Videos', emoji: '🇰🇷' },
  'chinese': { title: 'Chinese', h1: 'Chinese — Real Chinese Amateur Videos', emoji: '🇨🇳' },
  'vietnamese': { title: 'Vietnamese', h1: 'Vietnamese — Real Viet Amateur Videos', emoji: '🇻🇳' },
  'filipino': { title: 'Filipino', h1: 'Filipino — Pinay Amateur Videos', emoji: '🇵🇭' },
  'milf': { title: 'MILF', h1: 'MILF — Mature Asian Amateur Videos', emoji: '🔥' },
  'teen': { title: 'Teen', h1: 'Teen — Young Asian Amateur Videos', emoji: '🌸' },
  'couple': { title: 'Couple', h1: 'Couple — Real Couple Amateur Videos', emoji: '💑' },
  'bini': { title: 'Bini', h1: 'Bini — Malay Wife Amateur Videos', emoji: '💢' },
  'janda': { title: 'Janda', h1: 'Janda — Malay Divorcee Amateur Videos', emoji: '💋' },
  'viral': { title: 'Viral', h1: 'Viral — Trending Malay Amateur Videos', emoji: '📈' },
  'skandal': { title: 'Skandal', h1: 'Skandal — Malay Scandal Amateur Videos', emoji: '🔴' },
  'bocor': { title: 'Bocor', h1: 'Bocor — Leaked Malay Amateur Videos', emoji: '💧' },
  'chubby': { title: 'Chubby', h1: 'Chubby — BBW Malay Amateur Videos', emoji: '🍑' },
  'montok': { title: 'Montok', h1: 'Montok — Thick Curvy Malay Amateur Videos', emoji: '🔥' },
  'kolej': { title: 'Kolej', h1: 'Kolej — Malaysian College Amateur Videos', emoji: '🎓' },
  'pov': { title: 'POV', h1: 'POV — Point of View Amateur Videos Asia', emoji: '👁️' },
  'public': { title: 'Public', h1: 'Public — Outdoor Asian Amateur Videos', emoji: '🌳' },
  'private': { title: 'Private', h1: 'Private — Exclusive Personal Amateur Videos', emoji: '🤫' }
};

function generateKeywordContent(keyword, matchedVideos) {
  const tpl = SEO_CONTENT_TEMPLATES[keyword];
  const count = matchedVideos.length;
  const totalViews = matchedVideos.reduce((s, v) => s + (v.views || 0), 0);
  const categories = [...new Set(matchedVideos.map(v => v.category).filter(Boolean))];

  // Pick a random high-view video for example
  const topVideo = matchedVideos.length > 0 ? matchedVideos.sort((a, b) => b.views - a.views)[0] : null;

  const titleWord = tpl ? tpl.title : keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const h1 = tpl ? tpl.h1 : `${titleWord} — ${titleWord} Amateur Videos`;
  const emoji = tpl ? tpl.emoji : '🔞';

  const content = `<h2>${emoji} ${h1}</h2>
<p><strong>xMelayu</strong> presents our curated collection of <strong>${count} ${keyword} amateur videos</strong> — real content from Malaysia, Indonesia, Thailand, and across Southeast Asia. Every video is authentic homemade content featuring real couples and amateur performers.</p>
<p>Whether you are searching for <strong>${keyword} amateur videos</strong>, <strong>${keyword} clips</strong>, or the best <strong>${keyword} collection</strong>, this category delivers raw, unfiltered passion from real people. Our ${keyword} category is updated daily with fresh uploads.</p>${categories.length > 0 ? `
<h3>Top ${keyword} Categories</h3>
<p>Our ${keyword} collection spans multiple categories: ${categories.slice(0, 5).join(', ')}. Each video is hand-picked for authenticity and quality.</p>` : ''}
<h3>Why Watch ${titleWord} Videos on xMelayu?</h3>
<p><strong>Authentic Content:</strong> Every video is real amateur content, not studio-produced.<br>
<strong>HD Quality:</strong> All videos stream in HD quality with fast loading.<br>
<strong>Updated Daily:</strong> New ${keyword} videos added every day.<br>
<strong>FREE Access:</strong> No subscription needed — all content is free to watch.</p>
<p>Browse our complete <a href="/" style="color:#ff2d55">${keyword} amateur videos</a> and discover why thousands of viewers choose xMelayu for their daily dose of authentic Asian amateur content.</p>`;

  return { title: `${h1} | xMelayu`, h1, content, emoji };
}

function findRelatedKeywords(keyword, matchedVideos) {
  const allKws = new Set();
  matchedVideos.forEach(v => {
    if (v.keywords) v.keywords.forEach(k => allKws.add(k));
  });
  const freq = {};
  allKws.forEach(k => freq[k] = 0);
  matchedVideos.forEach(v => {
    if (v.keywords) v.keywords.forEach(k => { if (freq[k] !== undefined) freq[k]++; });
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 12).map(x => x[0]).filter(k => k !== keyword);
}

// NLP Keyword Landing Page — auto-generated SEO content in English for Tier 1 traffic
app.get('/k/:keyword', cachePage, (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword).toLowerCase().trim();
  if (!keyword || keyword.length < 2) return res.status(404).render('error', { message: 'Invalid keyword' });

  var hash = 0;
  for (var i = 0; i < keyword.length; i++) { hash = ((hash << 5) - hash) + keyword.charCodeAt(i); hash |= 0; }
  var seed = Math.abs(hash) + 1;

  // Filter videos matching keyword in title or keywords array
  const matched = videos.filter(v => {
    const title = (v.title || v.name || '').toLowerCase();
    const kws = (v.keywords || []).map(k => k.toLowerCase());
    return title.includes(keyword) || kws.some(k => k.includes(keyword));
  }).sort((a, b) => b.views - a.views);

  if (matched.length === 0) return next();

  const seoContent = generateKeywordContent(keyword, matched);
  const relatedKeywords = findRelatedKeywords(keyword, matched);

  const canonicalUrl = `${SITE_BASE}/k/${encodeURIComponent(keyword)}`;
  const websiteSchema = seo.generateStructuredData('website');
  const gallerySchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': seoContent.h1,
    'description': `${matched.length} ${keyword} porn videos - authentic amateur content.`,
    'url': canonicalUrl,
    'numberOfItems': matched.length
  };

  res.render('keyword', {
    title: seoContent.title,
    metaDescription: `Watch ${matched.length} free ${keyword} porn videos. Real amateur ${keyword} content from Malaysia, Indonesia & Southeast Asia. HD streaming, updated daily.`,
    keywords: [keyword, ...relatedKeywords.slice(0, 5), 'amateur porn', 'asian porn', 'xmelayu'].join(', '),
    heading: seoContent.h1,
    canonicalUrl,
    videos: matched.slice(0, 72),
    content: seoContent.content,
    relatedKeywords,
    structuredData: [websiteSchema, gallerySchema]
  });
});

app.get('/xamateur/:id', async (req, res) => {
  const video = xmateurVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });
  video._rawVideoUrl = `/raw/xamateur/${encodeURIComponent(video.filename)}`;
  const related = xmateurVideos
    .filter(v => v.id !== video.id)
    .map(v => {
      let score = 0;
      const kwOverlap = video.keywords?.filter(k => v.keywords?.includes(k)).length || 0;
      score += kwOverlap * 2;
      score += Math.log2((v.views || 100) + 1) * 0.5;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(x => x.v);
  const videoDesc = videoDescriptions[video.id] || null;
  let seoTitle = cleanVideoTitle(video) + ' - xAmateur';
  if (videoDesc && videoDesc.text) {
    const strongMatch = videoDesc.text.match(/<strong>([^<]+)<\/strong>/);
    if (strongMatch) seoTitle = strongMatch[1].trim();
  }
  res.render('player-en', {
    displayTitle: cleanVideoTitle(video) + ' - xAmateur',
    seoTitle,
    title: video.title + ' - xAmateur',
    video,
    related,
    isXmateur: true
  });
});

app.get('/admin', (req, res) => {
  res.render('admin', { title: 'Server Admin' });
});
app.get('/admin/pages', (req, res) => {
  res.render('admin-pages', { title: 'Pages', pages: pageContent });
});
app.get('/admin/videos', (req, res) => {
  res.render('admin-videos', { title: 'Videos' });
});
app.get('/admin/ads', (req, res) => {
  res.render('admin-ads', { title: 'Ads' });
});

// ═══════════════════════════════════════════════════════════════
// CHAT ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/admin/chat', (req, res) => {
  const token = req.cookies?.chat_token;
  if (!token || !chat.validateToken(token)) return res.redirect('/admin/chat/login');
  res.render('admin-chat', { title: 'Chat Admin', isAdminPage: true });
});

app.get('/admin/chat/login', (req, res) => {
  const token = req.cookies?.chat_token;
  if (token && chat.validateToken(token)) return res.redirect('/admin/chat');
  res.render('admin-chat-login', { title: 'Chat Login', error: null });
});

app.post('/admin/chat/login', (req, res) => {
  const password = req.body?.password || '';
  if (chat.adminLogin(password)) {
    res.cookie('chat_token', chat.adminToken(), { maxAge: 7 * 86400000, httpOnly: true });
    return res.redirect('/admin/chat');
  }
  res.render('admin-chat-login', { title: 'Chat Login', error: 'Invalid password' });
});

app.get('/admin/chat/logout', (req, res) => {
  res.clearCookie('chat_token');
  res.redirect('/admin/chat/login');
});

app.get('/api/admin/chat/sessions', (req, res) => {
  res.json({ sessions: chat.getSessions() });
});

app.post('/api/admin/chat/start', (req, res) => {
  const { visitorId, text } = req.body || {};
  if (!visitorId || !text) return res.status(400).json({ error: 'visitorId and text required' });
  const msg = chat.adminStartChat(visitorId, text);
  res.json({ success: true, message: msg });
});

app.post('/api/admin/chat/reply', (req, res) => {
  const { visitorId, text } = req.body || {};
  if (!visitorId || !text) return res.status(400).json({ error: 'visitorId and text required' });
  const msg = chat.adminReply(visitorId, text);
  res.json({ success: true, message: msg });
});

app.get('/api/admin/chat/conversation/:visitorId', (req, res) => {
  const messages = chat.getConversation(req.params.visitorId);
  res.json({ messages });
});

app.get('/:id', async (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });
  video._rawVideoUrl = `/raw/videos/${video.id}.mp4`;

  const allScored = videos
    .filter(v => v.id !== video.id)
    .map(v => {
      let score = 0;
      if (v.category === video.category) score += 3;
      const kwOverlap = video.keywords?.filter(k => v.keywords?.includes(k)).length || 0;
      const tagOverlap = video.subTags?.filter(t => v.subTags?.includes(t)).length || 0;
      score += kwOverlap * 2 + tagOverlap * 2;
      if (video.title?.toLowerCase().includes(v.category?.toLowerCase()) || v.title?.toLowerCase().includes(video.category?.toLowerCase())) score += 1;
      score += Math.log2((v.views || 100) + 1) * 0.5;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);

  // ═══ SECTION DISTRIBUTION — simple offset slicing ═══
  // Each section uses a different range/offset so the 6000+ library is spread evenly
  // No complex tracking — slight overlap is fine for discovery
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Hero Carousel: top 24 most relevant to current video
  const heroRelated = allScored.slice(0, 24).map(x => x.v);

  // Prev/Next navigation — sequential walk through allScored (relevance order)
  const prevVideo = allScored.length > 0 ? allScored[0].v : null;
  const nextVideo = allScored.length > 1 ? allScored[1].v : (allScored.length > 0 ? allScored[0].v : null);

  // Trending Now: top 20 by views globally
  const trending = videos
    .filter(v => v.id !== video.id)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 20);

  // Most Viewed: next 20 by views (offset 20, different from trending)
  const mostViewed = videos
    .filter(v => v.id !== video.id)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(20, 40);

  // Editor's Picks: randomized from top 30% quality pool
  const qualityPool = videos
    .filter(v => v.id !== video.id)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, Math.floor(videos.length * 0.3));
  const editorsPicks = shuffle(qualityPool).slice(0, 20);

  // Category Groups: pull from full library by category
  const catGroups = {};
  videos.forEach(v => {
    const cat = v.category || 'Other';
    if (!catGroups[cat]) catGroups[cat] = [];
    if (catGroups[cat].length < 20) catGroups[cat].push(v);
  });
  const categoryGroups = Object.entries(catGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  // Recently Added: top 20 by upload date
  const recent = videos
    .filter(v => v.id !== video.id)
    .sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0))
    .slice(0, 20);

  // Explore sections: randomized from offset ranges of the full library
  const allShuffled = shuffle(videos.filter(v => v.id !== video.id));
  const seg = Math.floor(allShuffled.length / 3);
  const exploreSlice1 = allShuffled.slice(0, 20);
  const exploreSlice2 = allShuffled.slice(seg, seg + 20);
  const exploreSlice3 = allShuffled.slice(seg * 2, seg * 2 + 20);

  // Related: scored for sidebar only (NOT duplicated in grid)
  const related = allScored.filter(x => x.score > 0).slice(0, 30).map(x => x.v);

  const canonicalUrl = `${SITE_BASE}/${req.params.id}`;
  const videoDesc = videoDescriptions[video.id] || null;
  const displayTitle = cleanVideoTitle(video);
  let seoTitle = displayTitle;
  if (videoDesc && videoDesc.text) {
    const strongMatch = videoDesc.text.match(/<strong>([^<]+)<\/strong>/);
    if (strongMatch) seoTitle = strongMatch[1].trim();
  }
  res.render('player', {
    displayTitle,
    seoTitle,
    title: video.title,
    video,
    heroRelated,
    related,
    categoryGroups,
    trending,
    mostViewed,
    editorsPicks,
    recent,
    exploreSlice1,
    exploreSlice2,
    exploreSlice3,
    canonicalUrl,
    siteBase: SITE_BASE,
    videoDescription: videoDesc,
    prevVideo: prevVideo ? { id: prevVideo.id, title: prevVideo.title, thumbnail: prevVideo.thumbnail, category: prevVideo.category } : null,
    nextVideo: nextVideo ? { id: nextVideo.id, title: nextVideo.title, thumbnail: nextVideo.thumbnail, category: nextVideo.category } : null
  });
});

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
  res.json({
    videos: filtered.slice(start, start + parseInt(limit)),
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
  await syncIndexToLoki();
  bumpVersion();
  res.json({ success: true, count });
});

// Admin — Super X
app.get('/admin/super-x', (req, res) => {
  res.render('admin-superx', { title: 'Super X', heroConfig });
});
app.get('/api/admin/super-x', (req, res) => { res.json(heroConfig); });
app.post('/api/admin/super-x', async (req, res) => {
  heroConfig = { ...heroConfig, ...req.body };
  await saveHeroConfig();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// LIKES API
// ═══════════════════════════════════════════════════════════════

const LIKES_FILE = path.join(__dirname, 'data', 'likes.json');

app.get('/api/likes/:id', (req, res) => {
  const col = getLikesCollection();
  const videoId = req.params.id;
  let entry = col.findOne({ videoId });
  res.json({ videoId, likes: entry ? entry.count : 0 });
});

app.post('/api/likes/:id', (req, res) => {
  const col = getLikesCollection();
  const videoId = req.params.id;
  const ip = req.ip;
  let entry = col.findOne({ videoId });
  if (!entry) {
    entry = col.insert({ videoId, count: 0, ips: [] });
  }
  const idx = entry.ips.indexOf(ip);
  let liked;
  if (idx === -1) {
    entry.ips.push(ip);
    entry.count++;
    liked = true;
  } else {
    entry.ips.splice(idx, 1);
    entry.count--;
    liked = false;
  }
  col.update(entry);
  res.json({ videoId, likes: entry.count, liked });
});

app.post('/api/view/:id', (req, res) => {
  const videoId = req.params.id;
  const v = videos.find(x => x.id === videoId);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const ip = req.ip;
  const key = `_viewed_${videoId}`;
  const cookieHeader = req.headers.cookie || '';
  if (cookieHeader.includes(key + '=')) return res.json({ views: v.views });
  v.views = (v.views || 0) + 1;
  res.cookie(key, '1', { maxAge: 86400000, httpOnly: true });
  const col = getVideosCollection();
  if (col) {
    const doc = col.findOne({ id: videoId });
    if (doc) { doc.views = v.views; col.update(doc); }
  }
  res.json({ views: v.views });
});

// Redirect /v/:id to /:id (handles bot probes and legacy links)
app.get('/v/:id', (req, res) => res.redirect(301, '/' + req.params.id.replace(/\.mp4$/i, '')));
app.get('/video/:id', (req, res) => res.redirect(301, '/' + req.params.id.replace(/\.mp4$/i, '')));
// Redirect old /xamateur/real/v/:id links to canonical /xamateur/:id
app.get('/xamateur/real/v/:id', (req, res) => res.redirect(301, '/xamateur/' + req.params.id.replace(/\.mp4$/i, '')));

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

const server = http.createServer({ agent: httpAgent }, app);

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO — Real-time Chat System
// ═══════════════════════════════════════════════════════════════

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const chat = chatServer(io, db, {
  adminPassword: process.env.CHAT_PASSWORD || 'admin123',
  adminName: 'Lucahman'
});
app.locals.chat = chat;

(async () => {
  await loadIndex();
  await loadPages();
  await loadHeroConfig();
  loadDescriptions();
  await loadCornerstonePages();
  await loadXamateurIndex();
  server.listen(PORT, () => {
    const totalViews = videos.reduce((s, v) => s + v.views, 0);
    const cats = getCategories();
    const topCats = cats.slice(0, 5).map(([c, n]) => `${c}:${n}`).join('  ');
    const extraCats = cats.length > 5 ? `  +${cats.length - 5}` : '';
    const memTotal = (os.totalmem() / 1e9).toFixed(1);
    const memUsed = ((os.totalmem() - os.freemem()) / 1e9).toFixed(1);
    const totalLikes = (() => { try { const c = db.getCollection('likes'); return c ? c.chain().data().reduce((s, r) => s + r.count, 0) : 0; } catch { return '?'; } })();
    const topVideo = videos.reduce((best, v) => (v.views || 0) > (best.views || 0) ? v : best, videos[0] || {});
    const L = s => `║  ${s.padEnd(62)}║`;
    const D = `║${' '.repeat(64)}║`;
    const SEP = `╠══════════════════════════════════════════════════════════════════╣`;
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🔥 LUCAHMAN STREAMING SERVER 🔥                   ║
╠══════════════════════════════════════════════════════════════════╣
║  SYSTEM STATUS                                                  ║
${L(`PID ${process.pid}  │  Port ${PORT}  │  ${IS_PROD ? '🚀 PRODUCTION' : '🔧 DEVELOPMENT'}`)}
${L(`Node ${process.version}  │  ${os.platform()}  │  ${os.cpus().length} vCPU  │  ${memUsed}/${memTotal} GB RAM`)}
${SEP}
║  CONTENT                                                        ║
${L(`${videos.length.toLocaleString()} videos indexed  │  ${totalViews.toLocaleString()} total views`)}
${L(`❤️ ${totalLikes.toLocaleString()} total likes  │  🏆 Top: "${(topVideo.title || topVideo.id).substring(0, 30)}"  ${(topVideo.views || 0).toLocaleString()} views`)}
${L(`📂 ${cats.length} categories: ${topCats}${extraCats}`)}
${SEP}
║  CACHE & PERFORMANCE                                            ║
${L(`⚡ Capacitor : 20 GB SSD hot-cache  │  always cycling (LRU)`)}
${L(`💾 microCache: 5,000 items in RAM   │  burstCache: 5s TTL`)}
${L(`🛡️  Rate limit : ${RL_MAX} req/min (${RL_STATIC_MAX} static)  │  keepAlive: 1s`)}
${L(`🆔 Cache version: ${CACHE_VERSION}`)}
${SEP}
║  🛸 OPERATIONS DASHBOARD                                        ║
║                                                              ║
║  🗺️  Sitemap       ${`${SITE_BASE}/sitemap.xml`.padEnd(36)}  XML sitemap for Google         ║
║  💬  Live Chat     ${`${SITE_BASE}/admin/chat`.padEnd(36)}  Monitor & message visitors      ║
║  🔄  Refresh       ${`/api/refresh`.padEnd(48)}  Rebuild index from disk          ║
║  📹  Video Admin   ${`${SITE_BASE}/admin/videos`.padEnd(36)}  Bulk rename / renumber        ║
║  📝  Page Editor   ${`${SITE_BASE}/admin/pages`.padEnd(36)}  Edit cornerstone page content  ║
║  ⭐  Super X       ${`${SITE_BASE}/admin/super-x`.padEnd(36)}  Configure hero carousel       ║
║  📊  Stats         ${`/api/stats`.padEnd(48)}  Live server performance stats     ║
║  ❤️  Health        ${`/api/health`.padEnd(48)}  Server health check              ║
${SEP}
║  📖 QUICK COMMANDS                                               ║
║                                                              ║
║     curl ${SITE_BASE}/api/refresh          # Rebuild cache        ║
║     curl ${SITE_BASE}/admin/chat           # Open chat dashboard  ║
║     curl ${SITE_BASE}/sitemap.xml          # Fetch sitemap        ║
║     curl ${SITE_BASE}/api/stats            # Server stats JSON    ║
║                                                              ║
║     💡 Chat password: set CHAT_PASSWORD env var (default: admin123) ║
║     💡 Cache purge:  GET /api/refresh bumps CACHE_VERSION         ║
║     💡 Hot-cache:    20 GB SSD at ${os.tmpdir()} clears on reboot         ║
${SEP}
║  ROUTES                                                         ║
║  /           xMelayu gallery (malay content)                     ║
║  /:id        Video player page                                   ║
║  /xamateur   USA amateur content (${xmateurVideos.length} videos)              ║
║  /k/:keyword SEO keyword landing pages                           ║
║  /api/*      Stats, health, search, refresh, likes               ║
║  /sitemap    XML sitemap                                         ║
${D}
║  Legend: 2xx=ok  4xx=ratelimit  5xx=error   💬=chat             ║
╚══════════════════════════════════════════════════════════════════╝
`);
  });
})();

process.on('uncaughtException', err => {
  console.error('[FATAL] Uncaught exception:', err.message);
});
process.on('unhandledRejection', err => {
  console.error('[WARN] Unhandled rejection:', err?.message || err);
});