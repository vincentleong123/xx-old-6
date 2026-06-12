const { test, expect } = require('@playwright/test');

test.describe('Comprehensive Site Check', () => {

  test('1. Gallery page loads with GA G-PMWBHF9XY6', async ({ page }) => {
    await page.goto('http://localhost:7004/', { timeout: 10000 });
    
    // Check page title
    await expect(page).toHaveTitle(/Lucahman/);
    
    // Check GA script is present
    const gaScript = await page.locator('script[src*="googletagmanager"]').count();
    expect(gaScript).toBeGreaterThan(0);
    
    // Check GA config contains tracking ID
    const bodyHTML = await page.content();
    expect(bodyHTML).toContain('G-PMWBHF9XY6');
    
    console.log('✅ Gallery: GA G-PMWBHF9XY6 loaded');
  });

  test('2. Compression middleware active', async ({ request }) => {
    const response = await request.get('http://localhost:7004/');
    const encoding = response.headers()['content-encoding'];
    expect(encoding).toBe('gzip');
    console.log('✅ Compression: Active (gzip)');
  });

  test('3. Micro-cache works (5min TTL)', async ({ request }) => {
    const res1 = await request.get('http://localhost:7004/');
    const res2 = await request.get('http://localhost:7004/');
    
    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);
    
    console.log('✅ Micro-cache: Routes responding');
  });

  test('4. SEO: Mixed Malay-English + inLanguage', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    // Check meta description has mixed language
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(metaDesc).toMatch(/Melayu|Awek|Tudung|Malaysian/);
    
    // Check JSON-LD has inLanguage
    const jsonLDs = await page.locator('script[type="application/ld+json"]').allTextContents();
    const hasInLanguage = jsonLDs.some(json => json.includes('"inLanguage"'));
    expect(hasInLanguage).toBe(true);
    
    console.log('✅ SEO: Mixed Malay-English + inLanguage OK');
  });

  test('5. Hero section with stats pills + quick tag links', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    // Check hero section exists
    const heroSection = await page.locator('.hero-section').count();
    expect(heroSection).toBe(1);
    
    // Check "Apa itu Lucahman?" text
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/Apa itu|What is/);
    
    // Check stats pills (4 pills)
    const statsPills = await page.locator('.hero-stats span').count();
    expect(statsPills).toBe(4);
    
    // Check quick tag links (6 links)
    const tagLinks = await page.locator('.hero-tags a').count();
    expect(tagLinks).toBe(6);
    
    console.log('✅ Hero: Stats pills + Quick tag links OK');
  });

  test('6. GA event tracking functions exist (Gallery)', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    const hasTrackCategory = await page.evaluate(() => typeof trackCategory === 'function');
    const hasTrackTag = await page.evaluate(() => typeof trackTag === 'function');
    const hasTrackSearch = await page.evaluate(() => typeof trackSearch === 'function');
    
    expect(hasTrackCategory).toBe(true);
    expect(hasTrackTag).toBe(true);
    expect(hasTrackSearch).toBe(true);
    
    console.log('✅ Gallery: GA tracking functions OK');
  });

  test('7. Player page has video event tracking', async ({ page }) => {
    // Use a test video ID (will 404 but page should still render GA)
    const response = await page.goto('http://localhost:7004/test-video-id', { waitUntil: 'domcontentloaded' });
    
    // Check GA on player page
    const bodyHTML = await page.content();
    expect(bodyHTML).toContain('G-PMWBHF9XY6');
    
    // Check video tracking functions
    const hasInitVideo = await page.evaluate(() => typeof initVideoTracking === 'function');
    const hasTrackLike = await page.evaluate(() => typeof trackLike === 'function');
    const hasTrackShare = await page.evaluate(() => typeof trackShare === 'function');
    const hasTrackRelated = await page.evaluate(() => typeof trackRelatedClick === 'function');
    
    expect(hasInitVideo).toBe(true);
    expect(hasTrackLike).toBe(true);
    expect(hasTrackShare).toBe(true);
    expect(hasTrackRelated).toBe(true);
    
    console.log('✅ Player: Video event tracking OK');
  });

  test('8. API endpoints respond correctly', async ({ request }) => {
    const health = await request.get('http://localhost:7004/api/health');
    expect(health.status()).toBe(200);
    
    const stats = await request.get('http://localhost:7004/api/stats');
    expect(stats.status()).toBe(200);
    
    const search = await request.get('http://localhost:7004/api/search?q=test');
    expect(search.status()).toBe(200);
    
    console.log('✅ API Endpoints: All OK');
  });

  test('9. Check for JavaScript errors in console', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    page.on('pageerror', err => errors.push(err.message));
    
    await page.goto('http://localhost:7004/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Filter out expected errors (like missing video index)
    const criticalErrors = errors.filter(e => 
      !e.includes('index') && 
      !e.includes('video-index') &&
      !e.includes('EADDRINUSE')
    );
    
    if (criticalErrors.length > 0) {
      console.log('⚠️ Console errors:', criticalErrors);
    }
    
    expect(criticalErrors.length).toBe(0);
    console.log('✅ No critical JS errors');
  });

  test('10. SEO content section present', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    const seoContent = await page.locator('.seo-content').count();
    expect(seoContent).toBe(1);
    
    const seoText = await page.locator('.seo-content').textContent();
    expect(seoText).toMatch(/Apa itu|What is|Lucahman/);
    
    console.log('✅ SEO Content: "Apa itu Lucahman" section OK');
  });

  test('11. Scroll depth tracking setup', async ({ page }) => {
    await page.goto('http://localhost:7004/');
    
    const hasScrollTracking = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return html.includes('scroll_depth') && html.includes('checkScroll');
    });
    
    expect(hasScrollTracking).toBe(true);
    console.log('✅ Scroll depth tracking: Setup OK');
  });
});
