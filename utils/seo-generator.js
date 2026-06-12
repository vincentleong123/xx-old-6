/**
 * SEO Generator for Video Gallery
 * Provides structured data, meta tags, sitemaps, and optimization features
 */

const fs = require('fs');
const path = require('path');

class SEOGenerator {
  constructor(options = {}) {
    this.options = {
      siteName: options.siteName || 'VideoGallery Malaysia',
      siteUrl: options.siteUrl || 'https://xmelayu.site',
      defaultDescription: options.defaultDescription || 'Platform streaming video viral dengan kategorisasi intelligent',
      defaultKeywords: options.defaultKeywords || 'video viral, streaming, HD, kategori, malaysia, intelligent classification',
      socialMedia: {
        facebook: options.facebook || 'https://facebook.com/videogallerymy',
        twitter: options.twitter || 'https://twitter.com/videogallerymy',
        instagram: options.instagram || 'https://instagram.com/videogallerymy'
      },
      analytics: {
        googleAnalytics: options.googleAnalytics || '',
        gtm: options.gtm || ''
      },
      ...options
    };

    this.breadcrumbSchema = this.createBreadcrumbSchema();
  }

  /**
   * Generate structured data (JSON-LD) for different page types
   */
  generateStructuredData(pageType, data = {}) {
    const schemas = {
      // Organization schema for the site
      organization: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": this.options.siteName,
        "description": this.options.defaultDescription,
        "url": this.options.siteUrl,
        "logo": `${this.options.siteUrl}/logo.png`,
        "foundingDate": "2024",
        "address": {
          "@type": "PostalAddress",
          "addressCountry": "MY",
          "addressRegion": "Kuala Lumpur"
        },
        "sameAs": Object.values(this.options.socialMedia),
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+60-3-1234-5678",
          "contactType": "customer service",
          "availableLanguage": ["Malay", "English"]
        }
      },

      // VideoObject schema for individual videos
      video: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": data.title || 'Video Viral Terkini',
        "description": data.description || this.options.defaultDescription,
        "thumbnailUrl": data.thumbnailUrl || `${this.options.siteUrl}/default-thumbnail.jpg`,
        "uploadDate": data.uploadDate || new Date().toISOString(),
        "duration": data.duration || 'PT2M30S',
        "contentUrl": data.contentUrl || `${this.options.siteUrl}/v/${data.filename}`,
        "embedUrl": data.embedUrl || `${this.options.siteUrl}/v/${data.filename}?embed=true`,
        "interactionStatistic": {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/WatchAction",
          "userInteractionCount": data.views || Math.floor(Math.random() * 10000)
        },
        "publisher": {
          "@type": "Organization",
          "name": this.options.siteName,
          "logo": {
            "@type": "ImageObject",
            "url": `${this.options.siteUrl}/logo.png`,
            "width": 200,
            "height": 60
          }
        },
        "potentialAction": {
          "@type": "WatchAction",
          "target": `${this.options.siteUrl}/v/${data.filename}`
        }
      },

      // VideoGallery schema for category/browse pages
      videoGallery: {
        "@context": "https://schema.org",
        "@type": "VideoGallery",
        "name": data.name || 'Video Collection',
        "description": data.description || this.options.defaultDescription,
        "numberOfItems": data.videoCount || 0,
        "url": data.url || this.options.siteUrl,
        "genre": data.categories || ['General'],
        "publisher": {
          "@type": "Organization",
          "name": this.options.siteName
        }
      },

      // BreadcrumbList schema for navigation
      breadcrumb: {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": data.items || []
      },

      // WebSite schema for homepage
      website: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": this.options.siteName,
        "url": this.options.siteUrl,
        "description": this.options.defaultDescription,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${this.options.siteUrl}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },

      // FAQ schema for common questions
      faq: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": data.questions || []
      }
    };

    return schemas[pageType] || {};
  }

  /**
   * Generate comprehensive meta tags
   */
  generateMetaTags(pageType, data = {}) {
    const baseTags = {
      charset: '<meta charset="UTF-8">',
      viewport: '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
      robots: '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
      googlebot: '<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">'
    };

    const specificTags = this.getPageSpecificTags(pageType, data);
    
    return {
      ...baseTags,
      ...specificTags
    };
  }

  /**
   * Get page-specific meta tags
   */
  getPageSpecificTags(pageType, data) {
    const tags = {};

    switch (pageType) {
      case 'homepage':
        tags.title = this.generateTitle('Video Viral Terkini', 'Video Gallery Malaysia');
        tags.description = this.generateDescription(`${this.getVideoCount()} video viral terkini dalam HD quality dengan kategorisasi intelligent`);
        tags.keywords = this.options.defaultKeywords;
        tags.openGraph = this.generateOpenGraph({
          title: 'Video Viral Terkini | Video Gallery Malaysia',
          description: `Tonton ${this.getVideoCount()} video viral terkini dalam HD quality dengan kategorisasi intelligent`,
          url: this.options.siteUrl,
          image: `${this.options.siteUrl}/og-home.jpg`,
          type: 'website'
        });
        tags.twitterCard = this.generateTwitterCard({
          title: 'Video Viral Terkini | Video Gallery Malaysia',
          description: `Tonton ${this.getVideoCount()} video viral terkini dalam HD quality`,
          image: `${this.options.siteUrl}/og-home.jpg`
        });
        break;

      case 'video':
        tags.title = this.generateTitle(data.title || 'Video', data.category || 'Video Gallery');
        tags.description = this.generateDescription(data.description || `${data.title} - Video viral dalam HD quality dengan kategorisasi intelligent`);
        tags.keywords = this.generateKeywords([data.title, data.category, 'video', 'viral', 'HD']);
        tags.openGraph = this.generateOpenGraph({
          title: data.title,
          description: data.description,
          url: `${this.options.siteUrl}/v/${data.filename}`,
          image: data.thumbnailUrl,
          type: 'video.other'
        });
        tags.twitterCard = this.generateTwitterCard({
          title: data.title,
          description: data.description,
          image: data.thumbnailUrl,
          card: 'summary_large_image'
        });
        tags.video = this.generateVideoMeta(data);
        break;

      case 'category':
        tags.title = this.generateTitle(`${data.category} Videos`, 'Video Gallery Malaysia');
        tags.description = this.generateDescription(`Tonton ${data.videoCount} video dalam kategori ${data.category}. HD quality dengan kategorisasi intelligent`);
        tags.keywords = this.generateKeywords([data.category, 'video', 'category', 'viral', 'HD']);
        tags.openGraph = this.generateOpenGraph({
          title: `${data.category} Videos | Video Gallery Malaysia`,
          description: `Tonton ${data.videoCount} video dalam kategori ${data.category}`,
          url: `${this.options.siteUrl}/category/${encodeURIComponent(data.category)}`,
          image: `${this.options.siteUrl}/og-category.jpg`,
          type: 'website'
        });
        break;

      case 'browse':
        tags.title = this.generateTitle('Browse All Videos', 'Video Gallery Malaysia');
        tags.description = this.generateDescription(`Browse semua ${this.getVideoCount()} video dengan kategorisasi AI. HD quality streaming`);
        tags.keywords = this.generateKeywords(['browse', 'all videos', 'streaming', 'HD', 'kategori']);
        tags.openGraph = this.generateOpenGraph({
          title: 'Browse All Videos | Video Gallery Malaysia',
          description: `Browse semua ${this.getVideoCount()} video dengan kategorisasi AI`,
          url: `${this.options.siteUrl}/browse`,
          image: `${this.options.siteUrl}/og-browse.jpg`,
          type: 'website'
        });
        break;

      case 'members':
        tags.title = this.generateTitle('Members Panel', 'Video Gallery Malaysia');
        tags.description = this.generateDescription('Panel khusus untuk members dengan akses exclusive');
        tags.keywords = this.generateKeywords(['members', 'panel', 'exclusive', 'videos']);
        tags.openGraph = this.generateOpenGraph({
          title: 'Members Panel | Video Gallery Malaysia',
          description: 'Panel khusus untuk members dengan akses exclusive',
          url: `${this.options.siteUrl}/members`,
          type: 'website'
        });
        break;
    }

    return tags;
  }

  /**
   * Generate Open Graph meta tags
   */
  generateOpenGraph(data) {
    const ogTags = [];
    
    ogTags.push(`<meta property="og:title" content="${data.title}">`);
    ogTags.push(`<meta property="og:description" content="${data.description}">`);
    ogTags.push(`<meta property="og:url" content="${data.url}">`);
    ogTags.push(`<meta property="og:type" content="${data.type}">`);
    
    if (data.image) {
      ogTags.push(`<meta property="og:image" content="${data.image}">`);
      ogTags.push(`<meta property="og:image:width" content="1200">`);
      ogTags.push(`<meta property="og:image:height" content="630">`);
    }
    
    ogTags.push(`<meta property="og:site_name" content="${this.options.siteName}">`);
    ogTags.push(`<meta property="og:locale" content="en_US">`);
    
    return ogTags.join('\n    ');
  }

  /**
   * Generate Twitter Card meta tags
   */
  generateTwitterCard(data) {
    const cardType = data.card || 'summary';
    const tags = [];
    
    tags.push(`<meta name="twitter:card" content="${cardType}">`);
    tags.push(`<meta name="twitter:title" content="${data.title}">`);
    tags.push(`<meta name="twitter:description" content="${data.description}">`);
    
    if (data.image) {
      tags.push(`<meta name="twitter:image" content="${data.image}">`);
    }
    
    if (this.options.socialMedia.twitter) {
      tags.push(`<meta name="twitter:site" content="@videogallerymy">`);
    }
    
    return tags.join('\n    ');
  }

  /**
   * Generate video-specific meta tags
   */
  generateVideoMeta(data) {
    const tags = [];
    
    tags.push(`<meta property="video:duration" content="${data.duration || 150}">`);
    tags.push(`<meta property="video:release_date" content="${data.uploadDate || new Date().toISOString()}">`);
    tags.push(`<meta property="video:tag" content="${data.category || 'General'}">`);
    
    if (data.views) {
      tags.push(`<meta property="video:view_count" content="${data.views}">`);
    }
    
    return tags.join('\n    ');
  }

  /**
   * Generate title with proper formatting
   */
  generateTitle(primary, secondary = null) {
    if (secondary) {
      return `${primary} | ${secondary}`;
    }
    return primary;
  }

  /**
   * Generate description with proper length
   */
  generateDescription(text, maxLength = 160) {
    if (text.length <= maxLength) {
      return text;
    }
    
    // Truncate at word boundary
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > maxLength * 0.8 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  /**
   * Generate keywords string
   */
  generateKeywords(keywords) {
    const defaultKeywords = this.options.defaultKeywords.split(', ');
    const allKeywords = [...keywords, ...defaultKeywords];
    
    // Remove duplicates and limit to 15 keywords
    const uniqueKeywords = [...new Set(allKeywords)]
      .filter(k => k && k.trim().length > 0)
      .slice(0, 15);
    
    return uniqueKeywords.join(', ');
  }

  /**
   * Generate canonical URL
   */
  generateCanonicalUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.options.siteUrl}${cleanPath}`;
  }

  /**
   * Generate breadcrumb structured data
   */
  createBreadcrumbSchema() {
    return {
      homepage: [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": this.options.siteUrl
        }
      ],
      category: (category) => [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": this.options.siteUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Categories",
          "item": `${this.options.siteUrl}/browse`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": category,
          "item": `${this.options.siteUrl}/category/${encodeURIComponent(category)}`
        }
      ],
      video: (title, category = null) => {
        const breadcrumb = [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": this.options.siteUrl
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Browse",
            "item": `${this.options.siteUrl}/browse`
          }
        ];
        
        if (category) {
          breadcrumb.push({
            "@type": "ListItem",
            "position": 3,
            "name": category,
            "item": `${this.options.siteUrl}/category/${encodeURIComponent(category)}`
          });
          breadcrumb.push({
            "@type": "ListItem",
            "position": 4,
            "name": title,
            "item": `${this.options.siteUrl}/v/${encodeURIComponent(title)}`
          });
        } else {
          breadcrumb.push({
            "@type": "ListItem",
            "position": 3,
            "name": title,
            "item": `${this.options.siteUrl}/v/${encodeURIComponent(title)}`
          });
        }
        
        return breadcrumb;
      }
    };
  }

  /**
   * Generate sitemap XML
   */
  generateSitemap(videos = [], categories = [], options = {}) {
    const baseUrl = this.options.siteUrl;
    const currentDate = new Date().toISOString();
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Main Pages -->
  <url>
    <loc>${baseUrl}/browse</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/members</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;

    // Add category pages
    categories.forEach(category => {
      sitemap += `
  
  <!-- Category: ${category} -->
  <url>
    <loc>${baseUrl}/category/${encodeURIComponent(category)}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Add video pages (limit to prevent huge sitemaps)
    const videoLimit = options.videoLimit || 1000;
    videos.slice(0, videoLimit).forEach((video, index) => {
      const videoPath = `/v/${video.filename}`;
      const thumbnailPath = `/api/thumbnail/${video.filename.replace(/\.[^/.]+$/, '.jpg')}`;
      
      sitemap += `
  
  <!-- Video: ${video.title} -->
  <url>
    <loc>${baseUrl}${videoPath}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
    <video:video>
      <video:thumbnail_loc>${baseUrl}${thumbnailPath}</video:thumbnail_loc>
      <video:title>${this.escapeXml(video.title)}</video:title>
      <video:description>${this.escapeXml(video.description || this.options.defaultDescription)}</video:description>
      <video:content_loc>${baseUrl}${videoPath}?stream=true</video:content_loc>
      <video:duration>${video.duration || 150}</video:duration>
      <video:publication_date>${video.uploadDate || currentDate}</video:publication_date>
      <video:category>${video.category || 'General'}</video:category>
      <video:tag>${video.category || 'General'}</video:tag>
      <video:tag>video</video:tag>
      <video:tag>viral</video:tag>
    </video:video>
  </url>`;
    });

    sitemap += `
</urlset>`;

    return sitemap;
  }

  /**
   * Generate robots.txt
   */
  generateRobotsTxt(options = {}) {
    const baseUrl = this.options.siteUrl;
    
    let robots = `# Robots.txt for ${this.options.siteName}
User-agent: *
Allow: /
Allow: /browse
Allow: /category/
Allow: /v/
Allow: /api/thumbnail/
Allow: /css/
Allow: /js/
Allow: /images/

# Disallow sensitive areas
Disallow: /admin/
Disallow: /api/admin/
Disallow: /temp/
Disallow: /logs/
Disallow: /*.json$
Disallow: /*?*utm_
Disallow: /*?*fbclid=

# Allow search engine bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-videos.xml

# Crawl delay
Crawl-delay: 1`;

    return robots;
  }

  /**
   * Generate FAQ schema
   */
  generateFAQ() {
    const questions = [
      {
        "@type": "Question",
        "name": "Apa itu VideoGallery Malaysia?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "VideoGallery Malaysia adalah platform streaming video viral dengan kategorisasi intelligent dan kualiti HD."
        }
      },
      {
        "@type": "Question",
        "name": "Berapa banyak video yang tersedia?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Kami mempunyai ribuan video viral dalam berbagai kategori yang dikategorikan secara automatik menggunakan AI."
        }
      },
      {
        "@type": "Question",
        "name": "Adakah video dalam format HD?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ya, semua video tersedia dalam kualiti HD dengan streaming yang pantas dan tanpa buffer."
        }
      },
      {
        "@type": "Question",
        "name": "Bagaimana cara mengakses members panel?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Members panel boleh diakses melalui menu utama dengan manfaat exclusive dan akses kepada kandungan tambahan."
        }
      }
    ];

    return this.generateStructuredData('faq', { questions });
  }

  /**
   * Utility methods
   */
  escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '<';
        case '>': return '>';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '"';
        default: return c;
      }
    });
  }

  getVideoCount() {
    // This would typically come from your video database
    // For now, return a placeholder
    return 1000;
  }

  /**
   * Generate resource hints for performance optimization
   */
  generateResourceHints() {
    return `
    <!-- DNS Prefetch -->
    <link rel="dns-prefetch" href="//cdn.fluidplayer.com">
    <link rel="dns-prefetch" href="//cdn.tsyndicate.com">
    <link rel="dns-prefetch" href="//a.magsrv.com">
    
    <!-- Preconnect -->
    <link rel="preconnect" href="https://cdn.fluidplayer.com" crossorigin>
    <link rel="preconnect" href="https://cdn.tsyndicate.com" crossorigin>
    
    <!-- Preload critical resources -->
    <link rel="preload" href="/css/critical.css" as="style">
    <link rel="preload" href="/js/critical.js" as="script">
    
    <!-- Prefetch likely next pages -->
    <link rel="prefetch" href="/browse">
    <link rel="prefetch" href="/members">`;
  }

  /**
   * Generate analytics code
   */
  generateAnalytics() {
    let code = '';
    
    if (this.options.analytics.gtm) {
      code += `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${this.options.analytics.gtm}');</script>
<!-- End Google Tag Manager -->`;
    }
    
    if (this.options.analytics.googleAnalytics) {
      code += `
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${this.options.analytics.googleAnalytics}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${this.options.analytics.googleAnalytics}', {
    page_title: document.title,
    page_location: window.location.href
  });
</script>
<!-- End Google Analytics -->`;
    }
    
    return code;
  }
}

module.exports = SEOGenerator;
