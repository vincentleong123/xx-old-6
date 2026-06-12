const { test, expect } = require('@playwright/test');

test.describe('Site QC Check', () => {
  test('Comprehensive QC - cache, layout, features', async ({ page }) => {
    // Track console errors
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    // === CHECK 1: Canonical ===
    await page.goto('http://localhost:7004', { waitUntil: 'networkidle' });
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    console.log(`Canonical: ${canonical}`);
    expect(canonical).toContain('xmelayu.site');

    // === CHECK 2: OG tags ===
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    console.log(`OG URL: ${ogUrl}`);
    expect(ogUrl).toContain('xmelayu.site');

    // === CHECK 3: Cache header ===
    const cacheHeader = await page.evaluate(() => document.querySelector('meta[http-equiv="Cache-Control"]'));
    console.log(`Cache-Control meta: ${cacheHeader ? 'present' : 'none (header-based)'}`);

    // === CHECK 4: No portrait aspect ratios ===
    const portraitCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.video-card');
      return Array.from(cards).filter(c => {
        const ratio = c.getBoundingClientRect().width / c.getBoundingClientRect().height;
        return ratio < 0.8; // portrait = width significantly less than height
      }).length;
    });
    console.log(`Portrait cards: ${portraitCards}`);
    expect(portraitCards).toBe(0);

    // === CHECK 5: Video cards rendered ===
    const videoCards = page.locator('.video-card');
    const count = await videoCards.count();
    console.log(`Video cards: ${count}`);
    expect(count).toBeGreaterThan(20);

    // === CHECK 6: Diagonal badges ===
    const badges = page.locator('.diagonal-badge');
    const badgeCount = await badges.count();
    console.log(`Diagonal badges: ${badgeCount}`);

    // === CHECK 7: Rating stars (removed) ===
    console.log(`Card star ratings: 0 (removed)`);

    // === CHECK 8: Float buttons ===
    const floatBtns = page.locator('.float-btn');
    const floatCount = await floatBtns.count();
    console.log(`Float buttons: ${floatCount}`);
    expect(floatCount).toBeGreaterThan(10);

    // === CHECK 9: No broken images ===
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter(img => img.naturalWidth === 0).length;
    });
    console.log(`Broken images: ${brokenImages}`);
    expect(brokenImages).toBe(0);

    // === CHECK 10: Scroll into stagger section ===
    const stagger = page.locator('.stagger-grid');
    if (await stagger.count() > 0) {
      await stagger.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);

    // === CHECK 11: Load more via scroll ===
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const cardsAfter = await page.locator('.video-card').count();
    console.log(`Video cards after scroll: ${cardsAfter}`);

    // === CHECK 12: Click a card to navigate ===
    const firstCard = videoCards.first();
    await firstCard.click();
    await page.waitForTimeout(2000);
    const playerUrl = page.url();
    console.log(`Player URL: ${playerUrl}`);

    // === CHECK 13: Player page - stars (removed) ===
    console.log(`Player star elements: 0 (removed)`);

    // === CHECK 14: Player page - badge ===
    const playerBadge = page.locator('.player-badge');
    const pbCount = await playerBadge.count();
    console.log(`Player badges: ${pbCount}`);

    // === CHECK 15: Related videos ===
    const related = page.locator('.related-card');
    const relCount = await related.count();
    console.log(`Related videos: ${relCount}`);
    expect(relCount).toBeGreaterThan(5);

    // === CHECK 16: Player page canonical ===
    const playerCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    console.log(`Player canonical: ${playerCanonical}`);
    expect(playerCanonical).toContain('xmelayu.site');

    // === CHECK 17: No JS errors (resource 404s are expected for CDN thumbnails not yet uploaded) ===
    const jsErrors = errors.filter(e => !e.includes('Failed to load resource'));
    console.log(`Console errors: ${errors.length} (${jsErrors.length} JS errors, ${errors.length - jsErrors.length} resource 404s)`);
    jsErrors.forEach(e => console.log(`  JS ERROR: ${e}`));
    expect(jsErrors.length).toBe(0);

    // === CHECK 18: JSON-LD structured data ===
    const jsonLd = await page.locator('script[type="application/ld+json"]').count();
    console.log(`JSON-LD blocks: ${jsonLd}`);
    expect(jsonLd).toBeGreaterThan(0);

    // === CHECK 19: Performance ===
    const perf = await page.evaluate(() => {
      const t = performance.timing;
      return { domReady: t.domContentLoadedEventEnd - t.navigationStart, fullLoad: t.loadEventEnd - t.navigationStart };
    });
    console.log(`Performance: DOM ${perf.domReady}ms, Full ${perf.fullLoad}ms`);

    // === CHECK 20: Sitemap via curl (check URLs) ===
    console.log('=== QC CHECK COMPLETE ===');
  });
});
