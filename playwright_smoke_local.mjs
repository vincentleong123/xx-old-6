import { chromium } from 'playwright';
import { setTimeout as delay } from 'timers/promises';

// This script tests the *already-running* server for this site.
// You must set BASE_URL (the domain) before running.
const BASE_URL = (process.env.BASE_URL || '').trim();
if (!BASE_URL) throw new Error('Missing BASE_URL env var');

const MAX_VISITS = parseInt(process.env.MAX_VISITS || '200', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '30000', 10);

const visited = new Set();
const results = [];

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}

async function check(url, context) {
  const norm = normalizeUrl(url);
  if (visited.has(norm)) return;
  if (visited.size >= MAX_VISITS) return;
  visited.add(norm);

  const start = Date.now();
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1366, height: 768 });
    page.setDefaultTimeout(TIMEOUT_MS);

    // Use non-blocking navigation; don’t download media.
    await page.route('**/*', async (route) => {
      const req = route.request();
      const rtype = req.resourceType();
      if (rtype === 'media' || rtype === 'font') return route.abort();
      return route.continue();
    });

    const resp = await page.goto(norm, { waitUntil: 'domcontentloaded' });
    const status = resp ? resp.status() : 0;
    const title = await page.title().catch(() => '');

    results.push({ url: norm, status, title, ms: Date.now() - start });
    await page.close();
  } catch (e) {
    results.push({ url: norm, status: 'ERR', title: '', ms: Date.now() - start, error: e?.message || String(e) });
  }
}

async function main() {
  const base = BASE_URL.replace(/\/$/, '');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36'
  });

  const seedUrls = [
    `${base}/`,
    `${base}/api/health`,
    `${base}/api/imagic/stats`,
    `${base}/api/search?q=viral&sort=views&page=1&limit=20`,
    `${base}/api/imagic/category/malay`,
    `${base}/api/imagic/category/indonesian`,
    `${base}/api/imagic/category/thai`,
    `${base}/api/memories`,
    `${base}/api/memories/latest`,
  ];

  for (const u of seedUrls) {
    await check(u, context);
    await delay(200);
    if (visited.size >= MAX_VISITS) break;
  }

  await context.close();
  await browser.close();

  const fs = await import('fs/promises');
  const outPath = `crawl_report_old_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fs.writeFile(outPath, JSON.stringify({ base: BASE_URL, visitedCount: visited.size, results }, null, 2));
  console.log(`Saved: ${outPath}`);

  const non200 = results.filter(r => r.status !== 200);
  console.log('Non-200:', non200.length);
  non200.forEach(r => console.log(`${r.url} -> ${r.status}`));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

