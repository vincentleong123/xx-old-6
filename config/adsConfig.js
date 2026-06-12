// Configuration for Traffic Stars and ExoClick ads
// Anti-spammy strategy: Limited, well-placed banners only

const adInventory = {
    // Traffic Stars - Real Banner Ads from Ads.txt
    trafficStars: [
        // 300x250 Mobile Banners
        { 
            id: 'ts_300x250_1', 
            type: 'banner',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="5b3adf992ed04970a5a2ab2c895f87c5" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_2', 
            type: 'banner',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="dedaf1b341d745749dbe497f318daf76" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_3', 
            type: 'banner',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="dd516f90cd3b4a5e8dcc07001ba4b52b" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_4', 
            type: 'banner',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="33a8bd43d7594ff2bddc2869b1c10dd7" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_5', 
            type: 'banner',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="bb997c1f46ce4f57a392d8c0123a2e4a" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        // 728x90 Leaderboards
        { 
            id: 'ts_728x90_1', 
            type: 'header',
            width: 728, 
            height: 90, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="c0eefa39fda047bf9d6358321f25c444" data-ts-width="728" data-ts-height="90" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_728x90_2', 
            type: 'header',
            width: 728, 
            height: 90, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="1c4d6304aa6e45b49bf2071eb84d1ece" data-ts-width="728" data-ts-height="90" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_728x90_3', 
            type: 'header',
            width: 728, 
            height: 90, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="63cf9b761d6e4cf08381cb12180c6cf8" data-ts-width="728" data-ts-height="90" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_728x90_4', 
            type: 'header',
            width: 728, 
            height: 90, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="f7d492fe981b4ccaa20a22e47d3696b1" data-ts-width="728" data-ts-height="90" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_728x90_5', 
            type: 'header',
            width: 728, 
            height: 90, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="71c087d1bdd44bae92317837888f7661" data-ts-width="728" data-ts-height="90" data-ts-extid="{extid}" async defer></script>' 
        },
        // 970x250 Billboard
        { 
            id: 'ts_970x250', 
            type: 'banner',
            width: 970, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="118f008e7d134234a554eb72371f694a" data-ts-width="970" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        // 900x250 Large Banner
        { 
            id: 'ts_900x250_1', 
            type: 'banner',
            width: 900, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="2496c2e3c5c94a46bd913f7849ea4512" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_900x250_2', 
            type: 'banner',
            width: 900, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="b26d5145d610442ba96f4183849bbe7d" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_900x250_3', 
            type: 'banner',
            width: 900, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="d0e4e41295754999b4b9401bde7cd25c" data-ts-width="900" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        // 468x60 Small Banner
        { 
            id: 'ts_468x60', 
            type: 'footer',
            width: 468, 
            height: 60, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="e954740b4c4f4451a8e42851ded6df7d" data-ts-width="468" data-ts-height="60" data-ts-extid="{extid}" async defer></script>' 
        },
        // 300x100 Small Rectangle
        { 
            id: 'ts_300x100_1', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="614b829b3a8d4d2f9bf5f641f4024c22" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x100_2', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="3c75dbb3e72b408985d62c9bf326348a" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x100_3', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="9260423ef40045fba4d49b6daee386c3" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x100_4', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="0d35874dbdd945afb6a067be8aa1602a" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x100_5', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="bd866f1edbf44b11a37d06adbbf389f2" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x100_6', 
            type: 'sidebar',
            width: 300, 
            height: 100, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="d5f96b94261446abb7ad43ac2219fe05" data-ts-width="300" data-ts-height="100" data-ts-extid="{extid}" async defer></script>' 
        },
        // 300x250 Sidebar
        { 
            id: 'ts_300x250_sidebar_1', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="9b05c231df684d5e93b4e8b79f7b6798" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_2', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="a78fbbc69b684ff8820c4a17093a75ec" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_3', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="1b274a46be4a46a89a38e74dc024302e" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_4', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="fbef373f57384acfb51828f6e293f5b1" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_5', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="417dfeea77da4f378377f6bd3e8586d9" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_6', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="fe3453a806f044f0acdb3b004aac95e3" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        },
        { 
            id: 'ts_300x250_sidebar_7', 
            type: 'sidebar',
            width: 300, 
            height: 250, 
            script: '<script type="text/javascript" src="//cdn.tsyndicate.com/sdk/v1/bi.js" data-ts-spot="1219f03f543043639bd262cada059a9c" data-ts-width="300" data-ts-height="250" data-ts-extid="{extid}" async defer></script>' 
        }
    ],

    
    // ExoClick - Real Banner Ads from Ads.txt
    exoClick: [
        // Sidebar Skyscraper
        { 
            id: 'exo_skyscraper', 
            type: 'sidebar',
            format: 'skyscraper',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5691342"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // 250x300 Banners
        { 
            id: 'exo_250x300_1', 
            type: 'sidebar',
            format: '250x300',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796582"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_250x300_2', 
            type: 'sidebar',
            format: '250x300',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796584"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Various Banners
        { 
            id: 'exo_banner_5696732', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5696732"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796588', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796588"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796590', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796590"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796592', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796592"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796598', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796598"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796600', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796600"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796602', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796602"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796604', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796604"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796606', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796606"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796596', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796596"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5796594', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5796594"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5669034', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5669034"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5669036', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e10" data-zoneid="5669036"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5669038', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e2" data-zoneid="5669038"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        { 
            id: 'exo_banner_5691338', 
            type: 'banner',
            format: 'banner',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e38" data-zoneid="5691338"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Sticky Footer
        { 
            id: 'exo_sticky_footer', 
            type: 'footer',
            format: 'sticky',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e17" data-zoneid="5794624"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // IM Banner
        { 
            id: 'exo_im_banner', 
            type: 'popup',
            format: 'instant-message',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e6" data-zoneid="5794622"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Multi Format
        { 
            id: 'exo_multi_5794642', 
            type: 'banner',
            format: 'multi',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e38" data-zoneid="5794642"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Desktop Interstitial
        { 
            id: 'exo_interstitial_desktop', 
            type: 'popup',
            format: 'interstitial',
            script: '<script async type="application/javascript" src="https://a.pemsrv.com/ad-provider.js"></script><ins class="eas6a97888e35" data-zoneid="5794626"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Mobile Interstitial
        { 
            id: 'exo_interstitial_mobile', 
            type: 'popup',
            format: 'interstitial',
            script: '<script async type="application/javascript" src="https://a.pemsrv.com/ad-provider.js"></script><ins class="eas6a97888e33" data-zoneid="5794630"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // IM Mobile
        { 
            id: 'exo_im_mobile', 
            type: 'popup',
            format: 'instant-message',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e14" data-zoneid="5794628"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // VAST Slider
        { 
            id: 'exo_vast_slider', 
            type: 'video',
            format: 'vast',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e31" data-zoneid="5794632"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        },
        // Outstream Video
        { 
            id: 'exo_outstream', 
            type: 'video',
            format: 'outstream',
            script: '<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script><ins class="eas6a97888e37" data-zoneid="5794640"></ins><script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>' 
        }
    ],

    
    // VAST Ads for video pre-roll (disabled by default - too spammy)
    vastAds: [
        { 
            id: 'vast_1', 
            url: 'https://s.magsrv.com/v1/vast.php?idzone=5794636',
            enabled: false 
        },
        { 
            id: 'vast_2', 
            url: 'https://tsyndicate.com/do2/3cbf378b0c824a4b9182f258ca050783/vast?extid={extid}',
            enabled: false 
        }
    ],
    
    // Native Ads - Traffic Stars
    nativeAds: [
        {
            id: 'ts_native_labelunder',
            type: 'native',
            format: 'native',
            script: '<div id="ts_ad_native_956a5"></div><script src="//cdn.tsyndicate.com/sdk/v1/n.js"></script><script>NativeAd({element_id: "ts_ad_native_956a5",spot: "c93162e2d0914e2faa31da83b667f161",type: "label-under",cols: 4,rows: 1,title: "Suggested for you",titlePosition: "left",adsByPosition: "right",breakpoints: [{ "cols": 2, "width": 770 }],extid: "{extid}"});</script>'
        },
        {
            id: 'ts_native_labelover',
            type: 'native',
            format: 'native',
            script: '<div id="ts_ad_native_ifz1k"></div><script src="//cdn.tsyndicate.com/sdk/v1/n.js"></script><script>NativeAd({element_id: "ts_ad_native_ifz1k",spot: "9c5809b716564d1a91fa888f34334ce9",type: "label-over",cols: 1,rows: 1,title: "",titlePosition: "left",adsByPosition: "bottom-right",breakpoints: [{ "cols": 1, "width": 770 }],extid: "{extid}",showLogoInfo: true,styles: {"image": { "padding-bottom": "229px" },"container": { "width": "300px", "height": "250px", "overflow": "hidden" }}});</script>'
        },
        {
            id: 'ts_native_gvh8d',
            type: 'native',
            format: 'native',
            script: '<div id="ts_ad_native_gvh8d"></div><script src="//cdn.tsyndicate.com/sdk/v1/n.js"></script><script>NativeAd({element_id: "ts_ad_native_gvh8d",spot: "7cd92628c8a848f0b85f833b21649e7e",type: "label-under",cols: 4,rows: 1,title: "Suggested for you",titlePosition: "left",adsByPosition: "right",breakpoints: [{ "cols": 2, "width": 770 }],extid: "{extid}",styles: {"image": { "padding-bottom": "100px" },"label": { "font-family": "Arial, Helvetica, sans-serif" },"thumb": { "width": "100px" },"headlineLink": { "font-size": "1px" },"brandnameLink": { "font-size": "1px" }}});</script>'
        }
    ]

};

// Helper function to get random elements from an array
function getRandomElements(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Filter ads by type
function getAdsByType(type) {
    const allAds = [
        ...adInventory.trafficStars,
        ...adInventory.exoClick,
        ...adInventory.nativeAds
    ];
    return allAds.filter(ad => ad.type === type || (!ad.type && type === 'banner'));
}


module.exports = {
    // Get random ads for a specific format/placement
    getRandomAds: function(type, count = 1) {
        let pool = [];
        
        switch(type) {
            case 'sidebar':
                // Sidebar ads: mix of skyscraper and sidebar banners
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.type === 'sidebar' || ad.width === 300),
                    ...adInventory.exoClick.filter(ad => ad.type === 'sidebar'),
                    ...adInventory.nativeAds.filter(ad => ad.type === 'sidebar')
                ];
                break;
                
            case 'banner':
                // Banner ads: leaderboard, footer, header banners
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.type === 'banner' || ad.width === 728),
                    ...adInventory.exoClick.filter(ad => ad.type === 'banner'),
                    ...adInventory.nativeAds.filter(ad => ad.type === 'banner' || ad.type === 'header' || ad.type === 'footer')
                ];
                break;
                
            case 'header':
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.type === 'header' || (ad.type === 'banner' && ad.width === 728)),
                    ...adInventory.nativeAds.filter(ad => ad.type === 'header')
                ];
                break;
                
            case 'footer':
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.id.includes('footer') || ad.type === 'footer'),
                    ...adInventory.nativeAds.filter(ad => ad.type === 'footer')
                ];
                break;
                
            case 'belowPlayer':
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.type === 'belowPlayer'),
                    ...adInventory.exoClick.slice(0, 2)
                ];
                break;
                
            case 'native':
                // Native ads for content integration
                pool = [
                    ...adInventory.trafficStars.filter(ad => ad.type === 'native'),
                    ...adInventory.exoClick.filter(ad => ad.type === 'native'),
                    ...adInventory.nativeAds
                ];
                break;
                
            default:
                pool = [...adInventory.trafficStars, ...adInventory.exoClick, ...adInventory.nativeAds];

        }
        
        // Remove duplicates by ID
        const uniquePool = pool.filter((ad, index, self) => 
            index === self.findIndex(a => a.id === ad.id)
        );
        
        return getRandomElements(uniquePool, count);
    },
    
    // Get a random VAST ad for video pre-roll (disabled by default)
    getRandomVastAd: function() {
        const enabledVast = adInventory.vastAds.filter(ad => ad.enabled);
        if (enabledVast.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * enabledVast.length);
        return enabledVast[randomIndex];
    },
    
    // Get all ads (for debugging or admin panel)
    getAllAds: function() {
        return adInventory;
    },
    
    // Get ad statistics
    getAdStats: function() {
        return {
            trafficStars: adInventory.trafficStars.length,
            exoClick: adInventory.exoClick.length,
            nativeAds: adInventory.nativeAds.length,
            vastAds: adInventory.vastAds.length,
            total: adInventory.trafficStars.length + adInventory.exoClick.length + 
                   adInventory.nativeAds.length + adInventory.vastAds.length
        };
    }

};

module.exports = adInventory;
