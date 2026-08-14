const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { exec } = require('child_process');
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
const aiWriter = require('./utils/ai-writer');
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

  // Redirect old video filenames (vulgar → clean rename)
  const baseName = filename.replace(/\.mp4$/i, '');
  const newBase = oldIdRedirects.get(baseName);
  if (newBase) return res.redirect(301, '/raw/videos/' + newBase + '.mp4');

  const hddPath = path.join(VIDEO_DIR, filename);
  let stat;
  try { stat = await fsp.stat(hddPath); } catch { return next(); }

  if (hotCache.has(filename)) {
    hotCache.get(filename).atime = Date.now();
    try {
      return res.sendFile(path.join(HOT_CACHE_DIR, filename), {
        headers: { 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable', 'X-Robots-Tag': 'noindex' }
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
        res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable', 'X-Robots-Tag': 'noindex' });
        return fs.createReadStream(hddPath, { start, end });
      })()
    : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800, immutable', 'X-Robots-Tag': 'noindex' }), fs.createReadStream(hddPath));

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
        res.set({ 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800', 'X-Robots-Tag': 'noindex' });
        return fs.createReadStream(filePath, { start, end });
      })()
    : (res.set({ 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800', 'X-Robots-Tag': 'noindex' }), fs.createReadStream(filePath));
  rs.pipe(res);
  res.on('close', () => rs.destroy());
});
// Thumbnails — served from micro-cache first, then disk
const THUMBNAIL_PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect fill="#1a1a1e" width="320" height="240"/><rect fill="#2a2a30" x="120" y="80" width="80" height="80" rx="16"/><polygon fill="#6b6b75" points="145,95 145,145 175,120"/></svg>');

function thumbnailCache(dirs) {
  return (req, res, next) => {
    const filename = path.basename(req.path);
    if (!filename.match(/\.(jpg|jpeg|png|webp)$/i)) return next();

    // Redirect old thumbnail filenames to new (vulgar → clean rename)
    const baseName = filename.replace(/\.[^.]+$/, '');
    const newBase = oldIdRedirects.get(baseName);
    if (newBase) {
      const ext = path.extname(filename);
      return res.redirect(301, '/thumbnails/' + newBase + ext);
    }

    const cached = microCache.get(filename);
    if (cached) {
      res.set({ 'Cache-Control': 'public, max-age=2592000, immutable', 'Vary': 'Accept' });
      res.type(path.extname(filename));
      return res.send(cached);
    }

    const headers = { 'Cache-Control': 'public, max-age=2592000, immutable', 'Vary': 'Accept' };

    (function tryDir(i) {
      if (i >= dirs.length) {
        microCache.set(filename, THUMBNAIL_PLACEHOLDER);
        res.type('image/svg+xml');
        res.set('Cache-Control', 'public, max-age=86400');
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

// ═══ FOCUS KEYWORD SYSTEM — Yoast-style title optimization ═══
// High-value search terms people actually Google (ordered by search volume)
const FOCUS_KEYWORDS = [
  { phrase: 'Awek Tudung', words: ['awek', 'tudung'], priority: 10 },
  { phrase: 'Video Viral Melayu', words: ['viral', 'melayu'], priority: 9 },
  { phrase: 'Tudung Bogel', words: ['tudung', 'bogel'], priority: 9 },
  { phrase: 'Janda Melayu', words: ['janda', 'melayu'], priority: 8 },
  { phrase: 'Bini Montok', words: ['bini', 'montok'], priority: 8 },
  { phrase: 'Ustazah Tudung', words: ['ustazah', 'tudung'], priority: 8 },
  { phrase: 'Skandal Melayu', words: ['skandal', 'melayu'], priority: 7 },
  { phrase: 'Awek Melayu', words: ['awek', 'melayu'], priority: 7 },
  { phrase: 'Bokep Melayu', words: ['bokep', 'melayu'], priority: 7 },
  { phrase: 'Tudung Labuh', words: ['tudung', 'labuh'], priority: 7 },
  { phrase: 'Awek Kolej', words: ['awek', 'kolej'], priority: 6 },
  { phrase: 'Janda Bogel', words: ['janda', 'bogel'], priority: 6 },
  { phrase: 'Tudung', words: ['tudung'], priority: 6 },
  { phrase: 'Awek', words: ['awek'], priority: 6 },
  { phrase: 'Ustazah', words: ['ustazah'], priority: 5 },
  { phrase: 'Janda', words: ['janda'], priority: 5 },
  { phrase: 'Viral', words: ['viral'], priority: 5 },
  { phrase: 'Skandal', words: ['skandal'], priority: 5 },
  { phrase: 'Bini', words: ['bini'], priority: 4 },
  { phrase: 'Montok', words: ['montok'], priority: 4 },
  { phrase: 'Kolej', words: ['kolej'], priority: 4 },
  { phrase: 'Chubby', words: ['chubby'], priority: 4 },
  { phrase: 'Indonesian', words: ['indonesian', 'indo'], priority: 4 },
  { phrase: 'Thai', words: ['thai'], priority: 3 },
  { phrase: 'MILF', words: ['milf'], priority: 3 },
  { phrase: 'Couple', words: ['couple'], priority: 3 },
];

function pickFocusKeyword(video) {
  // Collect all available words from every source
  const allWords = new Set();
  const source = (video.id || '').replace(/-/g, ' ').toLowerCase();
  source.split(/\s+/).forEach(w => { if (w.length > 2) allWords.add(w); });
  (video.keywords || []).forEach(k => allWords.add(k.toLowerCase()));
  (video.subTags || []).forEach(t => allWords.add(t.toLowerCase()));
  if (video.category) allWords.add(video.category.toLowerCase());

  let best = null;
  let bestScore = -1;

  for (const fk of FOCUS_KEYWORDS) {
    const matchCount = fk.words.filter(w => allWords.has(w)).length;
    if (matchCount === 0) continue;
    // Score = how many words matched * priority * match ratio
    const score = matchCount * fk.priority * (matchCount / fk.words.length);
    if (score > bestScore) {
      bestScore = score;
      best = fk;
    }
  }

  return best;
}

function cleanVideoTitle(video) {
  const focus = pickFocusKeyword(video);

  // Build raw words from video ID
  let source = video.id || video.title || '';
  let rawWords = source
    .replace(/\s*[-–|]\s*xMelayu\s*$/i, '')
    .replace(/\.mp4$/i, '')
    .replace(/-[0-9A-F]{4,}$/i, '')
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !EXPLICIT_WORDS.has(w.toLowerCase()));

  if (!rawWords.length) return 'Video - xMelayu';

  // If we found a focus keyword, move its words to the front
  if (focus) {
    const focusLower = focus.words.map(w => w.toLowerCase());
    const focusWords = rawWords.filter(w => focusLower.includes(w.toLowerCase()));
    const otherWords = rawWords.filter(w => !focusLower.includes(w.toLowerCase()));

    // Deduplicate and rebuild: focus words first, then other meaningful words
    const seen = new Set();
    const ordered = [];
    for (const w of [...focusWords, ...otherWords]) {
      const lw = w.toLowerCase();
      if (!seen.has(lw)) { seen.add(lw); ordered.push(w); }
    }

    const title = ordered.slice(0, 8).join(' ').replace(/\b\w/g, c => c.toUpperCase());
    return title + ' - xMelayu';
  }

  // Fallback: no focus keyword found, just clean up the raw title
  const title = rawWords.slice(0, 8).join(' ').replace(/\b\w/g, c => c.toUpperCase());
  return title + ' - xMelayu';
}

function buildVideoMeta(video, videoDesc) {
  const displayTitle = cleanVideoTitle(video);
  const category = video.category || 'Amateur';
  const views = video.views || 0;
  const likes = video.likes || 0;

  const description = videoDesc && videoDesc.text
    ? videoDesc.text.replace(/<[^>]+>/g, '').replace(/^\s*[^\n]+\n/, '').trim().substring(0, 160)
    : `${displayTitle} — Watch this ${category.toLowerCase()} video on xMelayu. ${views} views, ${likes} likes. Real amateur content from Southeast Asia.`;

  const ogDesc = videoDesc && videoDesc.text
    ? videoDesc.text.replace(/<[^>]+>/g, '').substring(0, 200)
    : description;

  const thumbnail = `${SITE_BASE}${video.thumbnail}`;
  const cleanThumbnail = thumbnail.split('?')[0]; // strip ?v= cache-buster for schema

  return { displayTitle, description, ogDesc, thumbnail, cleanThumbnail };
}

function buildVideoSchemas(video, meta, canonicalUrl) {
  const uploadDate = video.uploaded ? new Date(video.uploaded).toISOString() : new Date().toISOString();
  const videoObject = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    'name': meta.displayTitle,
    'description': meta.description,
    'thumbnailUrl': [meta.cleanThumbnail],
    'uploadDate': uploadDate,
    'contentUrl': `${SITE_BASE}/raw/videos/${encodeURIComponent(video.id)}.mp4`,
    'embedUrl': canonicalUrl,
    'duration': 'PT10M',
    'interactionStatistic': [
      { '@type': 'InteractionCounter', 'interactionType': 'https://schema.org/WatchAction', 'userInteractionCount': video.views || 0 },
      { '@type': 'InteractionCounter', 'interactionType': 'https://schema.org/LikeAction', 'userInteractionCount': video.likes || 0 }
    ]
  };

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': meta.displayTitle,
    'description': meta.description,
    'image': meta.thumbnail,
    'datePublished': video.uploaded || new Date().toISOString(),
    'dateModified': video.uploaded || new Date().toISOString(),
    'author': { '@type': 'Organization', 'name': 'xMelayu' },
    'publisher': { '@type': 'Organization', 'name': 'xMelayu', 'logo': { '@type': 'ImageObject', 'url': `${SITE_BASE}/og-default.jpg` } },
    'mainEntityOfPage': canonicalUrl,
    'articleSection': video.category || 'Amateur'
  };

  return [videoObject, article];
}

function invalidateSitemapCache() {
  // no-op placeholder — sitemap is now static files
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
  // Malay/Indonesian vulgar
  'lucah','bogel','pancut','memek','kontol','ngentot','sundal','pantat','kimak',
  'telanjang','bugil','coli','stagen','crot','skandal','henjut','batang','kulum','pepek',
  'isap','bontot','jilat','doggy',
  'mesum','cabul','bejat','entot','ngewe','ngocok','masturbasi',
  // English explicit
  'fuck','fucks','fucking','fucked','cum','cums','cumming','cumshot',
  'slut','sluts','blowjob','blowjobs','handjob','handjobs',
  'creampie','creampies','gangbang','gangbangs','doublepenetration',
  'buttfuck','anal','rimjob','titfuck','footjob','deepthroat','cowgirl',
  'threesome','foursome','squirting',
  // Non-consensual / degrading
  'non-con','noncon','revenge','blackmail','degradation',
  // Sex acts
  'sex','seks','sexual','seduction','seducing','masturbation','bdsm',
  // Other explicit
  'hentai','nsfw','xnxx','xvideo'
]);

const BANNED_WORDS = new Set(['incest','revenge porn','slut','shaming','non-con','noncon','blackmail','revenge']);
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
  const SEO_KW = ['amateur', 'homemade', 'malaysian', 'southeast asian', 'authentic', 'xmelayu', 'xmateur', 'x melayu', 'xmalay', 'xmalayu', 'xmalayporn', 'xmalayporn.com', 'xmalay', 'xmalay.xyz'];

  app.get('/', cachePage, async (req, res) => {
    const canonicalUrl = `${SITE_BASE}/`;
    const websiteSchema = seo.generateStructuredData('website');
    const orgSchema = seo.generateStructuredData('organization');
    const tags = getTags();
    const extraTags = [];

    const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
    const updatedLabel = 'Today';

  const filterCategory = req.query.cat || '';
  let filterTitle = 'xMelayu | Awek Tudung, Viral Malay Porn & Amateur Videos';
  let filterH1 = null;
  let filterDesc = 'Watch 6000+ Malaysian, Indonesian & Thai amateur videos in HD. Awek tudung, viral scandals, bini montok. Free streaming, updated daily.';
  let filterKw = 'xmelayu, x melayu, xmalay, xmalayu, xxmelayu, xxxmelayu, xmalayporn, xmalayporn.com, xmalay, xmalay.xyz, malay porn, awek tudung, melayu xxx, viral scandal, bini montok, janda bogel, bokep melayu, indonesian viral, thai amateur';
  if (filterCategory) {
    filterTitle = `xMelayu | ${filterCategory} Amateur Videos & Malay Porn HD`;
    filterH1 = `xMelayu — ${filterCategory} Malaysian Videos`;
    filterDesc = `Watch ${filterCategory} Malaysian amateur videos in HD. Awek tudung, viral scandal, bini montok. Free streaming, updated daily.`;
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
    ssrVideos,
    cornerstonePages
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

// ═══ BRAND LANDING PAGE — ranks for all brand name variations ═══
app.get('/xmelayu', cachePage, (req, res) => {
  const canonicalUrl = `${SITE_BASE}/xmelayu`;
  const topVideos = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 48);

  const brandSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'xMelayu',
    'alternateName': ['x Melayu', 'xx Melayu', 'xxx Melayu', 'xmalay', 'xmalayu', 'xmelayu site'],
    'url': SITE_BASE,
    'description': 'xMelayu (also known as x Melayu, xmalay, xx Melayu, xxx Melayu) — Southeast Asia\'s largest amateur video platform with 6000+ videos from Malaysia, Indonesia, Thailand and beyond.',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${SITE_BASE}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };

  const content = `<h2>What is xMelayu?</h2>
<p><strong>xMelayu</strong> (also written as <strong>x Melayu</strong>, <strong>xmalay</strong>, <strong>xmelayu site</strong>, or <strong>xx Melayu</strong>) is Southeast Asia's largest amateur video platform featuring authentic homemade content from Malaysia, Indonesia, Thailand, and across the region.</p>
<p>Whether you search for us as <strong>xMelayu</strong>, <strong>x Melayu</strong>, <strong>xmalay</strong>, <strong>xmalayu</strong>, <strong>xxmelayu</strong>, or <strong>xxxmelayu</strong> — you've found the right place. We are the official home for all xMelayu content.</p>

<h2>Why xMelayu?</h2>
<ul>
<li><strong>6000+ Videos</strong> — Malaysian, Indonesian, Thai, and Southeast Asian amateur content</li>
<li><strong>HD Streaming</strong> — All videos available in full HD quality</li>
<li><strong>Updated Daily</strong> — Fresh uploads every single day</li>
<li><strong>100% Free</strong> — No subscriptions, no paywalls, no hidden fees</li>
<li><strong>Real Content</strong> — Authentic amateur videos, not studio-produced</li>
</ul>

<h2>xMelayu vs Other Platforms</h2>
<p>xMelayu stands out because we focus exclusively on authentic Southeast Asian amateur content. While other platforms mix studio content with amateur videos, xMelayu curates only real homemade videos from verified creators across Malaysia, Indonesia, and Thailand.</p>

<h2>Is xMelayu Free?</h2>
<p>Yes, <strong>xMelayu is completely free</strong>. You can watch all 6000+ videos without creating an account, without entering credit card details, and without any hidden charges. Just click and watch.</p>

<h2>How to Access xMelayu</h2>
<p>xMelayu is accessible worldwide at <a href="${SITE_BASE}" style="color:#ff2d55">xmelayu.site</a>. No VPN needed for most regions. We support multiple languages including English, Malay, Indonesian, and Thai.</p>`;

  res.render('keyword', {
    title: 'xMelayu — Official Site | x Melayu, xmalay, xx Melayu, xxx Melayu',
    metaDescription: 'xMelayu (x Melayu, xmalay) — Southeast Asia\'s largest free amateur video platform. 6000+ Malaysian, Indonesian & Thai videos. HD streaming.',
    keywords: 'xmelayu, x melayu, xmalay, xmalayu, xxmelayu, xxxmelayu, xx melayu, xxx melayu, x melayu porn, xmelayu site, malay porn, awek tudung',
    heading: 'xMelayu — The Official xMelayu Site',
    canonicalUrl,
    videos: topVideos,
    content,
    relatedKeywords: ['x melayu', 'xmalay', 'xmelayu site', 'xx melayu', 'xxx melayu', 'malay porn', 'amateur videos'],
    structuredData: [brandSchema],
    lang: 'en'
  });
});

// ═══ COMPETITOR NAME LANDING PAGES — ranks when people search competitor brands ═══
function buildCompetitorPage(competitorName, competitorDomains, altNames, content) {
  return (req, res) => {
    const topVideos = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 48);
    const canonicalUrl = `${SITE_BASE}${req.path}`;

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'xMelayu',
      'alternateName': altNames,
      'url': SITE_BASE,
      'description': `xMelayu — the best alternative to ${competitorName}. Free amateur videos from Malaysia, Indonesia & Southeast Asia.`
    };

    res.render('keyword', {
      title: `xMelayu vs ${competitorName} — Better Free Malay Videos | xMelayu`,
      metaDescription: `Looking for ${competitorName}? xMelayu has 6000+ free Malaysian, Indonesian & Thai amateur videos. HD streaming, updated daily, no signup needed.`,
      keywords: `${competitorName.toLowerCase()}, ${competitorDomains.join(', ')}, ${altNames.join(', ')}, malay porn, xmelayu, free amateur videos`,
      heading: `xMelayu — Better Than ${competitorName}`,
      canonicalUrl,
      videos: topVideos,
      content,
      relatedKeywords: [competitorName.toLowerCase(), ...competitorDomains, ...altNames.slice(0, 5)],
      structuredData: [schema],
      lang: 'en'
    });
  };
}

const competitorContent = {
  xmalayporn: `<h2>xMelayu vs xMalayPorn.com</h2>
<p>Looking for <strong>xMalayPorn</strong>? You've found <strong>xMelayu</strong> — the better alternative with more videos, better quality, and faster streaming.</p>
<p>While xMalayPorn.com offers a limited collection, <strong>xMelayu has 6000+ videos</strong> from Malaysia, Indonesia, Thailand, and across Southeast Asia. All videos are free, HD quality, and updated daily.</p>
<h2>Why Choose xMelayu Over xMalayPorn?</h2>
<ul>
<li><strong>More Content</strong> — 6000+ videos vs limited library</li>
<li><strong>Better Quality</strong> — All videos in HD, not compressed garbage</li>
<li><strong>Faster Streaming</strong> — Optimized servers for instant loading</li>
<li><strong>No Ads</strong> — Clean viewing experience, no pop-ups</li>
<li><strong>Daily Updates</strong> — Fresh content uploaded every day</li>
<li><strong>100% Free</strong> — No subscriptions, no paywalls</li>
</ul>
<h2>What Makes xMelayu Different?</h2>
<p>xMelayu curates only <strong>authentic amateur content</strong> — real homemade videos from real people across Southeast Asia. We focus on quality over quantity, ensuring every video is genuine and high-quality.</p>
<p>Whether you call it <strong>xMalayPorn</strong>, <strong>x Malay Porn</strong>, or just <strong>xmalay</strong> — xMelayu has you covered with the best free Malaysian amateur content available anywhere online.</p>`,

  xmalay: `<h2>xMelayu vs xMalay</h2>
<p>Searching for <strong>xMalay</strong> or <strong>xMalay.xyz</strong>? <strong>xMelayu</strong> is the upgraded experience with 6000+ free videos from Malaysia, Indonesia, and Thailand.</p>
<p>Formerly known as <strong>xMalay1.net</strong>, xMalay has rebranded multiple times. xMelayu is the stable, reliable home for Southeast Asian amateur content that you can trust.</p>
<h2>xMelayu Advantages</h2>
<ul>
<li><strong>6000+ Videos</strong> — The largest collection of Malaysian, Indonesian & Thai amateur content</li>
<li><strong>HD Quality</strong> — Every video streams in full HD</li>
<li><strong>Instant Loading</strong> — Optimized for speed, no buffering</li>
<li><strong>No Registration</strong> — Watch immediately, no signup required</li>
<li><strong>Mobile Friendly</strong> — Perfect viewing on any device</li>
<li><strong>Daily Fresh Content</strong> — New videos every day</li>
</ul>
<h2>The xMelayu Difference</h2>
<p>xMelayu isn't just another <strong>xMalay</strong> clone. We're a curated platform that focuses on <strong>authentic Southeast Asian amateur content</strong> — real videos from real people across Malaysia, Indonesia, and Thailand.</p>
<p>Stop searching for <strong>xMalay.xyz</strong> or <strong>xMalay1.net</strong>. xMelayu is your one-stop destination for the best free Malay, Indonesian, and Thai amateur videos online.</p>`
};

app.get('/xmalayporn', cachePage, buildCompetitorPage(
  'xMalayPorn.com',
  ['xmalayporn.com', 'xmalayporn.net'],
  ['xmalayporn', 'x malay porn', 'xmalay porn', 'xmelayu porn'],
  competitorContent.xmalayporn
));

app.get('/xmalay', cachePage, buildCompetitorPage(
  'xMalay',
  ['xmalay.xyz', 'xmalay1.net', 'xmalay.com'],
  ['xmalay', 'x malay', 'xmalay1', 'xmalay xyz', 'xmalay1.net'],
  competitorContent.xmalay
));

// ═══ QUICK-WIN LONG-TAIL LANDING PAGES — targets keywords at positions 30-80 ═══
const QUICK_WIN_PAGES = {
  'xxmelayu': {
    title: 'XXMelayu — Viral Malay XXX Videos | xMelayu',
    desc: 'Looking for XXMelayu? xMelayu has 6000+ free Malaysian viral XXX videos. HD streaming, updated daily, 100% free.',
    h1: 'XXMelayu — Free Malay XXX Videos',
    content: `<h2>XXMelayu Videos</h2>
<p>You searched for <strong>XXMelayu</strong> — you found <strong>xMelayu</strong>, the largest free Malaysian amateur video platform with 6000+ videos.</p>
<p>Whether you spell it <strong>XXMelayu</strong>, <strong>xx melayu</strong>, or <strong>xxx melayu</strong>, xMelayu has the best collection of authentic Malaysian, Indonesian, and Thai amateur videos. All content is free, HD quality, and updated daily.</p>
<h2>What is XXMelayu?</h2>
<p><strong>XXMelayu</strong> is a popular search term for Malaysian adult content. xMelayu is the official platform that delivers exactly what you're looking for — real amateur videos from Southeast Asia.</p>
<h2>Why xMelayu?</h2>
<ul><li><strong>6000+ Videos</strong> — the largest collection online</li><li><strong>HD Quality</strong> — every video in full HD</li><li><strong>Daily Updates</strong> — fresh content every day</li><li><strong>100% Free</strong> — no signup, no paywalls</li><li><strong>Real Content</strong> — authentic amateur videos only</li></ul>`,
    keywords: 'xxmelayu, xx melayu, xxx melayu, melayu xxx, malay porn, viral melayu, xmelayu'
  },
  'x-melayu-sex': {
    title: 'X Melayu Sex — Free Malaysian Sex Videos | xMelayu',
    desc: 'X Melayu Sex videos — 6000+ free Malaysian, Indonesian & Thai amateur sex videos on xMelayu. HD streaming, updated daily.',
    h1: 'X Melayu Sex — Free Malaysian Amateur Videos',
    content: `<h2>X Melayu Sex Videos</h2>
<p>Searching for <strong>X Melayu Sex</strong>? xMelayu has thousands of free Malaysian amateur sex videos — real content from real people across Southeast Asia.</p>
<p>Whether you search for <strong>x melayu sex</strong>, <strong>x melayu seks</strong>, or <strong>sex xmelayu</strong>, you've found the right place. xMelayu is the largest free platform for authentic Malaysian amateur content.</p>
<h2>Malaysian Amateur Content</h2>
<p>xMelayu features <strong>6000+ videos</strong> from Malaysia, Indonesia, and Thailand. Every video is real amateur content — not studio-produced. From viral scandals to couple videos, hijab content to outdoor adventures.</p>
<h2>Free HD Streaming</h2>
<ul><li><strong>No Registration</strong> — watch instantly</li><li><strong>HD Quality</strong> — full resolution streaming</li><li><strong>Mobile Friendly</strong> — perfect on any device</li><li><strong>Daily Updates</strong> — new videos every day</li></ul>`,
    keywords: 'x melayu sex, x melayu seks, sex xmelayu, melayu sex, malay sex, xmelayu sex'
  },
  'video-lucah-melayu': {
    title: 'Video Lucah Melayu — Free Malaysian Porn Videos | xMelayu',
    desc: 'Video Lucah Melayu — 6000+ free Malaysian amateur porn videos on xMelayu. HD quality, updated daily, no signup needed.',
    h1: 'Video Lucah Melayu — Free Malaysian Porn',
    content: `<h2>Video Lucah Melayu</h2>
<p>Looking for <strong>video lucah melayu</strong>? xMelayu has 6000+ free Malaysian amateur videos — the largest collection of authentic Southeast Asian content online.</p>
<p>Whether you call it <strong>video lucah melayu</strong>, <strong>lucah melayu</strong>, or <strong>melayu lucah</strong>, xMelayu delivers real amateur content from Malaysia, Indonesia, and Thailand.</p>
<h2>What Makes xMelayu Different?</h2>
<p>Unlike other platforms, xMelayu focuses on <strong>authentic amateur content</strong>. Every video is real — real couples, real situations, real passion. No studio productions, no fake scenarios.</p>
<h2>Features</h2>
<ul><li><strong>6000+ Videos</strong> — the largest Malaysian amateur collection</li><li><strong>HD Quality</strong> — all videos stream in full HD</li><li><strong>Instant Access</strong> — no registration required</li><li><strong>Mobile Optimized</strong> — watch on any device</li><li><strong>Daily Fresh Content</strong> — new uploads every day</li></ul>`,
    keywords: 'video lucah melayu, lucah melayu, melayu lucah, lucah malay, malay lucah, xmelayu'
  },
  'xmalay-video': {
    title: 'XMalay Videos — Free Malaysian Amateur Videos | xMelayu',
    desc: 'XMalay Videos — 6000+ free Malaysian amateur videos on xMelayu. HD streaming, updated daily, no signup needed.',
    h1: 'XMalay Videos — Free Malaysian Amateur Content',
    content: `<h2>XMalay Videos</h2>
<p>Searching for <strong>XMalay videos</strong>? xMelayu has 6000+ free Malaysian amateur videos — more content, better quality, and faster streaming than any other platform.</p>
<p>Whether you search for <strong>xmalay videos</strong>, <strong>x malay video</strong>, or <strong>xmalay video</strong>, xMelayu is your destination for the best Malaysian amateur content online.</p>
<h2>Why xMelayu?</h2>
<ul><li><strong>More Videos</strong> — 6000+ and growing daily</li><li><strong>Better Quality</strong> — all HD, not compressed</li><li><strong>Faster Loading</strong> — optimized servers</li><li><strong>No Ads</strong> — clean viewing experience</li><li><strong>Free Forever</strong> — no hidden charges</li></ul>`,
    keywords: 'xmalay video, xmalay videos, x malay video, xmalay, xmalayporn, xmelayu'
  },
  'xlucah': {
    title: 'XLucah Malay — Free Malaysian Amateur Videos | xMelayu',
    desc: 'XLucah Malay videos — 6000+ free Malaysian amateur videos on xMelayu. HD quality, updated daily, 100% free.',
    h1: 'XLucah Malay — Free Malaysian Videos',
    content: `<h2>XLucah Malay</h2>
<p>Looking for <strong>XLucah Malay</strong>? You've found <strong>xMelayu</strong> — the largest free platform for authentic Malaysian, Indonesian, and Thai amateur videos.</p>
<p>Whether you call it <strong>xlucah malay</strong>, <strong>x lucah melayu</strong>, or just <strong>xlucah</strong>, xMelayu has 6000+ videos with HD streaming and daily updates.</p>
<h2>The xMelayu Advantage</h2>
<ul><li><strong>6000+ Videos</strong> — largest collection online</li><li><strong>HD Quality</strong> — full resolution streaming</li><li><strong>Daily Updates</strong> — fresh content every day</li><li><strong>100% Free</strong> — no signup needed</li><li><strong>Real Content</strong> — authentic amateur videos</li></ul>`,
    keywords: 'xlucah malay, x lucah melayu, xlucah, lucah melayu, malay lucah, xmelayu'
  }
};

Object.entries(QUICK_WIN_PAGES).forEach(([slug, page]) => {
  app.get(`/quick/${slug}`, cachePage, (req, res) => {
    const topVideos = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 48);
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'xMelayu',
      'url': SITE_BASE,
      'description': page.desc
    };
    res.render('keyword', {
      title: page.title,
      metaDescription: page.desc,
      keywords: page.keywords,
      heading: page.h1,
      canonicalUrl: `${SITE_BASE}/quick/${slug}`,
      videos: topVideos,
      content: page.content,
      relatedKeywords: Object.keys(QUICK_WIN_PAGES).filter(k => k !== slug),
      structuredData: [schema],
      lang: 'en'
    });
  });
});

// Brand variation redirects → canonical /xmelayu page
['/xmalayu', '/xxmelayu', '/xxxmelayu', '/x-melayu', '/x_melayu'].forEach(path => {
  app.get(path, (req, res) => res.redirect(301, '/xmelayu'));
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
app.post('/api/ai-describe/:id', (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  const corpus = videos.slice(0, 500).map(v => v.title || v.name || '').filter(Boolean);
  const result = aiWriter.generateDescription(video, corpus);
  videoDescriptions[video.id] = result;
  fsp.writeFile(DESCRIPTIONS_FILE, JSON.stringify({ descriptions: videoDescriptions }, null, 2)).catch(() => {});
  res.json({ id: video.id, text: result.text, keywords: result.keywords });
});
app.get('/api/refresh', async (req, res) => { console.log('\n🔄 [ADMIN] Refresh requested...\n'); videos = await loadIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });
app.get('/robots.txt', (req, res) => {
  stats.cache.hits++;
  res.type('text/plain').send(`User-agent: *
Disallow: /api/
Disallow: /raw/
Disallow: /admin

User-agent: Googlebot
Disallow: /api/
Disallow: /raw/
Disallow: /admin

Sitemap: ${SITE_BASE}/sitemap-index.xml
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

const SITEMAP_FILE = path.join(__dirname, 'public', 'sitemap.xml');

app.get('/sitemap.xml', (req, res) => {
  if (!fs.existsSync(SITEMAP_FILE)) {
    return res.status(404).type('text').send('Sitemap not yet generated. Run: node tools/generate-sitemap.js');
  }
  res.sendFile(SITEMAP_FILE, { maxAge: '1h', headers: { 'Content-Type': 'application/xml' } });
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
  'amateur': { title: 'Amateur', h1: 'Amateur — Real Homemade Asian Amateur Videos', emoji: '📹', lang: 'en' },
  'homemade': { title: 'Homemade', h1: 'Homemade — Real Amateur Home Videos', emoji: '🏠', lang: 'en' },
  'tudung': { title: 'Tudung', h1: 'Tudung — Video Tudung Melayu Amateur', emoji: '🧕', lang: 'ms' },
  'hijab': { h1: 'Hijab — Malay Muslimah Amateur Videos', emoji: '🧕', lang: 'en' },
  'malay': { title: 'Malay', h1: 'Malay — Malaysian Amateur Videos', emoji: '🇲🇾', lang: 'en' },
  'melayu': { title: 'Melayu', h1: 'Melayu — Malay Amateur Videos', emoji: '🇲🇾', lang: 'ms' },
  'indonesian': { title: 'Indonesian', h1: 'Indonesian — Real Indo Amateur Videos', emoji: '🇮🇩', lang: 'en' },
  'indo': { title: 'Indo', h1: 'Indo — Indonesian Amateur Videos', emoji: '🇮🇩', lang: 'en' },
  'thai': { title: 'Thai', h1: 'Thai — Real Thai Amateur Videos', emoji: '🇹🇭', lang: 'en' },
  'japanese': { title: 'Japanese', h1: 'Japanese — Real Jap Amateur Videos', emoji: '🇯🇵', lang: 'en' },
  'korean': { title: 'Korean', h1: 'Korean — Real South Korean Amateur Videos', emoji: '🇰🇷', lang: 'en' },
  'chinese': { title: 'Chinese', h1: 'Chinese — Real Chinese Amateur Videos', emoji: '🇨🇳', lang: 'en' },
  'vietnamese': { title: 'Vietnamese', h1: 'Vietnamese — Real Viet Amateur Videos', emoji: '🇻🇳', lang: 'en' },
  'filipino': { title: 'Filipino', h1: 'Filipino — Pinay Amateur Videos', emoji: '🇵🇭', lang: 'en' },
  'milf': { title: 'MILF', h1: 'MILF — Mature Asian Amateur Videos', emoji: '🔥', lang: 'en' },
  'teen': { title: 'Teen', h1: 'Teen — Young Asian Amateur Videos', emoji: '🌸', lang: 'en' },
  'couple': { title: 'Couple', h1: 'Couple — Real Couple Amateur Videos', emoji: '💑', lang: 'en' },
  'bini': { title: 'Bini', h1: 'Bini — Malay Wife Amateur Videos', emoji: '💢', lang: 'ms' },
  'janda': { title: 'Janda', h1: 'Janda — Malay Divorcee Amateur Videos', emoji: '💋', lang: 'ms' },
  'viral': { title: 'Viral', h1: 'Viral — Trending Malay Amateur Videos', emoji: '📈', lang: 'en' },
  'skandal': { title: 'Skandal', h1: 'Skandal — Malay Scandal Amateur Videos', emoji: '🔴', lang: 'ms' },
  'bocor': { title: 'Bocor', h1: 'Bocor — Leaked Malay Amateur Videos', emoji: '💧', lang: 'ms' },
  'chubby': { title: 'Chubby', h1: 'Chubby — BBW Malay Amateur Videos', emoji: '🍑', lang: 'en' },
  'montok': { title: 'Montok', h1: 'Montok — Thick Curvy Malay Amateur Videos', emoji: '🔥', lang: 'ms' },
  'kolej': { title: 'Kolej', h1: 'Kolej — Malaysian College Amateur Videos', emoji: '🎓', lang: 'ms' },
  'pov': { title: 'POV', h1: 'POV — Point of View Amateur Videos Asia', emoji: '👁️', lang: 'en' },
  'public': { title: 'Public', h1: 'Public — Outdoor Asian Amateur Videos', emoji: '🌳', lang: 'en' },
  'private': { title: 'Private', h1: 'Private — Exclusive Personal Amateur Videos', emoji: '🤫', lang: 'en' },
  'awek': { title: 'Awek', h1: 'Awek — Video Awek Melayu Amateur', emoji: '🇲🇾', lang: 'ms' },
  'ustazah': { title: 'Ustazah', h1: 'Ustazah — Video Ustazah Melayu Amateur', emoji: '🧕', lang: 'ms' },
  'bogel': { title: 'Bogel', h1: 'Bogel — Video Bogel Melayu Amateur', emoji: '🔥', lang: 'ms' },
  'kereta': { title: 'Kereta', h1: 'Kereta — Video Dalam Kereta Melayu', emoji: '🚗', lang: 'ms' },
  'tandas': { title: 'Tandas', h1: 'Tandas — Video Tandas Melayu Amateur', emoji: '🚻', lang: 'ms' },
  'homestay': { title: 'Homestay', h1: 'Homestay — Video Homestay Melayu Amateur', emoji: '🏨', lang: 'ms' },
  'hotel': { title: 'Hotel', h1: 'Hotel — Video Hotel Melayu Amateur', emoji: '🏨', lang: 'en' },
  'outdoor': { title: 'Outdoor', h1: 'Outdoor — Video Outdoor Melayu Amateur', emoji: '🌳', lang: 'en' },
  'pancut': { title: 'Pancut', h1: 'Pancut — Video Pancut Dalam Melayu', emoji: '💦', lang: 'ms' },
  'henjut': { title: 'Henjut', h1: 'Henjut — Video Henjut Keras Melayu', emoji: '🔥', lang: 'ms' },
  'kulum': { title: 'Kulum', h1: 'Kulum — Video Kulum Batang Melayu', emoji: '💋', lang: 'ms' },
  'jilat': { title: 'Jilat', h1: 'Jilat — Video Jilat Pepek Melayu', emoji: '👅', lang: 'ms' },
  'non-con': { title: 'Non-Con', h1: 'Non-Con — Amateur Videos', emoji: '⚠️', lang: 'en' },
  'revenge': { title: 'Revenge', h1: 'Revenge Porn — Amateur Videos', emoji: '🔴', lang: 'en' },
  'blackmail': { title: 'Blackmail', h1: 'Blackmail — Amateur Videos', emoji: '🖤', lang: 'en' },
  'bdsm': { title: 'BDSM', h1: 'BDSM — Amateur Videos', emoji: '⛓️', lang: 'en' },
  'gangbang': { title: 'Gangbang', h1: 'Gangbang — Amateur Videos', emoji: '👥', lang: 'en' },
  'creampie': { title: 'Creampie', h1: 'Creampie — Amateur Videos', emoji: '💦', lang: 'en' },
  'squirt': { title: 'Squirt', h1: 'Squirt — Amateur Videos', emoji: '💦', lang: 'en' },
  'lesbian': { title: 'Lesbian', h1: 'Lesbian — Amateur Videos', emoji: '🌈', lang: 'en' },
  'stepsister': { title: 'Stepsister', h1: 'Stepsister — Amateur Videos', emoji: '🍑', lang: 'en' },
  'maid': { title: 'Maid', h1: 'Maid — Amateur Videos', emoji: '🧹', lang: 'en' },
  'office': { title: 'Office', h1: 'Office — Amateur Videos', emoji: '💼', lang: 'en' },
  'asrama': { title: 'Asrama', h1: 'Asrama — Video Asrama Melayu Amateur', emoji: '🎓', lang: 'ms' },
  'projek': { title: 'Projek', h1: 'Projek — Video Projek Melayu Amateur', emoji: '🔥', lang: 'ms' },
  'lif': { title: 'Lif', h1: 'Lif — Video Dalam Lif Melayu', emoji: '🛗', lang: 'ms' },
  'ramas': { title: 'Ramas', h1: 'Ramas — Video Ramas Tetek Melayu', emoji: '✋', lang: 'ms' },
  'crot': { title: 'Crot', h1: 'Crot — Video Crot Di Muka Melayu', emoji: '💦', lang: 'ms' },
  'main': { title: 'Main', h1: 'Main — Video Main Melayu Amateur', emoji: '🔥', lang: 'ms' },
  'rakam': { title: 'Rakam', h1: 'Rakam — Video Rakam Phone Melayu', emoji: '📱', lang: 'ms' },
};

const MALAY_KEYWORDS = new Set([
  'awek', 'ustazah', 'bogel', 'kereta', 'tandas', 'homestay', 'pancut', 'henjut',
  'kulum', 'jilat', 'melayu', 'bini', 'janda', 'skandal', 'bocor', 'montok',
  'kolej', 'asrama', 'projek', 'lif', 'ramas', 'crot', 'main', 'rakam',
  'bawal', 'labuh', 'gans', 'gersang', 'ajak', 'senyap', 'tetek', 'padu',
  'malay', 'malaysia', 'sabah', 'sarawak', 'tudung', 'bini', 'janda',
  'viral', 'skandal', 'bocor', 'chubby', 'montok', 'kolej'
]);

function generateKeywordContent(keyword, matchedVideos) {
  const tpl = SEO_CONTENT_TEMPLATES[keyword];
  const count = matchedVideos.length;
  const totalViews = matchedVideos.reduce((s, v) => s + (v.views || 0), 0);
  const categories = [...new Set(matchedVideos.map(v => v.category).filter(Boolean))];
  const isMs = tpl && tpl.lang === 'ms';

  // Pick a random high-view video for example
  const topVideo = matchedVideos.length > 0 ? matchedVideos.sort((a, b) => b.views - a.views)[0] : null;

  const titleWord = tpl ? tpl.title : keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const emoji = tpl ? tpl.emoji : (isMs ? '🇲🇾' : '🔞');

  if (isMs) {
    const h1 = tpl ? tpl.h1 : `${titleWord} — Video ${titleWord} Melayu Amateur`;
    const content = `<h2>${emoji} ${h1}</h2>
<p><strong>xMelayu</strong> menampilkan koleksi <strong>${count} video ${keyword} amateur</strong> — konten sebenar dari Malaysia, Indonesia, Thailand, dan seluruh Asia Tenggara. Setiap video adalah kandungan rumah yang autentik.</p>
<p>Sama ada anda mencari <strong>video ${keyword} amateur</strong>, <strong>klip ${keyword}</strong>, atau koleksi ${keyword} terbaik, kategori ini menyampaikan passion mentah dari orang sebenar. Kategori ${keyword} kami dikemas kini setiap hari dengan muat naik baharu.</p>${categories.length > 0 ? `
<h3>Kategori ${keyword} Teratas</h3>
<p>Koleksi ${keyword} kami merangkumi pelbagai kategori: ${categories.slice(0, 5).join(', ')}. Setiap video dipilih dengan teliti untuk ketulenan dan kualiti.</p>` : ''}
<h3>Kenapa Tonton Video ${titleWord} di xMelayu?</h3>
<p><strong>Kandungan Autentik:</strong> Setiap video adalah content amateur sebenar, bukan studio.<br>
<strong>Kualiti HD:</strong> Semua video strim dalam kualiti HD dengan muat turun pantas.<br>
<strong>Dikemas Kini Setiap Hari:</strong> Video ${keyword} baharu ditambah setiap hari.<br>
<strong>PERCUMA:</strong> Tiada langganan diperlukan — semua kandungan percuma untuk ditonton.</p>
<p>Lihat koleksi <a href="/" style="color:#ff2d55">video ${keyword} amateur</a> kami dan temui mengapa ribuan penonton memilih xMelayu untuk dose harian kandungan amateur Asia tulen.</p>`;
    return { title: `${h1} | xMelayu`, h1, content, emoji };
  }

  const h1 = tpl ? tpl.h1 : `${titleWord} — ${titleWord} Amateur Videos`;
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

  if (matched.length === 0) return res.redirect('/');

  const seoContent = generateKeywordContent(keyword, matched);
  const relatedKeywords = findRelatedKeywords(keyword, matched);
  const isMalay = MALAY_KEYWORDS.has(keyword) || (seoContent.h1 && /Video \w+ Melayu/.test(seoContent.h1));

  const canonicalUrl = `${SITE_BASE}/k/${encodeURIComponent(keyword)}`;
  const websiteSchema = seo.generateStructuredData('website');
  const gallerySchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': seoContent.h1,
    'description': isMalay
      ? `${matched.length} video ${keyword} - konten amateur autentik dari Malaysia.`
      : `${matched.length} ${keyword} porn videos - authentic amateur content.`,
    'url': canonicalUrl,
    'numberOfItems': matched.length
  };

  res.render('keyword', {
    title: seoContent.title,
    metaDescription: isMalay
      ? `Tonton ${matched.length} video ${keyword} percuma. Kandungan amateur sebenar dari Malaysia, Indonesia & Asia Tenggara. Strim HD, dikemas kini setiap hari.`
      : `Watch ${matched.length} free ${keyword} porn videos. Real amateur ${keyword} content from Malaysia, Indonesia & Southeast Asia. HD streaming, updated daily.`,
    keywords: [keyword, ...relatedKeywords.slice(0, 5), isMalay ? 'video melayu' : 'amateur porn', isMalay ? 'malay porn' : 'asian porn', 'xmelayu'].join(', '),
    heading: seoContent.h1,
    canonicalUrl,
    videos: matched.slice(0, 72),
    content: seoContent.content,
    relatedKeywords,
    structuredData: [websiteSchema, gallerySchema],
    lang: isMalay ? 'ms' : 'en'
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

// ═══ 301 REDIRECTS — old vulgar IDs → clean IDs (Map lookup, not individual routes) ═══
const oldIdRedirects = new Map();
const newIdToOldId = new Map(); // reverse: newId → oldId (for SEO H1)
const backupNameMap = new Map(); // videoId → archival "xmelayu-NNNN-name" title
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'old-id-redirects.json'), 'utf8'));
  for (const [oldId, newId] of Object.entries(raw)) {
    oldIdRedirects.set(oldId, newId);
    newIdToOldId.set(newId, oldId);
  }
  console.log(`Loaded ${oldIdRedirects.size} old-id redirects (Map lookup)`);
} catch (e) {
  console.error('Failed to load old-id redirects:', e.message);
}
// Load backup index to get archival "xmelayu-NNNN-name" titles (indexed by Google)
try {
  const backupIdx = JSON.parse(fs.readFileSync(path.join(__dirname, 'data-backup-old', 'video-index.json'), 'utf8'));
  for (const entry of Object.values(backupIdx)) {
    if (entry.id && entry.name) backupNameMap.set(entry.id, entry.name);
  }
  console.log(`Loaded ${backupNameMap.size} backup archival names`);
} catch (e) {
  console.error('Failed to load backup names:', e.message);
}

// Single middleware — O(1) Map lookup instead of 5000+ route registrations
app.use((req, res, next) => {
  // Only check single-segment paths like /Old-Video-Id-AB12CD
  const id = req.path.replace(/^\//, '').replace(/\/.*$/, '');
  if (id && oldIdRedirects.has(id)) return res.redirect(301, '/' + oldIdRedirects.get(id));
  next();
});

app.get('/:id', async (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });

  const videoDesc = videoDescriptions[video.id] || null;
  const canonicalUrl = `${SITE_BASE}/${video.id}`;
  const meta = buildVideoMeta(video, videoDesc);

  // Score related videos by keyword/tag overlap + views
  const others = videos.filter(v => v.id !== video.id);
  const allScored = others.map(v => {
    let score = 0;
    if (v.category === video.category) score += 3;
    score += (video.keywords?.filter(k => v.keywords?.includes(k)).length || 0) * 2;
    score += (video.subTags?.filter(t => v.subTags?.includes(t)).length || 0) * 2;
    score += Math.log2((v.views || 100) + 1) * 0.5;
    return { v, score };
  }).sort((a, b) => b.score - a.score);

  // Section slices — each section pulls from different offset of scored list
  const heroRelated = allScored.slice(0, 24).map(x => x.v);
  const related = allScored.filter(x => x.score > 0).slice(0, 30).map(x => x.v);

  // Trending / Most Viewed — by global views
  const byViews = [...others].sort((a, b) => (b.views || 0) - (a.views || 0));
  const trending = byViews.slice(0, 20);
  const mostViewed = byViews.slice(20, 40);

  // Editor's Picks — shuffle top 30% quality pool
  const qualityPool = byViews.slice(0, Math.floor(others.length * 0.3) || 1);
  const editorsPicks = shuffle(qualityPool).slice(0, 20);

  // Category groups
  const catMap = {};
  others.forEach(v => {
    const cat = v.category || 'Other';
    if (!catMap[cat]) catMap[cat] = [];
    if (catMap[cat].length < 20) catMap[cat].push(v);
  });
  const categoryGroups = Object.entries(catMap).sort((a, b) => b[1].length - a[1].length).slice(0, 8);

  // Recent + Explore
  const recent = [...others].sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0)).slice(0, 20);
  const allShuffled = shuffle(others);
  const seg = Math.floor(allShuffled.length / 3);

  // Prev/Next nav
  const prevVideo = allScored[0]?.v || null;
  const nextVideo = allScored[1]?.v || allScored[0]?.v || null;

  res.render('player', {
    displayTitle: meta.displayTitle,
    seoTitle: meta.displayTitle,
    title: meta.displayTitle,
    oldId: backupNameMap.get(video.id) || (newIdToOldId.has(video.id) ? backupNameMap.get(newIdToOldId.get(video.id)) : null) || null,
    video,
    heroRelated,
    related,
    categoryGroups,
    trending,
    mostViewed,
    editorsPicks,
    recent,
    exploreSlice1: allShuffled.slice(0, 20),
    exploreSlice2: allShuffled.slice(seg, seg + 20),
    exploreSlice3: allShuffled.slice(seg * 2, seg * 2 + 20),
    canonicalUrl,
    siteBase: SITE_BASE,
    videoDescription: { ...videoDesc, text: meta.ogDesc },
    structuredData: buildVideoSchemas(video, meta, canonicalUrl),
    seoMetaDesc: meta.description,
    ogDesc: meta.ogDesc,
    prevVideo: prevVideo ? { id: prevVideo.id, title: cleanVideoTitle(prevVideo), thumbnail: prevVideo.thumbnail, category: prevVideo.category } : null,
    nextVideo: nextVideo ? { id: nextVideo.id, title: cleanVideoTitle(nextVideo), thumbnail: nextVideo.thumbnail, category: nextVideo.category } : null
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
// If old ID, redirect directly to new ID (1-hop)
app.get('/v/:id', (req, res) => {
  const clean = req.params.id.replace(/\.mp4$/i, '');
  const newId = oldIdRedirects.get(clean);
  res.redirect(301, '/' + (newId || clean));
});
app.get('/video/:id', (req, res) => {
  const clean = req.params.id.replace(/\.mp4$/i, '');
  const newId = oldIdRedirects.get(clean);
  res.redirect(301, '/' + (newId || clean));
});
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
    // Generate sitemap in background — non-blocking, separate process
    exec('node tools/generate-sitemap.js', { cwd: __dirname }, (err, stdout) => {
      if (err) console.error('[SITEMAP] Generation failed:', err.message);
      else process.stdout.write(stdout);
    });
  });
})();

process.on('uncaughtException', err => {
  console.error('[FATAL] Uncaught exception:', err.message);
});
process.on('unhandledRejection', err => {
  console.error('[WARN] Unhandled rejection:', err?.message || err);
});