const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const ejs = require('ejs');
const http = require('http');
const { exec } = require('child_process');

const app = express();
app.set('trust proxy', 1);
const PORT = 7003; // Internal port (Caddy forwards to this)

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
// MICRO CACHE — in-memory thumbnail cache (capacitor effect)
// ═══════════════════════════════════════════════════════════════

const microCache = {
  store: new Map(),
  maxSize: 500,
  hits: 0, misses: 0, reads: 0,
  has(key) { return this.store.has(key); },
  get(key) { this.reads++; if (this.store.has(key)) { this.hits++; return this.store.get(key); } this.misses++; return null; },
  set(key, val) { if (this.store.size >= this.maxSize) { const k = this.store.keys().next().value; this.store.delete(k); } this.store.set(key, val); }
};

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER — protects HDD from request storms
// ═══════════════════════════════════════════════════════════════

const rlStore = new Map();
const RL_WINDOW = 60000;
const RL_MAX = 120;
const RL_STATIC_MAX = 300;
setInterval(() => { const now = Date.now(); for (const [ip, ts] of rlStore) { rlStore.set(ip, ts.filter(t => now - t < RL_WINDOW)); } }, 60000);

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

app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════
// VIDEO CACHE PROXY — buffers HDD video files onto SSD
// "Gatekeeper": first request streams from HDD + caches to SSD
// Subsequent requests served from SSD — zero HDD seek noise
// ═══════════════════════════════════════════════════════════════

const VIDEO_CACHE_DIR = path.join(os.tmpdir(), 'video-cache');
const MAX_VIDEO_CACHE_BYTES = 20 * 1024 * 1024 * 1024; // 20GB SSD cap
const pendingCacheOps = new Set();
const videoCacheMeta = new Map(); // filename -> { size, atime }

async function initVideoCache() {
  try {
    await fsp.mkdir(VIDEO_CACHE_DIR, { recursive: true });
    const files = await fsp.readdir(VIDEO_CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.mp4')) continue;
      try {
        const st = await fsp.stat(path.join(VIDEO_CACHE_DIR, file));
        videoCacheMeta.set(file, { size: st.size, atime: st.atimeMs });
      } catch { /* skip */ }
    }
    console.log(`📦 [VIDEO CACHE] ${videoCacheMeta.size} files, ${(Array.from(videoCacheMeta.values()).reduce((a, b) => a + b.size, 0) / 1e9).toFixed(1)} GB on SSD`);
  } catch {}
}
initVideoCache();

async function evictVideoCache(needed) {
  const used = Array.from(videoCacheMeta.values()).reduce((a, b) => a + b.size, 0);
  const target = MAX_VIDEO_CACHE_BYTES - needed;
  if (used <= target) return;
  const sorted = Array.from(videoCacheMeta.entries()).sort((a, b) => a[1].atime - b[1].atime);
  for (const [name] of sorted) {
    if (Array.from(videoCacheMeta.values()).reduce((a, b) => a + b.size, 0) <= target) break;
    try {
      await fsp.unlink(path.join(VIDEO_CACHE_DIR, name));
      videoCacheMeta.delete(name);
    } catch { /* race */ }
  }
}

async function cacheVideoBackground(filename, hddPath) {
  if (pendingCacheOps.has(filename)) return;
  pendingCacheOps.add(filename);
  const cachePath = path.join(VIDEO_CACHE_DIR, filename);
  const tmpPath = cachePath + '.tmp';
  try {
    const st = await fsp.stat(hddPath);
    await evictVideoCache(st.size);
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(hddPath);
      const ws = fs.createWriteStream(tmpPath);
      rs.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
      rs.on('error', reject);
    });
    await fsp.rename(tmpPath, cachePath);
    videoCacheMeta.set(filename, { size: st.size, atime: Date.now() });
  } catch {
    await fsp.unlink(tmpPath).catch(() => {});
  } finally {
    pendingCacheOps.delete(filename);
  }
}

app.use('/videos', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();
  const cachePath = path.join(VIDEO_CACHE_DIR, filename);
  const hddPath = path.join(VIDEO_DIR, filename);
  let hddStat;
  try { hddStat = await fsp.stat(hddPath); } catch { return next(); }

  // Serve from SSD cache if already cached
  if (videoCacheMeta.has(filename)) {
    try {
      await fsp.access(cachePath);
      videoCacheMeta.get(filename).atime = Date.now();
      return res.sendFile(cachePath, {
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=604800, immutable'
        }
      });
    } catch {
      videoCacheMeta.delete(filename); // stale entry
    }
  }

  // First request — stream from HDD, background cache to SSD
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : hddStat.size - 1;
    res.status(206);
    res.set({
      'Content-Range': `bytes ${start}-${end}/${hddStat.size}`,
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=604800, immutable'
    });
    fs.createReadStream(hddPath, { start, end }).pipe(res);
  } else {
    res.set({
      'Content-Length': hddStat.size,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=604800, immutable'
    });
    fs.createReadStream(hddPath).pipe(res);
  }

  cacheVideoBackground(filename, hddPath); // fire-and-forget sequential read
});
// Thumbnails — served from micro-cache first, then disk
const THUMBNAIL_PLACEHOLDER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect fill="#1a1a1e" width="320" height="240"/><rect fill="#2a2a30" x="120" y="80" width="80" height="80" rx="16"/><polygon fill="#6b6b75" points="145,95 145,145 175,120"/></svg>');
app.use('/thumbnails', express.static(THUMBNAIL_DIR, { maxAge: '7d' }));

const nlp = require('./utils/nlp');
const SEOGenerator = require('./utils/seo-generator');
const seo = new SEOGenerator({ siteName: 'Lucahman', siteUrl: SITE_BASE });
let videos = [];
let videoDescriptions = {};

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
  try {
    const start = Date.now();
    const data = await fsp.readFile(INDEX_FILE, 'utf8');
    videos = JSON.parse(data);
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

// Simple in-memory API cache — avoids repeated identical filter/sort hits
const apiCache = new Map();
const API_CACHE_TTL = 60000;
setInterval(() => { const n = Date.now(); for (const [k, v] of apiCache) if (n - v.ts > API_CACHE_TTL) apiCache.delete(k); }, 300000);

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/', async (req, res) => {
  const canonicalUrl = 'https://xmelayu.site/';
  const websiteSchema = seo.generateStructuredData('website');
  const orgSchema = seo.generateStructuredData('organization');
  res.render('gallery', {
    title: 'Lucahman - Melayu Porn | Awek Tudung Video | Malaysia 18+',
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: videos.length,
    canonicalUrl,
    structuredData: [websiteSchema, orgSchema]
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
    cache: stats.cache,
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

app.get('/api/rebuild', async (req, res) => { console.log('\n🔧 [ADMIN] Rebuild requested...\n'); await buildIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });
app.get('/api/refresh', async (req, res) => { console.log('\n🔄 [ADMIN] Refresh requested...\n'); videos = await loadIndex(); bumpVersion(); res.json({ success: true, count: videos.length, cacheVersion: CACHE_VERSION }); });

app.get('/api/vast', (req, res) => {
  const VAST_AD_URL = process.env.VAST_AD_URL || '';
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

app.get('/robots.txt', (req, res) => {
  stats.cache.hits++;
  res.type('text/plain').send(`User-agent: *
Allow: /
Allow: /en/
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
Allow: /en/
Allow: /about
Allow: /terms
Allow: /privacy
Allow: /dmca
Allow: /2257
Disallow: /api/

# Bingbot
User-agent: Bingbot
Allow: /
Allow: /en/
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
      <video:duration>120</video:duration>
      <video:tag>${v.category}</video:tag>${tags.map(t => `\n      <video:tag>${sanitizeSitemapText(t)}</video:tag>`).join('')}
    </video:video>
  </url>\n`;
  });
  
  xml += '</urlset>';
  res.type('application/xml').send(xml);
});

app.get('/terms', (req, res) => { stats.cache.hits++; res.render('terms', { title: 'Terms of Use - Lucahman', canonicalUrl: 'https://xmelayu.site/terms' }); });
app.get('/privacy', (req, res) => { stats.cache.hits++; res.render('privacy', { title: 'Privacy Policy - Lucahman', canonicalUrl: 'https://xmelayu.site/privacy' }); });
app.get('/dmca', (req, res) => { stats.cache.hits++; res.render('dmca', { title: 'DMCA Policy - Lucahman', canonicalUrl: 'https://xmelayu.site/dmca' }); });
app.get('/2257', (req, res) => { stats.cache.hits++; res.render('2257', { title: '2257 Compliance - Lucahman', canonicalUrl: 'https://xmelayu.site/2257' }); });


app.get('/player/:id', (req, res) => { res.redirect(301, `/${req.params.id}`); });

// ═══════════════════════════════════════════════════════════════
// ENGLISH / USA TIER 1 CONTENT — xAmateur section
// ═══════════════════════════════════════════════════════════════
// ON-THE-FLY THUMBNAIL GENERATION
// ═══════════════════════════════════════════════════════════════

const THUMB_LOCK = new Set();
const THUMB_TIMEOUT = 120000; // 2 min per thumbnail
const ffmpegPath = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const ffprobePath = 'C:\\ffmpeg\\bin\\ffprobe.exe';

function generateThumbnail(videoPath, outputPath) {
  const cacheKey = path.basename(outputPath);
  if (THUMB_LOCK.has(cacheKey)) return Promise.resolve(false);
  THUMB_LOCK.add(cacheKey);

  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}

  function esc(s) { return s.replace(/"/g, '\\"'); }

  return new Promise(resolve => {
    exec(`"${ffprobePath}" -v quiet -print_format json -show_streams -select_streams v:0 "${esc(videoPath)}"`, { windowsHide: true }, (err, stdout) => {
      if (err) { THUMB_LOCK.delete(cacheKey); return resolve(false); }

      let w, h, dur;
      try {
        const d = JSON.parse(stdout);
        const s = d.streams?.[0];
        if (!s) throw 0;
        w = s.width; h = s.height;
        dur = parseFloat(s.duration) || 0;
      } catch { THUMB_LOCK.delete(cacheKey); return resolve(false); }

      if (dur <= 0) { THUMB_LOCK.delete(cacheKey); return resolve(false); }

      // ────────────────────────────────────────────────────
      // Portrait video (height > width) — 3-panel collage
      // ────────────────────────────────────────────────────
      if (h > w) {
        const t1 = Math.max(0, dur * 0.25);
        const t2 = Math.max(0, dur * 0.50);
        const t3 = Math.max(0, dur * 0.75);
        const gap = dur < 3 ? 0.1 : 0.5;
        // If positions overlap (short video), spread them out
        const positions = t2 - t1 < gap
          ? [0.2, 0.5, 0.8].map(p => Math.max(0, Math.min(dur, dur * p)))
          : [t1, t2, t3];

        const sceneCmd =
          `"${ffmpegPath}" -ss ${positions[0]} -i "${esc(videoPath)}"` +
          ` -ss ${positions[1]} -i "${esc(videoPath)}"` +
          ` -ss ${positions[2]} -i "${esc(videoPath)}"` +
          ` -filter_complex "[0:v]scale=200:-1:flags=lanczos[a];[1:v]scale=200:-1:flags=lanczos[b];[2:v]scale=200:-1:flags=lanczos[c];[a][b][c]hstack=3"` +
          ` -frames:v 1 -q:v 3 "${esc(outputPath)}" -y`;

        exec(sceneCmd, { windowsHide: true, timeout: THUMB_TIMEOUT }, err => {
          if (!err && fs.existsSync(outputPath)) { THUMB_LOCK.delete(cacheKey); return resolve(true); }
          // Fallback: single frame seek
          const fbCmd = `"${ffmpegPath}" -ss ${dur * 0.3} -i "${esc(videoPath)}" -vf "scale=300:-1:flags=lanczos" -frames:v 1 -q:v 3 "${esc(outputPath)}" -y`;
          exec(fbCmd, { windowsHide: true, timeout: THUMB_TIMEOUT }, err2 => {
            THUMB_LOCK.delete(cacheKey);
            resolve(!err2 && fs.existsSync(outputPath));
          });
        });

      // ────────────────────────────────────────────────────
      // Landscape video — 1 best scene frame
      // ────────────────────────────────────────────────────
      } else {
        const sceneCmd = `"${ffmpegPath}" -i "${esc(videoPath)}" -vf "select='gt(scene,0.4)',scale=480:360:flags=lanczos" -frames:v 1 -vsync vfr -q:v 3 "${esc(outputPath)}" -y`;
        exec(sceneCmd, { windowsHide: true, timeout: THUMB_TIMEOUT }, err => {
          if (!err && fs.existsSync(outputPath)) { THUMB_LOCK.delete(cacheKey); return resolve(true); }
          // Fallback: seek to 30%
          const fbCmd = `"${ffmpegPath}" -ss ${dur * 0.3} -i "${esc(videoPath)}" -vf "scale=480:360:flags=lanczos" -frames:v 1 -q:v 3 "${esc(outputPath)}" -y`;
          exec(fbCmd, { windowsHide: true, timeout: THUMB_TIMEOUT }, err2 => {
            THUMB_LOCK.delete(cacheKey);
            resolve(!err2 && fs.existsSync(outputPath));
          });
        });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
const EN_VIDEO_DIR = 'C:\\Users\\User\\Desktop\\xamateur';
const EN_THUMB_DIR = 'C:\\Users\\User\\Desktop\\xamateur\\thumbnails';
const EN_INDEX_FILE = path.join(__dirname, 'data', 'video-index-xamateur.json');
const REAL_INDEX_FILE = path.join(__dirname, 'data', 'video-index-real.json');
const REAL_GALLERIES_FILE = path.join(__dirname, 'data', 'real-galleries.json');
let enVideos = [];
let realVideos = [];
let realGalleries = [];

async function loadEnIndex() {
  try {
    const data = await fsp.readFile(EN_INDEX_FILE, 'utf8');
    enVideos = JSON.parse(data);
    for (const v of enVideos) {
      if (v.video && !v.thumbnail) {
        const base = path.basename(v.video, '.mp4');
        v.thumbnail = '/en/thumbnails/' + encodeURIComponent(base) + '.jpg';
      }
    }
    console.log(`\n🇺🇸 [EN] Loaded ${enVideos.length} English videos\n`);
    return enVideos;
  } catch {
    enVideos = [];
    console.log('\n🇺🇸 [EN] No English index found, starting empty\n');
    return enVideos;
  }
}

async function loadRealIndex() {
  try {
    const [vd, gd] = await Promise.all([
      fsp.readFile(REAL_INDEX_FILE, 'utf8'),
      fsp.readFile(REAL_GALLERIES_FILE, 'utf8')
    ]);
    realVideos = JSON.parse(vd);
    realGalleries = JSON.parse(gd);
    for (const v of realVideos) {
      if (v.video && !v.thumbnail) {
        const base = path.basename(v.video, '.mp4');
        v.thumbnail = '/en/thumbnails/' + encodeURIComponent(base) + '.jpg';
      }
    }
    console.log(`\n📱 [REAL] Loaded ${realVideos.length} real amateur videos across ${realGalleries.length} galleries\n`);
    return { videos: realVideos, galleries: realGalleries };
  } catch {
    realVideos = [];
    realGalleries = [];
    console.log('\n📱 [REAL] No real video index found\n');
    return { videos: [], galleries: [] };
  }
}

// Recursive file search — shared by video serving + thumbnail generation
async function findFile(dir, name) {
  const full = path.join(dir, name);
  try { await fsp.access(full); return full; } catch {}
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === 'thumbnails') continue;
    if (entry.isDirectory()) {
      const found = await findFile(path.join(dir, entry.name), name);
      if (found) return found;
    }
  }
  return null;
}

// Serve English video files from disk (search recursively)
app.use('/en/videos', async (req, res, next) => {
  const filename = path.basename(decodeURIComponent(req.path));
  if (!filename.endsWith('.mp4')) return next();

  const filePath = await findFile(EN_VIDEO_DIR, filename);
  if (filePath) {
    return res.sendFile(filePath, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable'
      }
    });
  }
  // Fallback to main video dir
  const fallback = path.join(VIDEO_DIR, filename);
  try {
    await fsp.access(fallback);
    res.sendFile(fallback, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable'
      }
    });
  } catch {
    next();
  }
});

// Serve English thumbnails — on-the-fly generation with ffmpeg
app.use('/en/thumbnails', express.static(EN_THUMB_DIR, { maxAge: '7d', fallthrough: true }));
app.use('/en/thumbnails', express.static(THUMBNAIL_DIR, { maxAge: '7d' }));

async function generateThumbnailAsync(videoName, outputPath) {
  if (THUMB_LOCK.has(path.basename(outputPath))) return;
  const videoPath = await findFile(EN_VIDEO_DIR, videoName);
  if (videoPath) generateThumbnail(videoPath, outputPath);
}

// Cornerstone article — English home page
app.get('/en', async (req, res) => {
  const latest = enVideos.slice(0, 5);
  const popular = [...enVideos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

  const articleContent = `
    <p>Welcome to <strong>xAmateur</strong> — America's premier destination for 100% authentic <strong>USA homemade amateur videos</strong>. 
    If you're searching for <strong>real amateur porn</strong>, <strong>American homemade content</strong>, or <strong>genuine couples</strong> 
    sharing intimate moments, you've found the right place. Every video in our collection is <strong>genuine amateur content</strong> 
    captured in real American homes, hotels, and apartments — no studios, no scripts, just real passion.</p>

    <p>Our platform is built around the <strong>xmateur</strong> philosophy — real people, real chemistry, real amateur action. 
    Whether you call it <strong>x amateur</strong>, <strong>x-mateur</strong>, or <strong>xmateur.com</strong>, 
    the experience is the same: authentic <strong>USA amateur videos</strong> that capture genuine American desire. 
    We curate every video to ensure the highest quality <strong>real amateur experience</strong> on the web.</p>

    <h2>Browse Our American Amateur Video Collection</h2>
    <p>With <strong>${enVideos.length} videos</strong> and growing, our collection spans every category of <strong>American amateur adult content</strong>. 
    From passionate <a href="/en/${enVideos[0]?.id}"><strong>amateur couples</strong></a> in Ohio to wild 
    <a href="/en/${enVideos[10]?.id}"><strong>college hookups</strong></a> in California, 
    from <a href="/en/${enVideos[20]?.id}"><strong>MILF next door</strong></a> in Texas to 
    <a href="/en/${enVideos[30]?.id}"><strong>beach flings</strong></a> in Miami — 
    each video tells its own story of real American passion. Our <strong>USA homemade porn</strong> library is carefully organized 
    so you can find exactly what turns you on.</p>

    <h3>Latest Additions</h3>
    <ul>
      ${latest.map((v, i) => `<li><a href="/en/${v.id}"><strong>${v.title}</strong></a> — ${(v.views || 0).toLocaleString()} views — Fresh American amateur content</li>`).join('\n      ')}
    </ul>

    <h3>Most Popular This Week</h3>
    <ul>
      ${popular.map((v, i) => `<li><a href="/en/${v.id}"><strong>${v.title}</strong></a> — ${(v.views || 0).toLocaleString()} views — Top rated amateur video</li>`).join('\n      ')}
    </ul>

    <h2>Why Choose xAmateur for American Amateur Content?</h2>
    <p>There's something uniquely compelling about <strong>genuine amateur videos</strong>. The raw chemistry, 
    the authentic reactions, the real passion — it's <strong>homemade adult content</strong> that professional studios 
    simply cannot replicate. Our <strong>USA amateur site</strong> stands apart because:</p>
    <ul>
      <li><strong>100% Authentic American Content</strong> — Every video is made by real couples in real American homes</li>
      <li><strong>Real Amateur Couples</strong> — No actors, no scripts, just genuine chemistry between real partners</li>
      <li><strong>College Hookups & MILFs</strong> — From <strong>college amateur videos</strong> to <strong>MILF homemade content</strong>, we have it all</li>
      <li><strong>Phone Recorded Amateur</strong> — Check out our <a href="/en/real"><strong>real phone-recorded vertical videos</strong></a> captured by couples across America on their mobile phones</li>
      <li><strong>Weekly Updates</strong> — Fresh <strong>American amateur clips</strong> added every week from across the USA</li>
      <li><strong>HD Quality</strong> — Crystal clear <strong>HD amateur porn</strong> that puts you right in the room</li>
    </ul>

    <h2>Explore American Amateur Videos by Style</h2>
    <p>Our <strong>xmateur</strong> collection includes a wide variety of styles. Whether you prefer 
    <a href="/en/${enVideos[40]?.id}"><strong>passionate missionary</strong></a>, 
    <a href="/en/${enVideos[50]?.id}"><strong>intense doggy style</strong></a>, 
    <a href="/en/${enVideos[60]?.id}"><strong>cowgirl riding</strong></a>, 
    or <a href="/en/${enVideos[70]?.id}"><strong>69 oral action</strong></a> — 
    our <strong>USA homemade sex videos</strong> cover every position and fantasy. 
    Each video captures the raw, unfiltered energy of real American couples exploring their desires together.</p>

    <h2>Why American Homemade Amateur Porn?</h2>
    <p>American <strong>amateur adult content</strong> has a unique appeal. The confidence, the chemistry, 
    the authentic American settings — from suburban bedrooms to beachside hotels, from college dorms to 
    backyard pool parties. Our <strong>USA homemade amateur site</strong> brings you closer to the action 
    than any studio production ever could. This is <strong>real amateur porn USA</strong> at its finest.</p>

    <p>When you search for <strong>amateur porn videos</strong>, <strong>homemade sex clips</strong>, or 
    <strong>USA adult content</strong>, you want authenticity. That's exactly what <strong>xAmateur</strong> delivers — 
    genuine American couples, real homemade settings, and the kind of raw passion that only comes from 
    real people exploring their sexuality together.</p>

    <div class="highlight-box">
      <h3>Start Watching American Amateur Videos</h3>
      <p>Browse our collection below or click any video to watch in full HD. 
      New <strong>USA homemade amateur content</strong> added every week. 
      All participants are consenting adults over 18 years of age.</p>
      <p><a href="/en/${enVideos[0]?.id}" class="btn">Watch Latest Video →</a></p>
    </div>

    <h2>Popular Amateur Video Categories</h2>
    <ul>
      <li><a href="/en/${enVideos[5]?.id}"><strong>Real Amateur Couples</strong></a> — Intimate moments between real American partners</li>
      <li><a href="/en/${enVideos[15]?.id}"><strong>College Hookups</strong></a> — Authentic encounters from US college campuses</li>
      <li><a href="/en/${enVideos[25]?.id}"><strong>MILF Next Door</strong></a> — Experienced American women in homemade settings</li>
      <li><a href="/en/${enVideos[35]?.id}"><strong>Vacation Flings</strong></a> — Hotel and beach hookups across America</li>
      <li><a href="/en/${enVideos[45]?.id}"><strong>Mature Amateur</strong></a> — Real mature couples with genuine chemistry</li>
      <li><a href="/en/${enVideos[55]?.id}"><strong>Young Amateur</strong></a> — Fresh young American couples exploring together</li>
      <li><a href="/en/${enVideos[65]?.id}"><strong>BBW Amateur</strong></a> — Curvy American women in homemade action</li>
      <li><a href="/en/${enVideos[75]?.id}"><strong>Interracial Amateur</strong></a> — Real interracial couples in the USA</li>
    </ul>

    <p>Bookmark <strong>xAmateur</strong> for daily updates and the best <strong>American amateur videos</strong> on the web. 
    Whether you search for <strong>xmateur</strong>, <strong>x amateur porn</strong>, <strong>x-mateur videos</strong>, or 
    <strong>USA homemade amateur content</strong> — you'll find it all right here. 
    <strong>Real people. Real passion. Real amateur. xAmateur.</strong></p>
  `;

  res.render('cornerstone', {
    title: 'xAmateur - Best American Amateur Videos | USA Homemade Content',
    metaDescription: `Watch ${enVideos.length} authentic American amateur videos. Real couples, college hookups, MILF next door, and genuine USA homemade content. The best xmateur collection online. Updated weekly.`,
    heading: `xAmateur — ${enVideos.length} American Amateur Videos`,
    content: articleContent,
    videos: enVideos
  });
});

// English about page
app.get('/en/about', (req, res) => {
  res.render('about', {
    title: 'About xAmateur — American Amateur Video Collection',
    metaDescription: 'Learn about xAmateur, our curated collection of authentic American amateur videos. Real couples, homemade content, and genuine USA amateur entertainment.',
    canonicalUrl: 'https://xmelayu.site/en/about',
  });
});

// Real amateur subsection — phone portrait videos
app.get('/en/real', async (req, res) => {
  if (!realVideos.length) return res.status(404).render('error', { message: 'Real section not available' });

  const totalVideos = realVideos.length;
  const latest = [...realVideos].reverse().slice(0, 20);

  // Collect 3 preview thumbnails per gallery
  const galleriesWithPreviews = realGalleries.map(g => {
    const gvideos = realVideos.filter(v => v.gallery === g.slug).slice(0, 3);
    return {
      ...g,
      previews: gvideos.map(v => v.thumbnail).filter(Boolean)
    };
  });

  const articleContent = `
    <p>Welcome to <strong>xAmateur Real</strong> — the authentic side of American amateur content. 
    This is where real people capture real moments on their phones, in their own spaces, 
    without scripts, directors, or production teams. Every video here was recorded on a mobile phone 
    in vertical 9:16 format — the way modern couples actually document their intimate lives.</p>

    <p>Browse our collections below, organized by theme and style. Each gallery brings together 
    <strong>genuine phone-recorded amateur videos</strong> from real American couples who chose to share 
    their private moments. From <strong>homemade bedroom recordings</strong> to <strong>intimate couple sessions</strong>, 
    from <strong>exclusive private footage</strong> to <strong>real hookup encounters</strong> — this is amateur 
    content in its purest form.</p>

    <h2>What Makes Phone Amateur Content Different?</h2>
    <p>Phone-recorded amateur videos have a unique energy. The intimacy is real, the reactions are genuine, 
    and the quality is raw and unfiltered. Unlike studio productions, these <strong>homemade phone videos</strong> 
    capture authentic desire between real people in real American homes, hotels, and apartments.</p>

    <div class="highlight-box">
      <h3>Start Exploring Phone Amateur Videos</h3>
      <p>Browse our ${totalVideos} authentic phone-recorded videos across ${realGalleries.length} curated galleries. 
      Real people, real phones, real amateur passion.</p>
      <p><a href="/en/real/${realGalleries[0]?.slug}" class="btn">Browse Latest Collection →</a></p>
    </div>

    <p>Every video in this section was shot on a phone in portrait orientation — the natural way people 
    capture intimate content. Our <strong>real amateur phone collection</strong> represents a growing movement 
    toward authentic, unproduced adult content that puts genuine human connection first.</p>
  `;

  const heading = `xAmateur Real — ${totalVideos} Phone Amateur Videos`;

  res.render('cornerstone-real', {
    title: 'xAmateur Real - Authentic Phone Amateur Videos | USA Homemade',
    metaDescription: `Watch ${totalVideos} authentic phone-recorded amateur videos from real American couples. ${realGalleries.length} curated galleries of genuine homemade phone content.`,
    heading,
    content: articleContent,
    totalVideos,
    galleries: galleriesWithPreviews,
    latest,
    isGallery: false
  });
});

// Real gallery detail page
app.get('/en/real/:slug', async (req, res) => {
  const gallery = realGalleries.find(g => g.slug === req.params.slug);
  if (!gallery) return res.status(404).render('error', { message: 'Gallery not found' });

  const videos = realVideos.filter(v => v.gallery === gallery.slug);

  res.render('cornerstone-real', {
    title: `${gallery.title} - xAmateur Real Phone Videos`,
    metaDescription: `Watch ${videos.length} genuine ${gallery.targetKeywords} phone-recorded amateur videos. Real American couples, authentic homemade content.`,
    heading: gallery.title,
    content: '<p>' + gallery.description + '</p>',
    totalVideos: videos.length,
    gallery,
    videos,
    isGallery: true
  });
});

// Real individual video player
app.get('/en/real/v/:id', async (req, res) => {
  const video = realVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });

  const related = realVideos
    .filter(v => v.id !== video.id && v.gallery === video.gallery)
    .slice(0, 12);

  res.render('player-en', { title: video.title + ' - xAmateur Real', video, related });
});

// English video page
app.get('/en/:id', async (req, res) => {
  const video = enVideos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).render('error', { message: 'Video not found' });

  const related = enVideos
    .filter(v => v.id !== video.id)
    .map(v => {
      let score = 0;
      if (v.category === video.category) score += 3;
      const kwOverlap = video.keywords?.filter(k => v.keywords?.includes(k)).length || 0;
      score += kwOverlap * 2;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(x => x.v);

  res.render('player-en', { title: video.title + ' - xAmateur USA', video, related });
});

loadEnIndex();
loadRealIndex();

// About page
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'What is xMelayu? — Southeast Asian Amateur Video Platform',
    metaDescription: 'Discover xMelayu, the Southeast Asian video platform celebrating Malay, Malaysian, Indonesian, Thai, and regional amateur content. Learn the LucahMan story, our amateur niche, and why xmateur is the new wave.',
    canonicalUrl: 'https://xmelayu.site/about',
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
  res.render('player', { title: video.title, video, related, canonicalUrl, siteBase: SITE_BASE, videoDescription: videoDesc, structuredData: [videoSchema] });
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

const server = http.createServer({ agent: httpAgent }, app);
server.listen(PORT, () => {
  loadIndex().then(() => {
    loadDescriptions();
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🎬 LUCAHMAN STREAMING SERVER                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  🔧 Internal:   http://localhost:${PORT}                         ║
║  🌐 Public:      http://localhost (via Caddy proxy)              ║
║  🔒 HTTPS:       https://localhost (via Caddy, green padlock)    ║
║                                                                  ║
║  📁 Videos:     ${String(videos.length).padEnd(44)}║
║  💾 Status:     Ready                                           ║
║                                                                  ║
║  📊 API Endpoints:                                              ║
║  ├── GET /api/stats   - Full statistics                         ║
║  ├── GET /api/health  - Health check                             ║
║  ├── GET /api/rebuild - Rebuild index                            ║
║  └── GET /api/refresh - Refresh from disk                       ║
║                                                                  ║
║  📝 Legend:                                                     ║
║  ├── 👤 Human    🤖 Bot     ⚡ API     📄 Static              ║
║  └── ✅ Success  ⚠️ Warning  💥 Error                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  });
});
