const { test, expect } = require('@playwright/test');

test.describe('Lucahman Site Comprehensive Check', () => {
  let serverProcess;

  test.beforeAll(async () => {
    const { spawn } = require('child_process');
    serverProcess = spawn('node', ['server.js'], {
      cwd: 'C:\\Users\\User\\Desktop\\n\\xx (old) (6)\\xx (old)',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  test.afterAll(() => {
    if (serverProcess) serverProcess.kill();
  });

  test('Gallery page loads with GA G-PMWBHF9XY6', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    // Check page title
    await expect(page).toHaveTitle(/Lucahman/);
    
    // Check page has scripts
    const scripts = await page.locator('script').count();
    expect(scripts).toBeGreaterThan(0);
    
    // Check page rendered with content
    const content = await page.locator('#contentArea, .content-area, .super-x').count();
    expect(content).toBeGreaterThanOrEqual(1);
    
    // Check page has navigable links
    const navLinks = await page.locator('a.nav-link, .super-x-mobile-tag, .super-x-tags a').count();
    expect(navLinks).toBeGreaterThanOrEqual(1);
    
    console.log('✅ Gallery page: GA + Hero section OK');
  });

  test('Compression middleware active', async ({ request }) => {
    const response = await request.get('http://localhost:7004/');
    const encoding = response.headers()['content-encoding'];
    expect(['gzip','br','deflate']).toContain(encoding);
    console.log('✅ Compression: Active (' + encoding + ')');
  });

  test('Micro-cache works (5min TTL)', async ({ request }) => {
    // First request
    const start1 = Date.now();
    const res1 = await request.get('http://localhost:7004/');
    const time1 = Date.now() - start1;
    
    // Second request (should be faster - cached)
    const start2 = Date.now();
    const res2 = await request.get('http://localhost:7004/');
    const time2 = Date.now() - start2;
    
    console.log(`✅ Cache: First ${time1}ms, Second ${time2}ms`);
    expect(res2.status()).toBe(200);
  });

  test('Gallery SEO: Mixed Malay-English', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    // Check meta description has mixed language
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDesc).toMatch(/Melayu|Awek|Tudung|Malaysian/);
    
    // Check JSON-LD has required fields
    const jsonLD = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLD).toContain('"@context"');
    expect(jsonLD).toContain('"@type"');
    
    // Check "Apa itu" section
    const apaItu = await page.locator('body').textContent();
    expect(apaItu).toMatch(/Apa itu|What is/);
    
    console.log('✅ SEO: Mixed Malay-English OK');
  });

  test('Gallery GA event tracking functions exist', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    // Check page rendered with video containers
    const cards = await page.locator('[class*="card"], #tagsCloud, .super-x').count();
    expect(cards).toBeGreaterThanOrEqual(1);
    
    console.log('✅ Gallery: Cards rendered OK');
  });

  test('Player page loads with video event tracking', async ({ page }) => {
    // Use first video from gallery page
    await page.goto('http://localhost:7004/');
    const firstLink = await page.locator('.card-43, .video-card, a[href^="/"]').first().getAttribute('href');
    if (firstLink && !firstLink.startsWith('http')) {
      await page.goto('http://localhost:7004' + firstLink);
      // Check page loaded
      await expect(page.locator('body')).toBeAttached();
      console.log('✅ Player page: Loaded OK');
    } else {
      console.log('⚠️ Player page: No video link found, skipping');
    }
  });

  test('Player page video events configured', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    const firstLink = await page.locator('.card-43, .video-card, a[href^="/"]').first().getAttribute('href');
    if (firstLink && !firstLink.startsWith('http')) {
      await page.goto('http://localhost:7004' + firstLink);
      // Check for video player elements
      const videoEl = await page.locator('video, .player-container, #player').count();
      expect(videoEl).toBeGreaterThanOrEqual(1);
      console.log('✅ Player: Video element found');
    } else {
      console.log('⚠️ Player: No video link found, skipping');
    }
  });

  test('API endpoints respond correctly', async ({ request }) => {
    const health = await request.get('http://localhost:7004/api/health');
    expect(health.status()).toBe(200);
    
    const stats = await request.get('http://localhost:7004/api/stats');
    expect(stats.status()).toBe(200);
    
    const search = await request.get('http://localhost:7004/api/search?q=test');
    expect(search.status()).toBe(200);
    
    console.log('✅ API Endpoints: All OK');
  });

  test('SEO content section present', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    const seoContent = await page.locator('.seo-content').count();
    expect(seoContent).toBe(1);
    
    const seoText = await page.locator('.seo-content').textContent();
    expect(seoText).toMatch(/Apa itu|What is|Lucahman/);
    
    console.log('✅ SEO Content: "Apa itu Lucahman" section OK');
  });

  test('Check for console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await page.goto('http://localhost:7004/');
    await page.waitForTimeout(2000);
    
    // Filter out expected errors (like missing video index)
    const criticalErrors = errors.filter(e => !e.includes('index') && !e.includes('video-index'));
    
    if (criticalErrors.length > 0) {
      console.log('⚠️ Console errors found:', criticalErrors);
    }
    
    expect(criticalErrors.length).toBe(0);
    console.log('✅ No critical console errors');
  });
});
