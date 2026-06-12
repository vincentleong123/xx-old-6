const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const ejs = require('ejs');

const app = express();
const PORT = 7004; // Internal port (Caddy forwards to this)
const IS_PROD = process.env.NODE_ENV === 'production';

const CDN_BASE = 'https://xmelayu.online';
const SITE_BASE = 'https://xmelayu.site';
const VIDEO_DIR = 'E:/videos';
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
  res.header('Referrer-Policy', 'no-referrer-when-downgrade');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.header('X-DNS-Prefetch-Control', 'on');
  res.header('X-Cache-Version', String(CACHE_VERSION));
  if (req.path.startsWith('/api/')) {
    res.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  } else if (!req.path.match(/\.\w+$/)) {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
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
// Browsers auto-request /favicon.ico — serve SVG as substitute
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'), { headers: { 'Content-Type': 'image/x-icon' } });
});
app.use(express.static(path.join(__dirname, 'public')));

const nlp = require('./utils/nlp');
let videos = [];
let videoDescriptions = {};

async function loadDescriptions() {
  try {
    const data = await fs.readFile(DESCRIPTIONS_FILE, 'utf8');
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
  console.log(`\n🔁 [VERSION] Bumped to v${CACHE_VERSION}\n`);
}

// ═══════════════════════════════════════════════════════════════
// VIDEO INDEX
// ═══════════════════════════════════════════════════════════════

async function loadIndex() {
  try {
    const start = Date.now();
    const data = await fs.readFile(INDEX_FILE, 'utf8');
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
    await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    const files = await fs.readdir(VIDEO_DIR);
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
    await fs.writeFile(INDEX_FILE, JSON.stringify(videos, null, 2));
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
// ROUTES
// ═══════════════════════════════════════════════════════════════

app.get('/', async (req, res) => {
  res.render('gallery', {
    title: 'Lucahman - Melayu Porn | Awek Tudung Video | Malaysia 18+',
    categories: getCategories(),
    topTags: getTags(),
    totalVideos: videos.length
  });
});

app.get('/api/search', async (req, res) => {
  const start = Date.now();
  const { q = '', category = '', tag = '', sort = 'newest', page = 1, limit = 24 } = req.query;
  let results = [...videos];
  if (q) {
    const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    results = results.filter(v => {
      const text = (v.name + ' ' + v.keywords.join(' ')).toLowerCase();
      return terms.some(t => text.includes(t));
    });
  }
  if (category) results = results.filter(v => v.category.toLowerCase() === category.toLowerCase());
  if (tag) results = results.filter(v => v.subTags.some(t => t.toLowerCase().includes(tag.toLowerCase())) || v.keywords.some(k => k.toLowerCase().includes(tag.toLowerCase())));
  if (sort === 'views') results.sort((a, b) => b.views - a.views);
  else if (sort === 'likes') results.sort((a, b) => b.likes - a.likes);
  else results.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 72, 300);
  const start_idx = (pageNum - 1) * limitNum;
  stats.cache.hits++;
  res.json({ videos: results.slice(start_idx, start_idx + limitNum), total: results.length, page: pageNum, totalPages: Math.ceil(results.length / limitNum), hasMore: start_idx + limitNum < results.length, queryTime: Date.now() - start });
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
      <video:thumbnail_loc>${v.thumbnail}</video:thumbnail_loc>
      <video:content_loc>${v.video}</video:content_loc>
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

app.get('/terms', (req, res) => { stats.cache.hits++; res.render('terms', { title: 'Terms of Use - Lucahman' }); });
app.get('/privacy', (req, res) => { stats.cache.hits++; res.render('privacy', { title: 'Privacy Policy - Lucahman' }); });
app.get('/dmca', (req, res) => { stats.cache.hits++; res.render('dmca', { title: 'DMCA Policy - Lucahman' }); });
app.get('/2257', (req, res) => { stats.cache.hits++; res.render('2257', { title: '2257 Compliance - Lucahman' }); });


app.get('/player/:id', async (req, res) => { res.render('player', { title: `Video - Lucahman`, video: {}, related: [], videoDescription: null }); });

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
  const videoDesc = videoDescriptions[video.id] || null;
  res.render('player', { title: video.title, video, related, videoDescription: videoDesc });
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

app.listen(PORT, () => {
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
