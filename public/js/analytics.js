// Lucahman Google Analytics Setup
(function() {
  'use strict';

   var GA_MEASUREMENT_ID = 'G-PMWBHF9XY6';

  // Load GA4 script
  function loadGA() {
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      'send_page_view': true,
      'cookie_flags': 'SameSite=None;Secure'
    });
  }

  // Track page views
  window.trackPageView = function(url) {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'page_view', {
        page_location: url,
        send_to: GA_MEASUREMENT_ID
      });
    }
  };

  // Track video plays
  window.trackVideoPlay = function(videoId, videoTitle) {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'video_play', {
        content_id: videoId,
        content_title: videoTitle,
        send_to: GA_MEASUREMENT_ID
      });
    }
  };

  // Track searches
  window.trackSearch = function(searchTerm, resultCount) {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'search', {
        search_term: searchTerm,
        result_count: resultCount,
        send_to: GA_MEASUREMENT_ID
      });
    }
  };

  // Track category clicks
  window.trackCategoryClick = function(categoryName) {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'category_click', {
        category: categoryName,
        send_to: GA_MEASUREMENT_ID
      });
    }
  };

  // Load on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGA);
  } else {
    loadGA();
  }

  // Track route changes (for SPAs)
  (function() {
    var lastUrl = location.href;
    new MutationObserver(function() {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.trackPageView(location.href);
      }
    }).observe(document, {subtree: true, childList: true});
  })();
})();
