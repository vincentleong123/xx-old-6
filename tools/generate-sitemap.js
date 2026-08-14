#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SITE_BASE = process.env.SITE_BASE || 'https://xmelayu.site';
const INDEX_FILE = path.join(__dirname, '..', 'data', 'video-index.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public');
const VNS = 'http://www.google.com/schemas/sitemap-video/1.1';

const EXPLICIT_WORDS = new Set([
  'lucah','bogel','pancut','memek','kontol','ngentot','sundal','pantat','kimak',
  'telanjang','bugil','coli','stagen','crot','skandal','henjut','batang','kulum','pepek',
  'isap','bontot','jilat','doggy',
  'mesum','cabul','bejat','entot','ngewe','ngocok','masturbasi',
  'fuck','fucks','fucking','fucked','cum','cums','cumming','cumshot',
  'slut','sluts','blowjob','blowjobs','handjob','handjobs',
  'creampie','creampies','gangbang','gangbangs','doublepenetration',
  'buttfuck','anal','rimjob','titfuck','footjob','deepthroat','cowgirl',
  'threesome','foursome','squirting',
  'non-con','noncon','revenge','blackmail','objectification','degradation',
  'sex','seks','sexual','seduction','seducing','masturbation','bdsm',
  'hentai','nsfw','xnxx','xvideo','xvideos'
]);

function cleanWord(w) {
  return EXPLICIT_WORDS.has(w.toLowerCase());
}

function buildCleanTitle(id) {
  const words = id
    .replace(/\s*[-–|]\s*xMelayu\s*$/i, '')
    .replace(/\.mp4$/i, '')
    .replace(/-[0-9A-F]{4,}$/i, '')
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !cleanWord(w));

  if (!words.length) return 'Malay Video';
  return words.slice(0, 6).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function buildCleanDescription(id, category) {
  const title = buildCleanTitle(id);
  const cat = (category || 'Malay Amateur').replace(/[-_]/g, ' ');
  return `${title} - Watch on xMelayu. Category: ${cat}. Free HD Malay amateur videos.`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function main() {
  const videos = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const start = Date.now();

  const pages = [
    { path: '/', mod: new Date().toISOString() },
    { path: '/about', mod: new Date().toISOString() },
    { path: '/faq', mod: new Date().toISOString() },
    { path: '/collections', mod: new Date().toISOString() },
    { path: '/super-x-melayu', mod: new Date().toISOString() },
    { path: '/mega-x-melayu', mod: new Date().toISOString() },
    { path: '/xmateur', mod: new Date().toISOString() },
    { path: '/xamateur', mod: new Date().toISOString() },
    { path: '/tudung-porn', mod: new Date().toISOString() },
    { path: '/xmelayu', mod: new Date().toISOString() },
    { path: '/xmalayporn', mod: new Date().toISOString() },
    { path: '/xmalay', mod: new Date().toISOString() },
    { path: '/mega-x', mod: new Date().toISOString() },
    { path: '/xamateur/real', mod: new Date().toISOString() }
  ];

  const MAX = 40000;
  const sitemaps = [];
  let idx = 0;

  const pageLines = ['<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const p of pages) {
    pageLines.push(`<url><loc>${SITE_BASE}${p.path}</loc><lastmod>${p.mod}</lastmod></url>`);
  }
  pageLines.push('</urlset>');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap-pages.xml'), pageLines.join('\n'), 'utf8');
  sitemaps.push('sitemap-pages.xml');

  for (let i = 0; i < videos.length; i += MAX) {
    idx++;
    const chunk = videos.slice(i, i + MAX);
    const lines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
      `  xmlns:video="${VNS}">`
    ];

    for (const v of chunk) {
      const url = `${SITE_BASE}/${v.id}`;
      const title = esc(buildCleanTitle(v.id));
      const thumb = v.thumbnail ? (v.thumbnail.startsWith('http') ? v.thumbnail : `${SITE_BASE}${v.thumbnail}`) : '';
      const desc = esc(buildCleanDescription(v.id, v.category).substring(0, 200));
      const cat = esc(v.category || 'Malay Amateur');
      const lastmod = v.uploaded ? new Date(v.uploaded).toISOString() : new Date().toISOString();

      lines.push('<url>');
      lines.push(`  <loc>${url}</loc>`);
      lines.push(`  <lastmod>${lastmod}</lastmod>`);
      lines.push(`  <video:video>`);
      lines.push(`    <video:thumbnail_loc>${thumb}</video:thumbnail_loc>`);
      lines.push(`    <video:title>${title}</video:title>`);
      lines.push(`    <video:description>${desc}</video:description>`);
      lines.push(`    <video:category>${cat}</video:category>`);
      lines.push(`    <video:family_friendly>no</video:family_friendly>`);
      lines.push(`    <video:requires_subscription>no</video:requires_subscription>`);
      lines.push(`    <video:uploader info="${SITE_BASE}/">${esc(v.uploader || 'xMelayu')}</video:uploader>`);
      lines.push(`    <video:publication_date>${v.uploaded ? new Date(v.uploaded).toISOString() : ''}</video:publication_date>`);
      lines.push(`  </video:video>`);
      lines.push('</url>');
    }

    lines.push('</urlset>');
    const fname = `sitemap-videos-${idx}.xml`;
    fs.writeFileSync(path.join(OUTPUT_DIR, fname), lines.join('\n'), 'utf8');
    sitemaps.push(fname);
  }

  const indexLines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
  ];
  for (const s of sitemaps) {
    indexLines.push(`  <sitemap><loc>${SITE_BASE}/${s}</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>`);
  }
  indexLines.push('</sitemapindex>');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap-index.xml'), indexLines.join('\n'), 'utf8');

  const totalMB = sitemaps.reduce((s, f) => {
    try { return s + fs.statSync(path.join(OUTPUT_DIR, f)).size; } catch { return s; }
  }, 0) / 1024 / 1024;

  console.log(`sitemap: ${sitemaps.length} files, ${videos.length + pages.length} URLs, ${totalMB.toFixed(2)}MB in ${Date.now() - start}ms`);
}

main();
