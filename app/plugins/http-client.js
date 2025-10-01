import fp from 'fastify-plugin'
import { Pool, request } from 'undici'

export default fp(
  (fastify, opts, next) => {
    /**
     * Create connection pool for better performance
     * Optimized for high concurrency package manager requests
     */
    const pool = new Pool(opts.REGISTRY_URL, {
      connections: 512, // Even higher for volume
      pipelining: 50, // Max pipelining for metadata
      keepAliveTimeout: 300000, // 5min keep-alive
      keepAliveMaxTimeout: 900000, // 15min max
      bodyTimeout: 8000, // Faster body timeout
      headersTimeout: 3000, // Faster headers
      connect: {
        timeout: 3000, // Faster connection
        keepAlive: true,
        keepAliveInitialDelay: 500,
      },
      maxCachedSessions: 100, // Cache TLS sessions
    })

    /**
     * Helper function for HTTP requests with pooling
     */
    const httpRequest = async (url, options = {}) => {
      return await request(`${opts.REGISTRY_URL}/${url}`, {
        dispatcher: pool,
        method: 'GET',
        ...options,
      })
    }

    fastify.decorate('httpClient', {
      request: httpRequest,
      pool,
    })

    fastify.addHook('onClose', async () => {
      await pool.close()
    })

    next()
  },
  {
    name: 'http-client',
  },
)
