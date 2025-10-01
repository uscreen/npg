import process from 'node:process'
import fp from 'fastify-plugin'
import { fetch } from 'undici'

export default fp(
  async (fastify, opts) => {
    // Only run if Redis is available
    if (!fastify.redisCache?.isAvailable()) {
      fastify.log.info('Redis not available, npm changes poller disabled')
      return
    }

    const REGISTRY_URL = opts.REGISTRY_POLL_URL || 'https://replicate.npmjs.com/registry'
    const SEQUENCE_KEY = 'npm:last_sequence'
    const POLL_INTERVAL = opts.NPM_CHANGES_POLL_INTERVAL || 5000
    const BATCH_SIZE = opts.NPM_CHANGES_BATCH_SIZE || 500

    let since = 0
    let isRunning = false
    let intervalId = null

    async function getCurrentSequence() {
      try {
        // Get the most recent sequence by fetching the latest change
        const response = await fetch(`${REGISTRY_URL}/_changes?limit=1&descending=true`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        
        // Get the sequence from the most recent change
        const latestSeq = data.results?.[0]?.seq
        if (typeof latestSeq === 'number' && latestSeq > 0) {
          fastify.log.info(`Starting from newest sequence: ${latestSeq}`)
          return latestSeq
        }
        
        throw new Error('No valid sequence found in latest change')
      }
      catch (error) {
        fastify.log.error(`Could not get current sequence: ${error.message}`)
        throw error
      }
    }

    async function loadSequence() {
      // Always get the current latest sequence first
      const latestSeq = await getCurrentSequence()
      
      try {
        const cached = await fastify.redisCache.redis.get(SEQUENCE_KEY)
        if (cached) {
          const cachedSeq = Number.parseInt(cached, 10) || 0
          
          // Only use cached sequence if it's reasonably recent (within 1 hour of latest)
          const timeDiff = latestSeq - cachedSeq
          const maxDiff = 100000 // Adjust based on npm change frequency
          
          if (cachedSeq > 0 && timeDiff < maxDiff) {
            since = cachedSeq
            fastify.log.info(`Resuming from cached sequence: ${since} (latest: ${latestSeq})`)
            return
          } else {
            fastify.log.info(`Cached sequence ${cachedSeq} too old, starting from latest: ${latestSeq}`)
          }
        }
      }
      catch (error) {
        fastify.log.warn(`Failed to load sequence: ${error.message}`)
      }

      // Start from the newest sequence
      since = latestSeq
      fastify.log.info(`Starting from newest sequence: ${since}`)
      await saveSequence()
    }

    async function saveSequence() {
      try {
        await fastify.redisCache.redis.set(SEQUENCE_KEY, since.toString())
      }
      catch (error) {
        fastify.log.error(`Failed to save sequence: ${error.message}`)
      }
    }

    async function invalidatePackage(packageName) {
      // Invalidate Redis cache if available, otherwise memory cache
      if (fastify.redisCache?.isAvailable()) {
        await fastify.redisCache.invalidatePackage(packageName)
      }
      else {
        fastify.cacheManager?.memoryCache?.delete(packageName)
      }
    }

    async function poll() {
      if (isRunning)
        return
      isRunning = true

      try {
        const response = await fetch(`${REGISTRY_URL}/_changes?since=${since}&limit=${BATCH_SIZE}`)
        if (!response.ok)
          throw new Error(`HTTP ${response.status}`)

        const data = await response.json()
        if (!data.results?.length)
          return

        fastify.log.info(`Processing ${data.results.length} changes...`)

        for (const change of data.results) {
          const action = change.deleted ? 'DELETE' : 'UPDATE'
          fastify.log.info(`[${action}] ${change.id} (seq: ${change.seq})`)

          await invalidatePackage(change.id)
          since = Math.max(since, change.seq)
        }

        await saveSequence()
      }
      catch (error) {
        fastify.log.error(`Poll error: ${error.message}`)
      }
      finally {
        isRunning = false
      }
    }

    async function start() {
      await loadSequence()
      fastify.log.info(`Starting npm changes poller (interval: ${POLL_INTERVAL}ms)`)

      await poll() // Initial poll
      intervalId = setInterval(poll, POLL_INTERVAL)
    }

    function stop() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    // Auto-start if enabled
    fastify.ready(async () => {
      if (opts.ENABLE_NPM_CHANGES_POLLER !== false) {
        await start()
      }
    })

    fastify.addHook('onClose', () => {
      stop()
      // await saveSequence()
    })

    fastify.decorate('npmChangesPoller', { start, stop, poll })
  },
  {
    name: 'npm-changes-poller',
    dependencies: ['redis-cache-manager'],
  },
)
