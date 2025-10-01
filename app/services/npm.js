import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import fp from 'fastify-plugin'

export default fp((fastify, opts, next) => {
  /**
   * Helper to extract package name from request params
   */
  const getPackageName = (params) => {
    if (params.scope) {
      return `@${params.scope}/${params.packageName}`
    }
    return params.packageName
  }

  /**
   * Metadata handler for both regular and scoped packages
   */
  const handleMetadata = async (request, reply) => {
    const packageName = getPackageName(request.params)

    /**
     * Check for pattern-based and package-level blacklist first (before making any requests)
     */
    const initialBlacklistResult = fastify.blacklistManager.isBlacklisted(packageName)
    if (initialBlacklistResult.blocked && (initialBlacklistResult.type === 'pattern' || initialBlacklistResult.type === 'package')) {
      fastify.log.warn(`Blocked package: ${packageName} - ${initialBlacklistResult.reason}`)
      return reply.code(403)
        .header('Cache-Control', 'public, max-age=60')
        .send({
          error: `Blocked package: ${packageName} - ${initialBlacklistResult.reason}`,
          reason: initialBlacklistResult.reason,
          package: packageName,
          pattern: initialBlacklistResult.pattern,
          type: initialBlacklistResult.type,
        })
    }

    /**
     * Check for cache first (Redis or filesystem)
     */
    const cachedData = await fastify.cacheManager.getCachedMetadata(packageName)
    if (cachedData) {
      fastify.log.info(`Metadata cache handler HIT for: ${packageName}`)
      return reply.header('X-Cache', 'HIT')
        .header('Cache-Control', 'public, max-age=300')
        .type('application/json')
        .send(cachedData)
    }

    /**
     * Fetch from upstream to get package metadata for version resolution
     */
    try {
      const { statusCode, body } = await fastify.httpClient.request(packageName)

      if (statusCode === 200) {
        const data = await body.json()

        // Get the latest version that would be installed (dist-tags.latest)
        const latestVersion = data['dist-tags']?.latest

        /**
         * Check blacklist with resolved version (for version-specific and malware checks)
         */
        const versionBlacklistResult = fastify.blacklistManager.isBlacklisted(packageName, latestVersion)
        if (versionBlacklistResult.blocked) {
          fastify.log.warn(`Blocked package: ${packageName}@${latestVersion || 'unknown'} - ${versionBlacklistResult.reason}`)
          return reply.code(403)
            .header('Cache-Control', 'public, max-age=60')
            .send({
              error: `Blocked package: ${packageName}@${latestVersion || 'unknown'} - ${versionBlacklistResult.reason}`,
              reason: versionBlacklistResult.reason,
              package: packageName,
              version: latestVersion,
              pattern: versionBlacklistResult.pattern,
              type: versionBlacklistResult.type,
            })
        }

        // Cache async in production, sync in tests
        const rewrittenData = fastify.cacheManager.rewriteTarballUrls(data)
        fastify.cacheManager.cacheMetadata(packageName, rewrittenData).catch(err =>
          fastify.log.warn('Background cache failed:', err.message),
        )

        fastify.log.info(`Metadata cache handler MISS for: ${packageName}`)
        return reply.header('X-Cache', 'MISS')
          .header('Cache-Control', 'public, max-age=300')
          .type('application/json')
          .send(rewrittenData)
      }

      return reply.code(statusCode).send({ error: 'Package not found' })
    }
    catch (error) {
      return reply.code(500).send({ error: 'Proxy error', message: error.message })
    }
  }

  /**
   * Tarball handler for both regular and scoped packages
   */
  const handleTarball = async (request, reply) => {
    const packageName = getPackageName(request.params)
    const { filename } = request.params

    /**
     * Check blacklist first - extract version from filename for version-specific checks
     */
    const version = fastify.blacklistManager.extractVersionFromTarball(filename)
    const blacklistResult = fastify.blacklistManager.isBlacklisted(packageName, version)
    if (blacklistResult.blocked) {
      fastify.log.warn(`Blocked tarball: ${packageName}@${version || 'unknown'} - ${blacklistResult.reason}`)
      return reply.code(403)
        .header('Cache-Control', 'public, max-age=60')
        .send({
          error: `Package tarball is blacklisted (${blacklistResult.reason})`,
          reason: blacklistResult.reason,
          package: packageName,
          version,
          versionSpec: blacklistResult.versionSpec,
          type: blacklistResult.type,
        })
    }

    /**
     * Check for cache first
     */
    const cachedStream = await fastify.cacheManager.getCachedTarballStream(packageName, filename)
    if (cachedStream) {
      fastify.log.info(`Tarball cache handler HIT for: ${packageName}/${filename}`)
      return reply.header('X-Cache', 'HIT')
        .header('Cache-Control', 'public, max-age=3600')
        .type('application/octet-stream')
        .send(cachedStream)
    }

    /**
     * Fetch from upstream if not in cache
     * This will retrieve the metadata from the original npm registry
     * and cache it for future requests
     */
    try {
      const { statusCode, body } = await fastify.httpClient.request(`${packageName}/-/${filename}`)

      if (statusCode === 200) {
        // Ensure cache directory exists
        const cachePath = fastify.cacheManager.getTarballCachePath(packageName, filename)
        await fs.mkdir(path.dirname(cachePath), { recursive: true })

        // Create streams for tee (response + cache)
        const responseStream = new PassThrough()
        const cacheStream = createWriteStream(cachePath)

        // Tee the stream - send to both client and cache
        body.on('data', (chunk) => {
          responseStream.write(chunk)
          cacheStream.write(chunk)
        })

        body.on('end', () => {
          responseStream.end()
          cacheStream.end()
        })

        body.on('error', (err) => {
          responseStream.destroy(err)
          cacheStream.destroy(err)
        })

        fastify.log.info(`Tarball cache handler MISS for: ${packageName}/${filename}`)
        return reply.header('X-Cache', 'MISS')
          .header('Cache-Control', 'public, max-age=3600')
          .type('application/octet-stream')
          .send(responseStream)
      }

      return reply.code(statusCode).send({ error: 'Tarball not found' })
    }
    catch (error) {
      return reply.code(500).send({ error: 'Proxy error', message: error.message })
    }
  }

  /**
   * Register routes using direct handlers
   */
  fastify.get('/npm/:packageName', handleMetadata)
  fastify.get('/npm/@:scope/:packageName', handleMetadata)
  fastify.get('/npm/:packageName/-/:filename', handleTarball)
  fastify.get('/npm/@:scope/:packageName/-/:filename', handleTarball)

  /**
   * Fallback proxy for everything else (audit, search, etc.)
   */
  fastify.register(import('@fastify/http-proxy'), {
    upstream: opts.REGISTRY_URL,
    prefix: '/npm',
    rewritePrefix: '/',
    undici: fastify.httpClient.pool, // Use our optimized connection pool
    http: {
      requestOptions: {
        timeout: 10000, // 10s timeout for audit/search requests
      },
    },
  }, { prefix: false })

  next()
}, { name: 'npm-proxy' })
