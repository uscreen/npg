import fp from 'fastify-plugin'
import Redis from 'ioredis'

export default fp(
  async (fastify, opts) => {
    // Skip Redis entirely if explicitly disabled
    if (opts.ENABLE_REDIS_CACHE === false) {
      fastify.log.info('Redis cache disabled, using filesystem cache only')
      fastify.decorate('redisCache', {
        getCachedMetadata: async () => null,
        cacheMetadata: async (packageName, data) => data,
        hasMetadataCache: async () => false,
        batchGetMetadata: async () => ({}),
        clearPackageCache: async () => false,
        invalidatePackage: async () => false,
        getCacheStats: async () => ({ available: false, reason: 'disabled' }),
        isAvailable: () => false,
        redis: null,
      })
      return
    }
    /**
     * Create Redis/DragonflyDB connection
     */
    const redis = new Redis({
      host: opts.REDIS_HOST || 'localhost',
      port: opts.REDIS_PORT || 6379,
      password: opts.REDIS_PASSWORD || undefined,
      db: opts.REDIS_DB || 0,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      // Optimized for high-performance caching
      // keyPrefix: '{npg}',
      connectTimeout: 5000,
      // Disable auto-retry to fail fast when Redis unavailable
      retryDelayOnClusterDown: 300,
      retryDelayOnFailover: 300,
      enableOfflineQueue: false,
      // Silence unhandled error events
      silentError: true,
    })

    // Handle Redis connection errors gracefully
    redis.on('error', (error) => {
      fastify.log.debug(`Redis error (falling back to filesystem): ${error.message}`)
    })

    redis.on('connect', () => {
      fastify.log.info(`Connected to Redis at ${opts.REDIS_HOST || 'localhost'}:${opts.REDIS_PORT || 6379}`)
    })

    redis.on('close', () => {
      fastify.log.debug('Redis connection closed')
    })

    /**
     * Connect to Redis with error handling
     */
    try {
      await redis.connect()
    }
    catch (error) {
      fastify.log.info(`Redis not available: ${error.message}, using filesystem cache only`)
    }

    /**
     * Check if Redis is available
     */
    const isRedisAvailable = () => {
      return redis.status === 'ready'
    }

    /**
     * Generate cache key for package metadata
     */
    const getMetadataCacheKey = (packageName) => {
      return `meta:${packageName}`
    }

    /**
     * Get cached metadata from Redis
     */
    const getCachedMetadata = async (packageName) => {
      if (!isRedisAvailable()) {
        return null
      }

      try {
        const cacheKey = getMetadataCacheKey(packageName)
        const cached = await redis.get(cacheKey)

        if (cached) {
          fastify.log.debug(`Redis cache HIT for: ${packageName}`)
          return JSON.parse(cached)
        }

        fastify.log.debug(`Redis cache MISS for: ${packageName}`)
        return null
      }
      catch (error) {
        fastify.log.warn(`Redis get error for ${packageName}: ${error.message}`)
        return null
      }
    }

    /**
     * Cache metadata in Redis with TTL
     */
    const cacheMetadata = async (packageName, data, ttlSeconds = 24 * 60 * 60) => {
      if (!isRedisAvailable()) {
        return data
      }

      try {
        const cacheKey = getMetadataCacheKey(packageName)
        const serialized = JSON.stringify(data)

        // Set with TTL (24 hours default)
        await redis.setex(cacheKey, ttlSeconds, serialized)
        fastify.log.debug(`Cached metadata for: ${packageName} (TTL: ${ttlSeconds}s)`)
      }
      catch (error) {
        fastify.log.warn(`Redis cache error for ${packageName}: ${error.message}`)
      }

      return data
    }

    /**
     * Check if package metadata exists in cache
     */
    const hasMetadataCache = async (packageName) => {
      if (!isRedisAvailable()) {
        return false
      }

      try {
        const cacheKey = getMetadataCacheKey(packageName)
        const exists = await redis.exists(cacheKey)
        return exists === 1
      }
      catch (error) {
        fastify.log.warn(`Redis exists check error for ${packageName}: ${error.message}`)
        return false
      }
    }

    /**
     * Batch get multiple metadata entries
     */
    const batchGetMetadata = async (packageNames) => {
      if (!isRedisAvailable() || packageNames.length === 0) {
        return {}
      }

      try {
        const keys = packageNames.map(name => getMetadataCacheKey(name))
        const values = await redis.mget(...keys)

        const result = {}
        packageNames.forEach((packageName, index) => {
          if (values[index]) {
            try {
              result[packageName] = JSON.parse(values[index])
            }
            catch (error) {
              fastify.log.warn(`Failed to parse cached data for ${packageName}: ${error.message}`)
            }
          }
        })

        return result
      }
      catch (error) {
        fastify.log.warn(`Redis batch get error: ${error.message}`)
        return {}
      }
    }

    /**
     * Clear cache for a specific package
     */
    const clearPackageCache = async (packageName) => {
      if (!isRedisAvailable()) {
        return false
      }

      try {
        const cacheKey = getMetadataCacheKey(packageName)
        const deleted = await redis.del(cacheKey)
        return deleted > 0
      }
      catch (error) {
        fastify.log.warn(`Redis delete error for ${packageName}: ${error.message}`)
        return false
      }
    }

    /**
     * Get cache statistics
     */
    const getCacheStats = async () => {
      if (!isRedisAvailable()) {
        return { available: false }
      }

      try {
        const info = await redis.info('memory')
        const keyspace = await redis.info('keyspace')

        return {
          available: true,
          connection: redis.status,
          memory: info,
          keyspace,
        }
      }
      catch (error) {
        return {
          available: false,
          error: error.message,
        }
      }
    }

    fastify.decorate('redisCache', {
      getCachedMetadata,
      cacheMetadata,
      hasMetadataCache,
      batchGetMetadata,
      clearPackageCache,
      invalidatePackage: clearPackageCache, // Alias for consistency
      getCacheStats,
      isAvailable: isRedisAvailable,
      redis, // Expose redis instance for advanced usage
    })

    // Cleanup on close
    fastify.addHook('onClose', async () => {
      try {
        if (redis.status === 'ready') {
          await redis.quit()
        }
        else if (redis.status !== 'end') {
          redis.disconnect()
        }
      }
      catch (error) {
        // Ignore cleanup errors
        fastify.log.debug(`Redis cleanup error: ${error.message}`)
      }
    })
  },
  {
    name: 'redis-cache-manager',
  },
)
