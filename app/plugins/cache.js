import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import fp from 'fastify-plugin'
import { LRUCache } from 'lru-cache'

export default fp(
  (fastify, opts, next) => {
    /**
     * In-memory LRU cache for metadata when Redis is not available
     * 10k packages max, 1 hour TTL, ~500MB memory usage
     */
    const memoryCache = new LRUCache({
      max: 10000,
      ttl: 60 * 60 * 1000, // 1 hour
      allowStale: true, // Serve stale while updating
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    })

    /**
     * Rewrite tarball URLs to use our proxy
     */
    const rewriteTarballUrls = (data) => {
      if (data.versions) {
        for (const version of Object.values(data.versions)) {
          if (version.dist?.tarball?.startsWith(opts.REGISTRY_URL)) {
            version.dist.tarball = version.dist.tarball.replace(
              opts.REGISTRY_URL,
              opts.PROXY_URL,
            )
          }
        }
      }
      return data
    }

    /**
     * Helper to get cache path for tarballs with 2-char sharding and path traversal protection
     */
    const getTarballCachePath = (packageName, filename) => {
      const shard = packageName.substring(0, 2).toLowerCase()
      const cachePath = path.join(opts.STORAGE_DIR, shard, packageName, filename)

      // Ensure resolved path stays within storage directory
      const resolvedPath = path.resolve(cachePath)
      const resolvedStorageDir = path.resolve(opts.STORAGE_DIR)

      if (!resolvedPath.startsWith(resolvedStorageDir + path.sep)) {
        throw new Error(`Invalid path: ${packageName}/${filename}`)
      }

      return cachePath
    }

    /**
     * Check if cached file is valid (for tarballs)
     */
    const isCacheValid = async (cachePath, maxAge = 24 * 60 * 60 * 1000) => {
      try {
        const stats = await fs.stat(cachePath)
        return Date.now() - stats.mtime.getTime() < maxAge
      }
      catch {
        return false
      }
    }

    /**
     * Cache metadata response with URL rewriting
     * Stores in Redis if available, otherwise in memory
     */
    const cacheMetadata = async (packageName, data) => {
      try {
        // Rewrite tarball URLs before caching
        const rewrittenData = rewriteTarballUrls(data)

        // Cache in Redis if available, otherwise use memory
        if (fastify.redisCache?.isAvailable()) {
          await fastify.redisCache.cacheMetadata(packageName, rewrittenData)
        }
        else {
          // Only use memory cache when Redis is not available
          memoryCache.set(packageName, rewrittenData)
          fastify.log.debug(`Cached metadata in memory only for: ${packageName}`)
        }

        return rewrittenData
      }
      catch (error) {
        fastify.log.warn(`Failed to cache metadata for ${packageName}: ${error.message}`)
        // Return original data if caching fails
        return data
      }
    }

    /**
     * Get cached metadata (Redis first, memory fallback)
     * Returns data object directly instead of stream for better performance
     */
    const getCachedMetadata = async (packageName) => {
      // Try Redis first if available
      if (fastify.redisCache?.isAvailable()) {
        const cached = await fastify.redisCache.getCachedMetadata(packageName)
        if (cached) {
          return cached
        }
      }
      else {
        // Only check memory cache when Redis is not available
        const memoryCached = memoryCache.get(packageName)
        if (memoryCached) {
          fastify.log.debug(`Memory cache HIT for: ${packageName}`)
          return memoryCached
        }
      }

      return null
    }

    /**
     * Get cached tarball as stream (for cache hits)
     */
    const getCachedTarballStream = async (packageName, filename) => {
      const cachePath = getTarballCachePath(packageName, filename)

      // Check if file exists first - tarballs don't expire so no need for time validation
      try {
        await fs.access(cachePath)
        return createReadStream(cachePath)
      }
      catch {
        return null
      }
    }

    /**
     * Initialize cache directories
     */
    const initCache = async () => {
      await fs.mkdir(opts.STORAGE_DIR, { recursive: true })
    }

    fastify.decorate('cacheManager', {
      getTarballCachePath,
      isCacheValid,
      cacheMetadata,
      getCachedMetadata,
      getCachedTarballStream,
      rewriteTarballUrls,
      memoryCache, // Expose for stats/debugging
      clearMemoryCache: () => memoryCache.clear(),
    })

    fastify.ready(async () => {
      await initCache()
    })

    next()
  },
  {
    name: 'cache-manager',
  },
)
