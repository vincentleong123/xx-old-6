const Redis = require('ioredis');

/**
 * Redis-compatible cache layer for TubeStream
 * USE_REDIS_URL=redis://localhost:6379 → Real Redis
 * Otherwise → In-memory with TTL
 */
class TubeStreamRedis {
    constructor() {
        this.isRealRedis = !!process.env.USE_REDIS_URL;
        this.defaultTTL = parseInt(process.env.CACHE_TTL) || 300; // 5min
        
        if (this.isRealRedis) {
            console.log(`🚀 Using REAL Redis: ${process.env.USE_REDIS_URL}`);
            const RedisClass = require('ioredis');
            this.client = new RedisClass(process.env.USE_REDIS_URL, {
                lazyConnect: true,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100
            });
            this.client.on('error', (err) => console.error('Redis error:', err));
        } else {
            console.log('🏠 Using In-Memory Redis (fake)');
            this.cache = new Map();
            this.expireTimes = new Map();
            this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [key, expire] of this.expireTimes) {
            if (expire < now) {
                this.cache.delete(key);
                this.expireTimes.delete(key);
            }
        }
    }

    async get(key) {
        if (this.isRealRedis) {
            return await this.client.get(key);
        }
        const data = this.cache.get(key);
        if (data === undefined) return null;
        const expireTime = this.expireTimes.get(key);
        if (expireTime !== undefined && expireTime < Date.now()) {
            this.del(key);
            return null;
        }
        return data || null;
    }

    async set(key, value, ttl = this.defaultTTL) {
        const expireAt = Date.now() + (ttl * 1000);
        if (this.isRealRedis) {
            if (ttl > 0) {
                await this.client.setex(key, ttl, value);
            } else {
                await this.client.set(key, value);
            }
        } else {
            this.cache.set(key, value);
            this.expireTimes.set(key, expireAt);
        }
    }

    async del(key) {
        if (this.isRealRedis) {
            await this.client.del(key);
        } else {
            this.cache.delete(key);
            this.expireTimes.delete(key);
        }
    }

    async delPrefix(prefix) {
        if (this.isRealRedis) {
            const keys = await this.client.keys(`${prefix}*`);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
        } else {
            const prefixRe = new RegExp(`^${prefix}`);
            for (const key of [...this.cache.keys()]) {
                if (prefixRe.test(key)) {
                    this.del(key);
                }
            }
        }
    }

    async keys(pattern = '*') {
        if (this.isRealRedis) {
            return await this.client.keys(pattern);
        }
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return [...this.cache.keys()].filter(k => regex.test(k));
    }

    quit() {
        if (this.isRealRedis && this.client) {
            this.client.quit();
        } else if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = new TubeStreamRedis();
