/**
 * Advanced Ad Management System for Video Gallery
 * Combines Server Dongzhi's sophisticated features with Working Gallery's clean implementation
 */

const fs = require('fs');
const path = require('path');

class AdManager {
  constructor(options = {}) {
    this.options = {
      enableLogging: options.enableLogging !== false,
      enableAnalytics: options.enableAnalytics !== false,
      rotationStrategy: options.rotationStrategy || 'round_robin',
      maxRetries: options.maxRetries || 3,
      ...options
    };

    this.adRotation = {
      currentIndex: 0,
      trafficStarsBanners: [
        '1c4d6304aa6e45b49bf2071eb84d1ece',
        '63cf9b761d6e4cf08381cb12180c6cf8',
        '5b3adf992ed04970a5a2ab2c895f87c5',
        'bb997c1f46ce4f57a392d8c0123a2e4a',
        'a78fbbc69b684ff8820c4a17093a75ec',
        '9b05c231df684d5e93b4e8b79f7b6798'
      ],
      exoClickBanners: ['5696732','5796582','5796584','5794636'],
      
      getNextTrafficStars() {
        const id = this.trafficStarsBanners[this.currentIndex % this.trafficStarsBanners.length];
        this.currentIndex++;
        return id;
      },
      
      getNextExoClick() {
        const id = this.exoClickBanners[this.currentIndex % this.exoClickBanners.length];
        this.currentIndex++;
        return id;
      }
    };

    this.adConfig = {
      // 5x more banners for better distribution + MORE FORMATS
      trafficStarsBanners: {
        '728x90': Array(15).fill().map((_, i) => [
          '1c4d6304aa6e45b49bf2071eb84d1ece',
          '63cf9b761d6e4cf08381cb12180c6cf8',
          '5b3adf992ed04970a5a2ab2c895f87c5',
          'bb997c1f46ce4f57a392d8c0123a2e4a'
        ][i % 4]),
        '320x100': Array(10).fill().map((_, i) => [
          'a78fbbc69b684ff8820c4a17093a75ec',
          '9b05c231df684d5e93b4e8b79f7b6798'
        ][i % 2]),
        '300x600': Array(8).fill('bb997c1f46ce4f57a392d8c0123a2e4a'),
        '970x250': Array(5).fill('1c4d6304aa6e45b49bf2071eb84d1ece'),
        // NEW FORMATS
        '300x250': Array(12).fill().map((_, i) => [
          '1c4d6304aa6e45b49bf2071eb84d1ece',
          '63cf9b761d6e4cf08381cb12180c6cf8'
        ][i % 2]),
        '160x600': Array(6).fill('5b3adf992ed04970a5a2ab2c895f87c5'),
        '336x280': Array(8).fill('bb997c1f46ce4f57a392d8c0123a2e4a')
      },
      exoClickBanners: {
        mobile300x250: Array(20).fill().map((_, i) => [
          '5696732','5796582','5796584','5794636'
        ][i % 4])
      },
      trafficStarsVast: [
        '5b3adf992ed04970a5a2ab2c895f87c5','dedaf1b341d745749dbe497f318daf76',
        'dd516f90cd3b4a5e8dcc07001ba4b52b','33a8bd43d7594ff2bddc2869b1c10dd7',
        'bb997c1f46ce4f57a392d8c0123a2e4a','3cbf378b0c824a4b9182f258ca050783'
      ],
      exoClickVast: Array(8).fill('https://s.magsrv.com/v1/vast.php?idzone=5794636'),
      interstitialDesktop: '3b0b6104a47a4ce4bc39a87008fc9f26',
      interstitialMobile: '7266754ac9b04608999602741bb60960',
      pushNotifications: [
        'push-001','push-002','push-003','push-004'
      ],
      nativeAds: [
        'native-001','native-002','native-003','native-004'
      ],
      videoOverlays: [
        'overlay-001','overlay-002','overlay-003','overlay-004'
      ],
      stickyAds: [
        'sticky-001','sticky-002','sticky-003'
      ]
    };

    this.performanceMetrics = {
      impressions: 0,
      clicks: 0,
      revenue: 0,
      ctr: 0
    };

    // Load dynamic ads from Ads.txt
    this.loadDynamicAds();
  }

  /**
   * Load and parse ads.txt for dynamic VAST and banner loading
   */
  loadDynamicAds() {
    try {
      const adsFile = path.join(__dirname, '../Ads.txt');
      if (fs.existsSync(adsFile)) {
        let text = fs.readFileSync(adsFile, 'utf8');
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        
        this.adConfig.dynamicVastUrls = [];
        this.adConfig.dynamicBannerScripts = [];

        for (const line of lines) {
          // Extract explicit URLs (vast.php, /vast? queries)
          const urlMatch = line.match(/https?:\/\/[^")'\s]+/i);
          if (urlMatch) {
            const u = urlMatch[0];
            if (/vast/i.test(u)) this.adConfig.dynamicVastUrls.push(u);
            else if (/\.js|magsrv|tsyndicate|cdn\./i.test(u)) this.adConfig.dynamicBannerScripts.push(u);
            continue;
          }

          // Extract data-ts-spot (TrafficStars banner snippets)
          const spotMatch = line.match(/data-ts-spot\s*=\s*"([^"]+)"/i);
          if (spotMatch) {
            const spot = spotMatch[1];
            this.adConfig.dynamicVastUrls.push(`https://tsyndicate.com/do2/${spot}/vast?extid={extid}`);
          }
        }

        if (this.options.enableLogging) {
          console.log(`✅ Loaded ${this.adConfig.dynamicVastUrls.length} dynamic VAST URLs from Ads.txt`);
        }
      }
    } catch (err) {
      if (this.options.enableLogging) {
        console.warn('⚠️ Failed to parse Ads.txt:', err.message);
      }
      this.adConfig.dynamicVastUrls = [];
      this.adConfig.dynamicBannerScripts = [];
    }
  }

  /**
   * Generate blended banner with advanced targeting
   */
  generateBlendedBanner(type = '728x90', options = {}) {
    const {
      category = 'General',
      isMobile = false,
      position = 'default',
      targeting = {}
    } = options;

    // NLP-based banner selection
    const selectedBannerId = this.selectBannerByCategory(type, category);
    const [width, height] = type.split('x').map(Number);
    
    // Advanced targeting attributes
    const targetingAttrs = this.buildTargetingAttributes(targeting);
    
    const banner = `
    <div class="ad-container blended-banner ${type} ${position}" 
         style="width:${width}px;height:${height}px;margin:auto;overflow:hidden;border-radius:8px;background:transparent;"
         data-category="${category}" 
         data-position="${position}"
         ${targetingAttrs}>
      <script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" 
        data-ts-spot="${selectedBannerId}" 
        data-ts-width="${width}" 
        data-ts-height="${height}" 
        data-ts-extid="{extid}"
        data-ts-targeting='${JSON.stringify(targeting)}'
        async defer>
      </script>
    </div>`;

    this.trackImpression('banner', type, position);
    return banner;
  }

  /**
   * Generate mobile-optimized banner
   */
  generateMobileBanner(options = {}) {
    const {
      category = 'General',
      position = 'mobile_default',
      size = '300x250'
    } = options;

    const zoneIds = this.adConfig.exoClickBanners.mobile300x250;
    const zoneId = zoneIds[Math.floor(Math.random() * zoneIds.length)];
    
    const banner = `
    <div class="ad-container mobile-banner ${size} ${position}" 
         style="width:300px;height:250px;margin:auto;border-radius:12px;overflow:hidden;"
         data-category="${category}"
         data-size="${size}">
      <script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script>
      <ins class="eas6a97888e2" 
           data-zoneid="${zoneId}" 
           style="display:block;width:300px;height:250px;"></ins>
      <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>
    </div>`;

    this.trackImpression('mobile_banner', size, position);
    return banner;
  }

  /**
   * Generate VAST ad URL with rotation
   */
  generateVastUrl(filename = '', options = {}) {
    const {
      maxRetries = this.options.maxRetries,
      rotationStrategy = this.options.rotationStrategy
    } = options;

    const pool = this.adConfig.dynamicVastUrls && this.adConfig.dynamicVastUrls.length ? 
      this.adConfig.dynamicVastUrls : 
      [...this.adConfig.trafficStarsVast, ...this.adConfig.exoClickVast];

    if (pool.length === 0) {
      if (this.options.enableLogging) {
        console.warn('⚠️ No VAST URLs available');
      }
      return 'https://example.com/vast.xml'; // Fallback
    }

    let selectedUrl;
    
    switch (rotationStrategy) {
      case 'random':
        selectedUrl = pool[Math.floor(Math.random() * pool.length)];
        break;
      
      case 'round_robin':
      default:
        const index = this.adRotation.currentIndex % pool.length;
        selectedUrl = pool[index];
        this.adRotation.currentIndex++;
        break;
    }

    this.trackImpression('vast', 'video', 'player');
    return selectedUrl;
  }

  /**
   * Get rotating VAST list for player configuration
   */
  getRotatingVastList(filename, max = 3, options = {}) {
    const pool = this.adConfig.dynamicVastUrls && this.adConfig.dynamicVastUrls.length ? 
      [...this.adConfig.dynamicVastUrls] : 
      [...this.adConfig.trafficStarsVast, ...this.adConfig.exoClickVast];

    // Shuffle pool for better rotation
    const shuffledPool = [...pool];
    for (let i = shuffledPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }

    const selectedUrls = shuffledPool.slice(0, Math.min(max, shuffledPool.length));
    
    if (this.options.enableLogging) {
      console.log(`🎯 Selected ${selectedUrls.length} VAST URLs for ${filename}`);
    }

    return selectedUrls;
  }

  /**
   * Generate interstitial ad
   */
  generateInterstitial(isMobile = false, options = {}) {
    const {
      category = 'General',
      delay = 0
    } = options;

    const spot = isMobile ? this.adConfig.interstitialMobile : this.adConfig.interstitialDesktop;
    
    const interstitial = `
    <link rel="stylesheet" href="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.css"/>
    <script src="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.js"></script>
    <script>
      setTimeout(function() {
        InterstitialTsAd({
          spot: "${spot}", 
          extid: "{extid}",
          category: "${category}",
          delay: ${delay}
        });
      }, ${delay});
    </script>`;

    this.trackImpression('interstitial', isMobile ? 'mobile' : 'desktop', 'fullscreen');
    return interstitial;
  }

  /**
   * Generate native ad
   */
  generateNativeAd(options = {}) {
    const {
      category = 'General',
      style = 'card',
      size = 'medium'
    } = options;

    const nativeAdId = this.adConfig.nativeAds[Math.floor(Math.random() * this.adConfig.nativeAds.length)];
    
    const nativeAd = `
    <div class="ad-container native-ad ${style} ${size}" 
         data-category="${category}"
         style="background: linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(255, 107, 107, 0.1));
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
                border: 1px solid rgba(78, 205, 196, 0.3);">
      <div class="native-ad-content">
        <h4 style="color: #4ecdc4; margin-bottom: 10px;">🎯 Sponsored Content</h4>
        <p style="color: #fff; margin-bottom: 15px;">Native advertisement matching your interests in ${category}</p>
        <button class="native-ad-cta" 
                style="background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
                       color: white;
                       border: none;
                       padding: 10px 20px;
                       border-radius: 25px;
                       cursor: pointer;
                       font-weight: bold;">
          Learn More
        </button>
      </div>
      <script>
        // Track native ad interaction
        document.querySelector('.native-ad-cta').addEventListener('click', function() {
          // Analytics tracking code here
          console.log('Native ad clicked:', '${nativeAdId}');
        });
      </script>
    </div>`;

    this.trackImpression('native', size, style);
    return nativeAd;
  }

  /**
   * Generate push notification
   */
  generatePushNotification(options = {}) {
    const {
      category = 'General',
      title = 'New Video Available',
      body = 'Check out the latest videos in your favorite category'
    } = options;

    const pushId = this.adConfig.pushNotifications[Math.floor(Math.random() * this.adConfig.pushNotifications.length)];
    
    // This would typically integrate with a push notification service
    const pushNotification = `
    <script>
      // Push notification implementation
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
          // Request notification permission
          Notification.requestPermission().then(function(permission) {
            if (permission === 'granted') {
              // Show notification
              const notification = new Notification('${title}', {
                body: '${body}',
                icon: '/icon-192x192.png',
                badge: '/badge-72x72.png',
                tag: '${pushId}',
                data: {
                  category: '${category}',
                  timestamp: Date.now()
                }
              });
              
              notification.onclick = function() {
                window.focus();
                // Track notification click
                console.log('Push notification clicked:', '${pushId}');
              };
            }
          });
        });
      }
    </script>`;

    this.trackImpression('push', 'notification', 'browser');
    return pushNotification;
  }

  /**
   * NLP-based banner selection by category
   */
  selectBannerByCategory(type, category) {
    const banners = this.adConfig.trafficStarsBanners[type] || this.adConfig.trafficStarsBanners['728x90'];
    
    // Use category-based rotation for better targeting
    const categoryHash = this.hashString(category);
    const index = (categoryHash + this.adRotation.currentIndex) % banners.length;
    
    return banners[index];
  }

  /**
   * Build targeting attributes for ads
   */
  buildTargetingAttributes(targeting) {
    const attrs = [];
    
    if (targeting.category) {
      attrs.push(`data-targeting-category="${targeting.category}"`);
    }
    
    if (targeting.audience) {
      attrs.push(`data-targeting-audience="${targeting.audience}"`);
    }
    
    if (targeting.geo) {
      attrs.push(`data-targeting-geo="${targeting.geo}"`);
    }
    
    if (targeting.device) {
      attrs.push(`data-targeting-device="${targeting.device}"`);
    }
    
    return attrs.join(' ');
  }

  /**
   * Track ad impression for analytics
   */
  trackImpression(type, size, position) {
    this.performanceMetrics.impressions++;
    
    if (this.options.enableAnalytics) {
      // Send to analytics service
      console.log(`📊 Ad Impression: ${type} ${size} at ${position}`);
    }
  }

  /**
   * Track ad click
   */
  trackClick(adId, type, position) {
    this.performanceMetrics.clicks++;
    this.performanceMetrics.ctr = (this.performanceMetrics.clicks / this.performanceMetrics.impressions) * 100;
    
    if (this.options.enableAnalytics) {
      console.log(`👆 Ad Click: ${adId} (${type}) at ${position}`);
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      ctr: this.performanceMetrics.ctr.toFixed(2),
      revenue_per_impression: this.performanceMetrics.revenue / this.performanceMetrics.impressions || 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.performanceMetrics = {
      impressions: 0,
      clicks: 0,
      revenue: 0,
      ctr: 0
    };
  }

  /**
   * Utility function to create hash from string
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get ad placement strategy based on page type and content
   */
  getAdPlacementStrategy(pageType, category = 'General', isMobile = false) {
    const strategies = {
      homepage: {
        header: isMobile ? 'mobile300x250' : '728x90',
        sidebar: '300x600',
        footer: isMobile ? 'mobile300x250' : '728x90',
        inline: ['300x250', '728x90'],
        frequency: 6 // Every 6 videos
      },
      category: {
        header: isMobile ? 'mobile300x250' : '728x90',
        sidebar: '300x600',
        footer: isMobile ? 'mobile300x250' : '728x90',
        inline: ['300x250', '728x90'],
        frequency: 4 // Every 4 videos
      },
      video: {
        preRoll: 'vast',
        midRoll: 'vast',
        postRoll: 'vast',
        sidebar: '300x600',
        footer: '728x90'
      },
      browse: {
        header: isMobile ? 'mobile300x250' : '728x90',
        sidebar: '300x600',
        footer: '728x90',
        inline: ['300x250'],
        frequency: 6 // Every 6 videos
      }
    };

    return strategies[pageType] || strategies.homepage;
  }

  /**
   * Generate optimal ad layout for page
   */
  generateOptimalAdLayout(pageType, videoCount = 0, options = {}) {
    const {
      category = 'General',
      isMobile = false,
      enableNative = true,
      enablePush = false
    } = options;

    const strategy = this.getAdPlacementStrategy(pageType, category, isMobile);
    const layout = {
      header: null,
      sidebar: null,
      footer: null,
      inline: [],
      native: null,
      push: null
    };

    // Header ad
    if (strategy.header) {
      layout.header = isMobile ? 
        this.generateMobileBanner({ category, position: 'header' }) :
        this.generateBlendedBanner(strategy.header, { category, position: 'header' });
    }

    // Sidebar ad (desktop only)
    if (!isMobile && strategy.sidebar) {
      layout.sidebar = this.generateBlendedBanner(strategy.sidebar, { 
        category, 
        position: 'sidebar' 
      });
    }

    // Footer ad
    if (strategy.footer) {
      layout.footer = isMobile ? 
        this.generateMobileBanner({ category, position: 'footer' }) :
        this.generateBlendedBanner(strategy.footer, { category, position: 'footer' });
    }

    // Inline ads for video grids
    if (strategy.inline && videoCount > 0) {
      const adFrequency = strategy.frequency || 6;
      for (let i = adFrequency; i < videoCount; i += adFrequency) {
        const adSize = strategy.inline[i % strategy.inline.length];
        layout.inline.push({
          position: i,
          html: isMobile ? 
            this.generateMobileBanner({ category, position: `inline_${i}` }) :
            this.generateBlendedBanner(adSize, { category, position: `inline_${i}` })
        });
      }
    }

    // Native ad
    if (enableNative) {
      layout.native = this.generateNativeAd({ category, style: 'card' });
    }

    // Push notification
    if (enablePush) {
      layout.push = this.generatePushNotification({ 
        category, 
        title: `New ${category} Videos`,
        body: `Discover the latest videos in ${category}`
      });
    }

    return layout;
  }
}

module.exports = AdManager;
