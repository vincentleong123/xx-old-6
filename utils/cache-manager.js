/**
 * Advanced Caching System for Video Gallery
 * Provides multi-layer caching with TTL, invalidation, and performance monitoring
 */

const fs = require('fs');
const path = require('path');

class CacheManager {
  constructor(options = {}) {
    this.options = {
      // Memory cache settings
      memoryCacheTTL: options.memoryCacheTTL || 300, // 5 minutes
      memoryCacheMaxSize: options.memoryCacheMaxSize || 1000, // Max items in memory
      
      // Disk cache settings
      diskCacheDir: options.diskCacheDir || path.join(__dirname, '../temp/cache'),
      diskCacheTTL: options.diskCacheTTL || 3600, // 1 hour
      
      // Cache monitoring
      enableMetrics: options.enableMetrics !== false,
      enableLogging: options.enableLogging !== false,
      
      ...options
    };

    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0
    };

    this.initializeDiskCache();
    this.startMonitoring();
  }

  initializeDiskCache() {
    if (!fs.existsSync(this.options.diskCacheDir)) {
      fs.mkdirSync(this.options.diskCacheDir, { recursive: true });
    }
    
    // Cleanup expired cache files on startup
    this.cleanupExpiredCache();
  }

  /**
   * Get value from cache (memory first, then disk)
   */
  get(key, options = {}) {
    const cacheKey = this.normalizeKey(key);
    
    // Try memory cache first
    if (this.memoryCache.has(cacheKey)) {
      const item = this.memoryCache.get(cacheKey);
      
      // Check if item is expired
      if (item.expires && Date.now() > item.expires) {
        this.memoryCache.delete(cacheKey);
        this.cacheStats.misses++;
        return null;
      }
      
      this.cacheStats.hits++;
      if (this.options.enableLogging) {
        console.log(`🟢 Cache HIT: ${key}`);
      }
      return item.value;
    }
    
    // Try disk cache if not found in memory
    const diskValue = this.getFromDisk(cacheKey, options.fallbackTTL);
    if (diskValue !== null) {
      // Promote to memory cache
      this.set(cacheKey, diskValue, { 
        ttl: Math.min(this.options.memoryCacheTTL, diskValue.remainingTTL || 300)
      });
      this.cacheStats.hits++;
      return diskValue.value;
    }
    
    this.cacheStats.misses++;
    if (this.options.enableLogging) {
      console.log(`🔴 Cache MISS: ${key}`);
    }
    return null;
  }

  /**
   * Set value in cache (memory + disk)
   */
  set(key, value, options = {}) {
    const cacheKey = this.normalizeKey(key);
    const ttl = options.ttl || this.options.memoryCacheTTL;
    const expires = Date.now() + (ttl * 1000);
    
    // Memory cache
    const cacheItem = {
      value,
      expires,
      created: Date.now(),
      ttl
    };
    
    // Manage memory cache size
    if (this.memoryCache.size >= this.options.memoryCacheMaxSize) {
      this.evictOldest();
    }
    
    this.memoryCache.set(cacheKey, cacheItem);
    this.cacheStats.sets++;
    this.cacheStats.size = this.memoryCache.size;
    
    // Disk cache
    if (options.persistToDisk !== false) {
      this.saveToDisk(cacheKey, {
        ...cacheItem,
        remainingTTL: ttl
      });
    }
    
    if (this.options.enableLogging) {
      console.log(`💾 Cache SET: ${key} (TTL: ${ttl}s)`);
    }
    
    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key) {
    const cacheKey = this.normalizeKey(key);
    
    // Remove from memory
    const memoryDeleted = this.memoryCache.delete(cacheKey);
    
    // Remove from disk
    const diskDeleted = this.deleteFromDisk(cacheKey);
    
    if (memoryDeleted || diskDeleted) {
      this.cacheStats.deletes++;
      return true;
    }
    
    return false;
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    const cacheKey = this.normalizeKey(key);
    
    // Check memory cache
    if (this.memoryCache.has(cacheKey)) {
      const item = this.memoryCache.get(cacheKey);
      if (item.expires && Date.now() > item.expires) {
        this.memoryCache.delete(cacheKey);
        return false;
      }
      return true;
    }
    
    // Check disk cache
    return this.existsOnDisk(cacheKey);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.memoryCache.clear();
    this.clearDiskCache();
    
    if (this.options.enableLogging) {
      console.log('🗑️ Cache cleared');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memoryUsage = process.memoryUsage();
    
    return {
      memory: {
        items: this.memoryCache.size,
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses || 1),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
      },
      disk: this.getDiskCacheStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Preload cache with multiple keys
   */
  preload(keys, loader, options = {}) {
    const results = {};
    const promises = keys.map(async (key) => {
      try {
        let value = this.get(key);
        if (value === null) {
          value = await loader(key);
          if (value !== null && value !== undefined) {
            this.set(key, value, options);
          }
        }
        results[key] = value;
      } catch (error) {
        console.error(`Cache preload error for ${key}:`, error);
        results[key] = null;
      }
    });
    
    return Promise.all(promises).then(() => results);
  }

  /**
   * Cache wrapper for async functions
   */
  async wrap(key, loader, options = {}) {
    let value = this.get(key);
    
    if (value === null) {
      value = await loader();
      if (value !== null && value !== undefined) {
        this.set(key, value, options);
      }
    }
    
    return value;
  }

  // Private methods
  normalizeKey(key) {
    return key.toString().replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.created < oldestTime) {
        oldestTime = item.created;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }

  // Disk cache methods
  getDiskCacheStats() {
    try {
      const files = fs.readdirSync(this.options.diskCacheDir);
      return {
        files: files.length,
        size: files.length * 1024 // Approximate
      };
    } catch (error) {
      return { files: 0, size: 0 };
    }
  }

  getCacheFilePath(key) {
    return path.join(this.options.diskCacheDir, `${key}.cache`);
  }

  getFromDisk(key, fallbackTTL = 300) {
    try {
      const filePath = this.getCacheFilePath(key);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = fs.readFileSync(filePath, 'utf8');
      const cacheItem = JSON.parse(data);
      
      if (Date.now() > cacheItem.expires) {
        fs.unlinkSync(filePath);
        return null;
      }
      
      return cacheItem;
    } catch (error) {
      return null;
    }
  }

  saveToDisk(key, cacheItem) {
    try {
      const filePath = this.getCacheFilePath(key);
      fs.writeFileSync(filePath, JSON.stringify(cacheItem), 'utf8');
    } catch (error) {
      console.warn(`Failed to save cache to disk for ${key}:`, error.message);
    }
  }

  deleteFromDisk(key) {
    try {
      const filePath = this.getCacheFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  existsOnDisk(key) {
    const filePath = this.getCacheFilePath(key);
    return fs.existsSync(filePath);
  }

  clearDiskCache() {
    try {
      const files = fs.readdirSync(this.options.diskCacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.options.diskCacheDir, file));
      });
    } catch (error) {
      console.warn('Failed to clear disk cache:', error.message);
    }
  }

  cleanupExpiredCache() {
    try {
      const files = fs.readdirSync(this.options.diskCacheDir);
      let cleaned = 0;
      
      files.forEach(file => {
        const filePath = path.join(this.options.diskCacheDir, file);
        try {
          const data = fs.readFileSync(filePath, 'utf8');
          const cacheItem = JSON.parse(data);
          
          if (Date.now() > cacheItem.expires) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        } catch (error) {
          // Invalid cache file, delete it
          fs.unlinkSync(filePath);
          cleaned++;
        }
      });
      
      if (cleaned > 0 && this.options.enableLogging) {
        console.log(`🧹 Cleaned ${cleaned} expired cache files`);
      }
    } catch (error) {
      console.warn('Cache cleanup failed:', error.message);
    }
  }

  // Monitoring and health checks
  startMonitoring() {
    // Clean expired cache every 5 minutes
    setInterval(() => {
      this.cleanupExpiredCache();
      
      // Log cache statistics if enabled
      if (this.options.enableMetrics) {
        const stats = this.getStats();
        console.log('📊 Cache Stats:', {
          hitRate: `${(stats.memory.hitRate * 100).toFixed(1)}%`,
          memoryItems: stats.memory.items,
          memoryUsed: `${stats.memory.heapUsed}MB`
        });
      }
    }, 5 * 60 * 1000);
  }

  // Health check
  healthCheck() {
    const stats = this.getStats();
    return {
      status: 'healthy',
      memory: {
        available: true,
        items: stats.memory.items,
        hitRate: stats.memory.hitRate
      },
      disk: {
        available: fs.existsSync(this.options.diskCacheDir),
        files: stats.disk.files
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Specialized cache classes for different data types
class VideoCacheManager extends CacheManager {
  constructor(options = {}) {
    super({
      memoryCacheTTL: 600, // 10 minutes for videos
      diskCacheTTL: 3600, // 1 hour on disk
      ...options
    });
  }

  // Cache video list with category grouping
  async getVideoList(forceRefresh = false) {
    const key = 'video_list';
    
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) return cached;
    }
    
    // This would typically load from your video source
    // For now, return a placeholder
    return {
      videos: [],
      categories: {},
      lastUpdated: Date.now()
    };
  }

  // Cache thumbnail paths
  getThumbnailPath(videoFile, customTTL = 1800) { // 30 minutes default
    const key = `thumb_${videoFile}`;
    return this.wrap(key, () => {
      // Your thumbnail path logic here
      return `/api/thumbnail/${videoFile}`;
    }, { ttl: customTTL });
  }
}

class HTMLCacheManager extends CacheManager {
  constructor(options = {}) {
    super({
      memoryCacheTTL: 3600, // 1 hour for HTML
      diskCacheTTL: 3600, // 1 hour on disk
      ...options
    });
  }

  // Cache rendered HTML pages
  async getPageHTML(pagePath, userAgent = '', forceRefresh = false) {
    const key = `html_${pagePath}_${userAgent.includes('mobile') ? 'mobile' : 'desktop'}`;
    
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) return cached;
    }
    
    return null; // Will be filled by page generator
  }

  // Invalidate all HTML cache (useful for content updates)
  invalidateHTMLCache() {
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith('html_')) {
        this.delete(key);
      }
    }
  }
}

module.exports = {
  CacheManager,
  VideoCacheManager,
  HTMLCacheManager
};
