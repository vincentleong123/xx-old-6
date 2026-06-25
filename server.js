const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const ejs = require('ejs');
const http = require('http');

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
const AD_CONFIG_FILE = path.join(__dirname, 'data', 'ad-config.json');
const HERO_CONFIG_FILE = path.join(__dirname, 'data', 'hero-config.json');
const CORNERSTONE_FILE = path.join(__dirname, 'data', 'cornerstone-pages.json');
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const XAMATEUR_DIR = 'C:/Users/User/Desktop/xamateur';
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

app.use('/videos', async (req, res, next) => {
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
// xAmateur videos — served from C:\Users\User\Desktop\xamateur
app.use('/xamateur/videos', async (req, res, next) => {
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
const seo = new SEOGenerator({ siteName: 'Lucahman', siteUrl: SITE_BASE });
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
    if (!db.getCollection('adConfig')) db.addCollection('adConfig');
    if (!db.getCollection('heroConfig')) db.addCollection('heroConfig');
    if (!db.getCollection('cornerstonePages')) db.addCollection('cornerstonePages', { indices: ['route'] });
    if (!db.getCollection('likes')) db.addCollection('likes', { indices: ['videoId'] });
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
app.locals.cleanAlt = (v) => (v && (v.id || v.title || '')).replace(/-[0-9A-F]{4,}$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

function cleanVideoTitle(video) {
  let t = (video.id || video.title || '');
  t = t.replace(/-[0-9A-F]{4,}$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function bumpVersion() {
  CACHE_VERSION = Date.now();
  app.locals.cacheVersion = CACHE_VERSION;
  app.locals.siteBase = SITE_BASE;
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

async function buildIndex() {
  try {
    const start = Date.now();
    await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    const files = await fsp.readdir(VIDEO_DIR);
    const newVideos = [];
    
    for (const file of files) {
      if (!/\.(mp4|webm|ogg|mov)$/i.test(file)) continue;
      const baseName = path.basename(file, path.extname(file));
      const cat = nlp.categorizeVideo(baseName);
      const kw = nlp.extractKeywords(baseName);
      newVideos.push({
        id: baseName,
        name: baseName.replace(/[-_]+/g, ' '),
        title: baseName.replace(/[-_]+/g, ' '),
        video: `${CDN_BASE}/videos/${encodeURIComponent(baseName)}.mp4`,
        thumbnail: `${CDN_BASE}/thumbnails/${encodeURIComponent(baseName)}.jpg`,
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
// CMS — Ad Configuration
// ═══════════════════════════════════════════════════════════════

let adConfig = { banners: [], refreshInterval: 300 };

async function loadAdConfig() {
  try { adConfig = JSON.parse(await fsp.readFile(AD_CONFIG_FILE, 'utf8')); }
  catch { adConfig = { banners: [], refreshInterval: 300 }; }
}

async function saveAdConfig() {
  await fsp.writeFile(AD_CONFIG_FILE, JSON.stringify(adConfig, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// CMS — Super X Hero Config
// ═══════════════════════════════════════════════════════════════

let heroConfig = {};

function getDefaultHeroConfig() {
  return { badge:'Super X Melayu', h1:'Super X Melayu Malay Pron — Seks Awek Tudung Lucah', h1Sub:'Malaysian Chinese xx amateur xxx-matuer xamatuer melayu x www video rakam bilik terkini', subtitle:'Curated Asian Amateur Porn — xMateur xAmateur xx Amateur Asian Collection', nicheTags:[{label:'Amateur',cls:'p'},{label:'Asian',cls:'b'},{label:'xMateur',cls:'l'},{label:'xAmateur',cls:'s'}], ctaButtons:[{href:'/',label:'🇲🇾 FULL GALLERY',cls:'super-x-btn'},{href:'/?sort=views',label:'🔥 TRENDING NOW',cls:'super-x-btn super-x-btn-alt'},{href:'#feed-start',label:'🎬 BROWSE VIDEOS',cls:'super-x-btn super-x-btn-alt',style:'background:linear-gradient(135deg,#8e2de2,#4a00e0);box-shadow:0 4px 25px rgba(142,45,226,0.4)',onclick:"document.getElementById('videoFeed').querySelector('.section')?.scrollIntoView({behavior:'smooth'});return false"}], keywordTags:[{q:'xmateur',label:'#xMateur'},{q:'xamateur',label:'#xAmateur'},{q:'x+amateur',label:'#X Amateur'},{q:'amateur+porn',label:'#AmateurPorn'},{q:'asian+amateur+porn',label:'#AsianAmateurPorn'},{q:'xx+amateur+asian',label:'#xxAmateurAsian'},{q:'amateur+asian',label:'#AmateurAsian'},{q:'amateur+porn+site',label:'#AmateurPornSite'},{q:'real+amateur+porn',label:'#RealAmateurPorn'},{q:'asian+homemade',label:'#AsianHomemade'},{q:'super+x+melayu+malay+pron',label:'#SuperXMelayuMalayPron'},{q:'melayu+x+www',label:'#MelayuXwww'},{q:'seks+awek',label:'#SeksAwek'},{q:'video+rakam+bilik',label:'#VideoRakamBilik'},{q:'tudung+terkini',label:'#TudungTerkini'},{q:'lucah+malay',label:'#LucahMalay'},{q:'malaysian+chinese+xx',label:'#MalaysianChineseXX'},{q:'xxx-matuer',label:'#XXXMatuer'},{q:'xamatuer',label:'#Xamatuer'},{q:'xmatuer',label:'#xMatuer'},{q:'xxamatuer',label:'#xxAmatuer'},{q:'xxmateur',label:'#xxMateur'},{q:'x-mateur',label:'#x-Mateur'},{q:'x-matuer',label:'#x-Matuer'},{q:'malay+pron',label:'#MalayPron'},{q:'melayu+pron',label:'#MelayuPron'},{q:'bokep+malay',label:'#BokepMalay'},{q:'xxx+malay',label:'#XXXMalay'}], seoLinks:[{href:'/',label:'Lucahman',title:'Lucahman - Melayu Porn | Awek Tudung Video | Malaysia 18+'},{href:'/super-x-melayu',label:'Super X Melayu',title:'Super X Melayu Malay Pron — Seks Awek Tudung Lucah | xMelayu'},{href:'/mega-x',label:'Mega X',title:'mega x melayu (amateur malay porn) - Lucahman'},{href:'/xmateur',label:'xMateur',title:'xMateur Porn & Asian Amateur Videos'},{href:'/tudung-porn',label:'Tudung Porn',title:'Awek Tudung Porn | Hijab Malay Amateur Videos'},{href:'/xamateur',label:'xAmateur',title:'xAmateur Premium Amateur Collection'}], cats:{tudung:'🧕 Awek Tudung',montok:'💦 Montok Hot',indonesian:'🇮🇩 Indonesian',thai:'🇹🇭 Thai Sexy',milf:'🔥 MILF',chubby:'🍑 Chubby',viral:'📈 Viral',janda:'💋 Janda',kolej:'🎓 Kolej'}, sectionTitles:{s1:'✨ Discover',s2:'🔥 Hot Now',s3:'🧕 Awek Tudung',s4:'💦 Montok'} };
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

  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const updatedLabel = 'Today';

  const filterCategory = req.query.cat || '';
  let filterTitle = seoInject('Lucahman - Melayu Porn | Awek Tudung Video | Malaysia 18+');
  let filterH1 = null;
  let filterDesc = 'Malay seks awek tudung lucah malaysian chinese xx amateur video rakam bilik terkini xxx-matuer xamatuer Melayu x www. Free Malay porn, Melayu lucah, awek tudung bokep malay video.';
  let filterKw = 'seks melayu, awek tudung, lucah, malay porn, malaysian chinese, xx amateur, xxx-matuer, xamatuer, video rakam, bilik, melayu x www, super x melayu malay pron, terkini';
  if (filterCategory) {
    filterTitle = `Lucahman - ${filterCategory} Malay Porn Videos | Awek Tudung Malaysia 18+`;
    filterH1 = `Lucahman Melayu Porn — ${filterCategory} Malay Videos 18+`;
    filterDesc = `Malay ${filterCategory} video lucah melayu malaysian chinese xx amateur. Free ${filterCategory} Malay porn, awek tudung bokep malay video.`;
  }

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
    heroConfig
  });
});

app.get('/mega-x', cachePage, async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/mega-x';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  res.render('gallery', {
    title: 'mega x melayu (amateur malay porn) - Lucahman',
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    simplifiedSidebar: true
  });
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
  const canonicalUrl = 'https://xmelayu.site/super-x-melayu';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const tags = getTags();
  const extraTag = SEO_KW.sort(() => Math.random() - 0.5).slice(0, 4);
  const extraTags = extraTag.map(t => ({ tag: t, count: Math.floor(Math.random() * 500) + 50 }));
  res.render('gallery', {
    title: seoInject('Super X Melayu Malay Pron — Seks Awek Tudung Lucah'),
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
}

app.get('/super-x-melayu', cachePage, (req, res) => renderSuperX(req, res, ''));
app.get('/mega-x-melayu', cachePage, (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/mega-x-melayu';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  res.render('gallery', {
    title: 'Mega X Melayu — Bigger. Bolder. Crunchier. Malay Porn | Awek Tudung',
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
  const canonicalUrl = `https://xmelayu.site${route}`;
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
  const canonicalUrl = 'https://xmelayu.site/xamateur';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const articles = xmateurVideos.slice(0, 5);
  const popular = [...xmateurVideos].sort((a, b) => b.views - a.views).slice(0, 5);
  const content = `<h1>xAmateur — USA Amateur Porn Collection</h1>
<p>Welcome to <strong>xAmateur</strong> — premium American amateur video collection with ${xmateurVideos.length} authentic videos and growing daily.</p>
<h2>Latest Videos</h2>
<ul>${articles.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a></li>`).join('')}</ul>
<h2>Most Popular</h2>
<ul>${popular.map(v => `<li><a href="/xamateur/${v.id}"><strong>${v.title}</strong></a> — ${(v.views || 0).toLocaleString()} views</li>`).join('')}</ul>
<h2>What is xAmateur?</h2>
<p>xAmateur is the USA Tier 1 amateur collection on xMelayu, featuring real homemade American amateur content. Every video is authentic, unfiltered, and exclusive to xAmateur.</p>
<h2>Why USA Tier 1 Content?</h2>
<p>Our <strong>USA Tier 1 amateur videos</strong> are curated for English-speaking audiences with higher engagement and premium quality. These videos target search intent from US, UK, Canada, and Australia viewers.</p>`;
  res.render('cornerstone', {
    title: 'xAmateur — USA Amateur Videos | Tier 1 Amateur Porn Collection',
    metaDescription: `Watch ${xmateurVideos.length} American amateur porn videos. xAmateur premium USA amateur collection featuring authentic homemade content. Free access, HD streaming.`,
    heading: `xAmateur — ${xmateurVideos.length} USA Amateur Videos`,
    content,
    videos: xmateurVideos,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema],
    isXmateur: true
  });
});
app.get('/xamateur/real', cachePage, (req, res) => renderCornerstonePage(req, res, '/xamateur/real'));
app.get('/tudung-porn', cachePage, (req, res) => renderCornerstonePage(req, res, '/tudung-porn'));

app.get('/xmateur', cachePage, (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/xmateur';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  const config = cornerstonePages['/xmateur'];
  const filtered = config ? filterVideosByConfig(config.videoFilter) : videos;
  res.render('gallery', {
    title: 'xMateur — Amateur Malay Porn | xMateur Malay Pron',
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
// Ad zones to inject into video descriptions (zones NOT already on gallery page — no ID conflicts)
const DESC_AD_ZONES = [
  { zone: 1118845, w: 300, h: 100 },
  { zone: 1118841, w: 300, h: 100 },
  { zone: 1120028, w: 108, h: 140 },
  { zone: 1120029, w: 133, h: 139 }   // 125×125 image+title
];
const DESC_NATIVE_ZONE = 1119406;

// Pre-build the ad HTML snippet for video descriptions
function buildDescAdHtml() {
  let html = '';
  DESC_AD_ZONES.forEach(az => {
    html += `<div class="ad-slot-placeholder" style="width:100%;max-width:${az.w}px;margin:8px auto">\n`;
    html += `  <ins id="${az.zone}" data-width="${az.w}" data-height="${az.h}"></ins>\n`;
    html += `</div>\n`;
  });
  // Native ad
  html += `<div data-id="juicyads-native-ads" data-ad-zone="${DESC_NATIVE_ZONE}" data-targets="a"></div>\n`;
  return html;
}
const DESC_AD_HTML = buildDescAdHtml();

app.get('/api/video-descriptions/:id', (req, res) => {
  const desc = videoDescriptions[req.params.id];
  if (desc) return res.json({ text: desc.text || '', keywords: desc.keywords || [], adZones: DESC_AD_ZONES, nativeZone: DESC_NATIVE_ZONE, adHtml: DESC_AD_HTML });
  res.json({ text: '', keywords: [], adZones: DESC_AD_ZONES, nativeZone: DESC_NATIVE_ZONE, adHtml: DESC_AD_HTML });
});
app.get('/api/refresh', async (req, res) => { console.log('\n🔄 [ADMIN] Refresh requested...\n'); videos = await loadIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });
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
  
  ['super-x-melayu', 'mega-x-melayu', 'mega-x', 'xmateur', 'xamateur', 'tudung-porn'].forEach(page => {
    xml += `  <url><loc>https://xmelayu.site/${page}</loc><priority>0.9</priority><changefreq>daily</changefreq></url>\n`;
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
      <video:duration>120</video:duration>
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

// ═══════════════════════════════════════════════════════════════
// NLP KEYWORD LANDING PAGES — auto-generated SEO content in English
// Targets Tier 1 search traffic with NLP-powered content generation
// ═══════════════════════════════════════════════════════════════

const SEO_CONTENT_TEMPLATES = {
  'amateur': { title: 'Amateur', h1: 'Amateur Porn Videos — Real Homemade Asian Amateur Content', emoji: '📹' },
  'homemade': { title: 'Homemade', h1: 'Homemade Asian Porn — Real Amateur Home Videos', emoji: '🏠' },
  'tudung': { title: 'Tudung', h1: 'Tudung Porn Videos — Awek Tudung Malay Hijab Amateur', emoji: '🧕' },
  'hijab': { title: 'Hijab', h1: 'Hijab Amateur Porn — Malay Muslimah Hijab Videos', emoji: '🧕' },
  'malay': { title: 'Malay', h1: 'Malay Porn Videos — Malaysian Amateur Sex Content', emoji: '🇲🇾' },
  'melayu': { title: 'Melayu', h1: 'Melayu Porn — Malay Pron Videos & Amateur Sex Clips', emoji: '🇲🇾' },
  'indonesian': { title: 'Indonesian', h1: 'Indonesian Amateur Porn — Real Indo Homemade Videos', emoji: '🇮🇩' },
  'indo': { title: 'Indo', h1: 'Indo Porn Videos — Indonesian Amateur Sex Content', emoji: '🇮🇩' },
  'thai': { title: 'Thai', h1: 'Thai Amateur Porn — Real Thai Homemade Sex Videos', emoji: '🇹🇭' },
  'japanese': { title: 'Japanese', h1: 'Japanese Amateur Porn — Real Jap Homemade Videos', emoji: '🇯🇵' },
  'korean': { title: 'Korean', h1: 'Korean Amateur Porn — Real South Korean Sex Videos', emoji: '🇰🇷' },
  'chinese': { title: 'Chinese', h1: 'Chinese Amateur Porn — Real Chinese Homemade Videos', emoji: '🇨🇳' },
  'vietnamese': { title: 'Vietnamese', h1: 'Vietnamese Amateur Porn — Real Viet Homemade Sex', emoji: '🇻🇳' },
  'filipino': { title: 'Filipino', h1: 'Filipino Amateur Porn — Pinay Homemade Sex Videos', emoji: '🇵🇭' },
  'milf': { title: 'MILF', h1: 'MILF Porn Videos — Mature Asian Amateur Sex Content', emoji: '🔥' },
  'teen': { title: 'Teen', h1: 'Teen Amateur Porn — Young Asian Amateur Sex Videos', emoji: '🌸' },
  'couple': { title: 'Couple', h1: 'Couple Amateur Porn — Real Couple Homemade Sex Videos', emoji: '💑' },
  'bini': { title: 'Bini', h1: 'Bini Geram Porn — Malay Wife Amateur Sex Videos', emoji: '💢' },
  'janda': { title: 'Janda', h1: 'Janda Porn — Malay Divorcee Amateur Sex Videos', emoji: '💋' },
  'viral': { title: 'Viral', h1: 'Viral Malay Porn — Trending Amateur Sex Videos Malaysia', emoji: '📈' },
  'skandal': { title: 'Skandal', h1: 'Skandal Porn — Malay Scandal Amateur Sex Videos', emoji: '🔴' },
  'bocor': { title: 'Bocor', h1: 'Bocor Porn — Leaked Malay Amateur Sex Videos', emoji: '💧' },
  'chubby': { title: 'Chubby', h1: 'Chubby Amateur Porn — BBW Malay Sex Videos', emoji: '🍑' },
  'montok': { title: 'Montok', h1: 'Montok Porn — Thick Curvy Malay Amateur Sex Videos', emoji: '🔥' },
  'kolej': { title: 'Kolej', h1: 'Kolej Porn — Malaysian College Amateur Sex Videos', emoji: '🎓' },
  'pov': { title: 'POV', h1: 'POV Amateur Porn — Point of View Sex Videos Asian', emoji: '👁️' },
  'public': { title: 'Public', h1: 'Public Amateur Porn — Outdoor Asian Sex Videos', emoji: '🌳' },
  'private': { title: 'Private', h1: 'Private Amateur Porn — Exclusive Personal Sex Videos', emoji: '🤫' }
};

function generateKeywordContent(keyword, matchedVideos) {
  const tpl = SEO_CONTENT_TEMPLATES[keyword];
  const count = matchedVideos.length;
  const totalViews = matchedVideos.reduce((s, v) => s + (v.views || 0), 0);
  const categories = [...new Set(matchedVideos.map(v => v.category).filter(Boolean))];

  // Pick a random high-view video for example
  const topVideo = matchedVideos.length > 0 ? matchedVideos.sort((a, b) => b.views - a.views)[0] : null;

  const titleWord = tpl ? tpl.title : keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const h1 = tpl ? tpl.h1 : `${titleWord} Porn Videos — ${titleWord} Amateur Sex Content`;
  const emoji = tpl ? tpl.emoji : '🔞';

  const content = `<h2>${emoji} ${h1}</h2>
<p><strong>xMelayu</strong> presents our curated collection of <strong>${count} ${keyword} porn videos</strong> — real amateur content from Malaysia, Indonesia, Thailand, and across Southeast Asia. Every video is authentic homemade content featuring real couples and amateur performers.</p>
<p>Whether you are searching for <strong>${keyword} amateur porn</strong>, <strong>${keyword} sex videos</strong>, or the best <strong>${keyword} adult content</strong>, this collection delivers raw, unfiltered passion from real people. Our ${keyword} category is updated daily with fresh uploads.</p>${categories.length > 0 ? `
<h3>Top ${keyword} Categories</h3>
<p>Our ${keyword} collection spans multiple categories: ${categories.slice(0, 5).join(', ')}. Each video is hand-picked for authenticity and quality.</p>` : ''}
<h3>Why Watch ${titleWord} Porn on xMelayu?</h3>
<p><strong>Authentic Content:</strong> Every video is real amateur content, not studio-produced.<br>
<strong>HD Quality:</strong> All videos stream in HD quality with fast loading.<br>
<strong>Updated Daily:</strong> New ${keyword} videos added every day.<br>
<strong>FREE Access:</strong> No subscription needed — all content is free to watch.</p>
<p>Browse our complete <a href="/" style="color:#ff2d55">${keyword} porn collection</a> and discover why thousands of viewers choose xMelayu for their daily dose of authentic Asian amateur content.</p>`;

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

  const canonicalUrl = `https://xmelayu.site/k/${encodeURIComponent(keyword)}`;
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
  res.render('player-en', {
    displayTitle: cleanVideoTitle(video) + ' - xAmateur',
    title: video.title + ' - xAmateur',
    video,
    related,
    isXmateur: true
  });
});

app.get('/:id', async (req, res) => {
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });

  const related = videos
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
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(x => x.v);
  const canonicalUrl = `https://xmelayu.site/${req.params.id}`;
  const videoDesc = videoDescriptions[video.id] || null;
  const displayTitle = cleanVideoTitle(video);
  const videoSchema = seo.generateStructuredData('video', {
    title: displayTitle,
    description: videoDesc?.text || `${displayTitle} - Homemade adult video`,
    thumbnailUrl: SITE_BASE + video.thumbnail,
    contentUrl: SITE_BASE + video.video,
    embedUrl: SITE_BASE + video.video,
    uploadDate: video.uploaded,
    views: video.views,
    filename: video.id
  });
  res.render('player', {
    displayTitle,
    title: video.title,
    video,
    related,
    canonicalUrl,
    siteBase: SITE_BASE,
    videoDescription: videoDesc,
    structuredData: [videoSchema]
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

// Admin API — Ads
app.get('/api/admin/ads', (req, res) => { res.json(adConfig); });
app.post('/api/admin/ads', async (req, res) => {
  adConfig = { ...adConfig, ...req.body };
  await saveAdConfig();
  res.json({ success: true });
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

// Redirect /v/:id to /:id (handles bot probes and legacy links)
app.get('/v/:id', (req, res) => res.redirect(301, '/' + req.params.id));
app.get('/video/:id', (req, res) => res.redirect(301, '/' + req.params.id));
// Redirect old /xamateur/real/v/:id links to canonical /xamateur/:id
app.get('/xamateur/real/v/:id', (req, res) => res.redirect(301, '/xamateur/' + req.params.id));

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

(async () => {
  await loadIndex();
  await loadPages();
  await loadAdConfig();
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
    const L = s => `║  ${s.padEnd(62)}║`;
    const D = `║${' '.repeat(64)}║`;
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              LUCAHMAN STREAMING SERVER                        ║
╠══════════════════════════════════════════════════════════════════╣
${L(`PID ${process.pid}  │  Port ${PORT}  │  ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`)}
${L(`${process.version}  │  ${os.platform()}  │  ${os.cpus().length} vCPU  │  ${memUsed}/${memTotal} GB RAM`)}
${D}
${L(`${videos.length.toLocaleString()} videos  │  ${totalViews.toLocaleString()} total views`)}
${L(`${topCats}${extraCats}`)}
${D}
${L(`Capacitor : 20 GB SSD hot-cache  │  always cycling (LRU eviction)`)}
${L(`microCache: 5,000 items in RAM   │  burstCache: 5s TTL`)}
${L(`Rate limit : ${RL_MAX} req/min (${RL_STATIC_MAX} static)  │  keepAlive: 1s`)}
${D}
${L(`Routes:`)}
${L(`/           Lucahman gallery (malay content)`)}
${L(`/:id        Video player`)}
${L(`/api/*      Stats, health, search, refresh`)}
${L(`/sitemap    XML sitemap`)}
${D}
${L(`Legend: 2xx=ok  4xx=ratelimit  5xx=error`)}
${D}
╚══════════════════════════════════════════════════════════════════╝
`);
  });
})();
