// Configuration for Traffic Stars and ExoClick ads
const adInventory = {
    trafficStars: [
        // Mobile Banners (300x250)
        { id: 'mobile_banner_1', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="5b3adf992ed04970a5a2ab2c895f87c5" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'mobile_banner_2', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="dedaf1b341d745749dbe497f318daf76" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'mobile_banner_3', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="a78fbbc69b684ff8820c4a17093a75ec" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'mobile_banner_4', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="9b05c231df684d5e93b4e8b79f7b6798" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        
        // Leaderboard (900x250) - Desktop
        { id: 'leaderboard_1', width: 900, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="c0eefa39fda047bf9d6358321f25c444" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'leaderboard_2', width: 900, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="2496c2e3c5c94a46bd913f7849ea4512" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'leaderboard_3', width: 900, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="b26d5145d610442ba96f4183849bbe7d" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        
        // Skyscraper (300x600) equivalent using 300x100 stacked
        { id: 'skyscraper_1', width: 300, height: 100, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="3c75dbb3e72b408985d62c9bf326348a" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' },
        { id: 'skyscraper_2', width: 300, height: 100, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="9260423ef40045fba4d49b6daee386c3" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' },
        { id: 'skyscraper_3', width: 300, height: 100, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="0d35874dbdd945afb6a067be8aa1602a" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' },
        
        // Medium Rectangle (300x250) - More options
        { id: 'rectangle_1', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="fbef373f57384acfb51828f6e293f5b1" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
        { id: 'rectangle_2', width: 300, height: 250, script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="1b274a46be4a46a89a38e74dc024302e" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' },
    ],
    
    exoClick: [
        // Sidebar Skyscraper (160x600 / 300x600)
        { id: 'sidebar_skyscraper', width: 300, height: 600, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5691342"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        
        // Sticky Bottom Banner
        { id: 'sticky_banner', width: 728, height: 90, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e17" data-zoneid="5794624"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        
        // Instant Message (Bottom Right)
        { id: 'im_banner', width: 300, height: 250, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e6" data-zoneid="5794622"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        
        // Push Notification (High CPM)
        { id: 'push_notification', script: '<script type="application/javascript">\n    pn_idzone = 5708748;\n    pn_sleep_seconds = 0;\n    pn_is_self_hosted = 1;\n    pn_soft_ask = 0;\n    pn_filename = "/worker.js"; \n</script>' },
        
        // Standard Banners (300x250)
        { id: 'exo_banner_1', width: 300, height: 250, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5796582"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        { id: 'exo_banner_2', width: 300, height: 250, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5796588"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        { id: 'exo_banner_3', width: 300, height: 250, script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5796590"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' },
        
        // Native Ad - High CTR
        { id: 'native_ad', width: 300, height: 250, script: '<div id="ts_ad_native_ifz1k"></div>\n<script src="//cdn.tsyndicate.com/sdk/v1/n.js"></script>\n<script>\n   NativeAd({\n       element_id: "ts_ad_native_ifz1k",\n       spot: "9c5809b716564d1a91fa888f34334ce9",\n       type: "label-over",\n       cols: 1,\n       rows: 1,\n       title: "",\n       titlePosition: "left",\n       adsByPosition: "bottom-right",\n       breakpoints: [\n          {\n            "cols": 1,\n            "width": 770\n          }\n       ],\n        extid: "{extid}",\n        showLogoInfo: true,\n        styles: {\n            "image": {\n                "padding-bottom": "229px"\n            },\n            "container": {\n                "width": "300px",\n                "height": "250px",\n                "overflow": "hidden"\n            }\n        }\n   });\n</script>' },
    ],
    
    vastAds: [
        { id: 'vast_1', url: 'https://s.magsrv.com/v1/vast.php?idzone=5794636' },
        { id: 'vast_2', url: 'https://tsyndicate.com/do2/3cbf378b0c824a4b9182f258ca050783/vast?extid={extid}' },
        { id: 'vast_3', url: 'https://tsyndicate.com/do2/b3df6feb26684dcf830c6c8ae2e93088/vast?extid={extid}' },
        { id: 'vast_4', url: 'https://s.magsrv.com/v1/vast.php?idzone=5691332' },
    ],
    
    // HIGH VALUE ADS - Use sparingly for maximum CPM
    premiumAds: [
        // Desktop Interstitial (Full Page) - Use once per session
        { 
            id: 'desktop_interstitial', 
            script: '<link rel="stylesheet" href="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.css" />\n<script src="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.js"></script>\n<script>\n   InterstitialTsAd({\n        spot: "3b0b6104a47a4ce4bc39a87008fc9f26",\n        extid: "{extid}",\n   });\n</script>',
            frequency: 'session', // Once per session
            maxPerSession: 1
        },
        
        // Mobile Interstitial (Full Page) - Use once per session
        { 
            id: 'mobile_interstitial', 
            script: '<link rel="stylesheet" href="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.css" />\n<script src="//cdn.tsyndicate.com/sdk/v1/interstitial.ts.js"></script>\n<script>\n   InterstitialTsAd({\n        spot: "7266754ac9b04608999602741bb60960",\n        extid: "{extid}",\n   });\n</script>',
            frequency: 'session', // Once per session
            maxPerSession: 1
        },
        
        // Exit Popup - High converting
        { 
            id: 'exit_popup', 
            script: '<script src="//cdn.tsyndicate.com/sdk/v1/exit.popup.js"></script>\n<script>\n   ExitPopupAd({\n        spot: "57e89f1a1b3048b98672e26594f947ab",\n        type: "label-under",\n        cols: 3,\n        rows: 2,\n        title: "",\n        width: "50%",\n        cookieExpires: "3",\n        adsByPosition: "right",\n        extid: "{extid}",\n        showLogoInfo: true,\n        styles: {\n            "label": {\n                "text-align": "center",\n                "font-family": "\'Open Sans\', sans-serif"\n            },\n            "headlineLink": {\n                "font-size": "14pxpxpx",\n                "font-weight": "bold"\n            },\n            "brandnameLink": {\n                "font-size": "10pxpxpx"\n            }\n        }\n   });\n</script>',
            frequency: 'daily', // Once per day per user
            maxPerSession: 1
        }
    ]
};

// Session tracking for premium ads
const sessionTracker = {
    desktopInterstitialShown: false,
    mobileInterstitialShown: false,
    exitPopupShown: false
};

// Helper function to get random elements from an array
function getRandomElements(array, count) {
    if (array.length === 0) return [];
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Helper to get device type
function getDeviceType() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) return 'mobile';
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) return 'mobile';
    if (/tablet/i.test(userAgent)) return 'tablet';
    return 'desktop';
}

module.exports = {
    // Get random ads for a specific format/placement
    getRandomAds: function(type, count = 1) {
        let pool = [];
        const deviceType = getDeviceType();
        
        if (type === 'sidebar') {
            // For sidebar, prefer skyscraper ads
            if (deviceType === 'mobile') {
                pool = adInventory.trafficStars.filter(ad => ad.width === 300 && ad.height === 250);
            } else {
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.width === 300 && ad.height === 100),
                    ...adInventory.exoClick.filter(ad => ad.id === 'sidebar_skyscraper' || ad.id === 'native_ad')
                ];
            }
        } else if (type === 'banner') {
            // For banners, mix TrafficStars and ExoClick
            if (deviceType === 'mobile') {
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.width === 300 && ad.height === 250),
                    ...adInventory.exoClick.filter(ad => ad.width === 300 && ad.height === 250)
                ];
            } else {
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.width === 900 && ad.height === 250),
                    ...adInventory.exoClick.filter(ad => ad.id === 'sticky_banner' || ad.id === 'im_banner')
                ];
            }
        } else if (type === 'rectangle') {
            // Medium rectangle ads (300x250)
            pool = [
                ...adInventory.trafficStars.filter(ad => ad.width === 300 && ad.height === 250),
                ...adInventory.exoClick.filter(ad => ad.width === 300 && ad.height === 250)
            ];
        }
        
        return getRandomElements(pool, count);
    },
    
    // Get a random VAST ad for video pre-roll/mid-roll
    getRandomVastAd: function() {
        return getRandomElements(adInventory.vastAds, 1)[0];
    },
    
    // Get premium ad with frequency control
    getPremiumAd: function(type) {
        const deviceType = getDeviceType();
        
        if (type === 'interstitial') {
            if (deviceType === 'mobile' && !sessionTracker.mobileInterstitialShown) {
                sessionTracker.mobileInterstitialShown = true;
                return adInventory.premiumAds.find(ad => ad.id === 'mobile_interstitial');
            } else if (deviceType !== 'mobile' && !sessionTracker.desktopInterstitialShown) {
                sessionTracker.desktopInterstitialShown = true;
                return adInventory.premiumAds.find(ad => ad.id === 'desktop_interstitial');
            }
        } else if (type === 'exit_popup' && !sessionTracker.exitPopupShown) {
            sessionTracker.exitPopupShown = true;
            return adInventory.premiumAds.find(ad => ad.id === 'exit_popup');
        }
        
        return null;
    },
    
    // Reset session tracker (call on new session)
    resetSessionTracker: function() {
        sessionTracker.desktopInterstitialShown = false;
        sessionTracker.mobileInterstitialShown = false;
        // Note: exitPopupShown is intentionally not reset here - it's controlled by cookies
    },
    
    // Get optimized ad placement strategy
    getAdStrategy: function() {
        const deviceType = getDeviceType();
        
        if (deviceType === 'mobile') {
            return {
                maxBanners: 3, // Don't overload mobile
                placements: [
                    { type: 'rectangle', position: 'top' },
                    { type: 'rectangle', position: 'middle' },
                    { type: 'interstitial', trigger: 'delay', delay: 30000 } // After 30 seconds
                ],
                refreshInterval: 60000 // Refresh ads every 60 seconds
            };
        } else {
            return {
                maxBanners: 4, // Desktop can handle more
                placements: [
                    { type: 'leaderboard', position: 'header' },
                    { type: 'sidebar', position: 'left' },
                    { type: 'rectangle', position: 'content' },
                    { type: 'sticky_banner', position: 'bottom' },
                    { type: 'interstitial', trigger: 'exit' } // On exit intent
                ],
                refreshInterval: 90000 // Refresh ads every 90 seconds
            };
        }
    },
    
    // Get all ads (for debugging or admin panel)
    getAllAds: function() {
        return adInventory;
    }
};