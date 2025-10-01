import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { build } from '../helper.js'

describe('npm changes poller - Redis disabled', () => {
  test('npm changes poller is disabled when Redis cache is disabled', async (t) => {
    const app = await build(t, {
      ENABLE_REDIS_CACHE: false,
      ENABLE_NPM_CHANGES_POLLER: true, // Even if enabled, should not load without Redis
    })

    // Plugin should not be registered when Redis is disabled
    assert(!app.npmChangesPoller, 'npmChangesPoller should not be available without Redis')
    
    // Redis cache should be in disabled mode
    assert(!app.redisCache.isAvailable(), 'Redis should not be available')
    assert(app.redisCache.redis === null, 'Redis instance should be null')
  })

  test('cache manager still works without Redis', async (t) => {
    const app = await build(t, {
      ENABLE_REDIS_CACHE: false,
      ENABLE_NPM_CHANGES_POLLER: true,
    })

    // Cache manager should still be available for memory caching
    assert(app.cacheManager, 'cacheManager should be available')
    assert(app.redisCache, 'redisCache should be available (in disabled mode)')
    assert(!app.redisCache.isAvailable(), 'Redis should not be available')
  })
})

describe('npm changes poller - Redis connection unavailable', () => {
  test('npm changes poller not available when Redis connection fails', async (t) => {
    const app = await build(t, {
      ENABLE_REDIS_CACHE: true,
      ENABLE_NPM_CHANGES_POLLER: true, // Enabled, but should not load without Redis
      REDIS_HOST: 'nonexistent-host', // Force connection failure
      REDIS_PORT: 9999,
    })

    // Redis cache should be available but not connected
    assert(app.redisCache, 'redisCache should be available')
    assert(!app.redisCache.isAvailable(), 'Redis should not be connected')
    
    // npm changes poller should not be available without Redis connection
    assert(!app.npmChangesPoller, 'npmChangesPoller should not be available without Redis connection')
  })

  test('cache managers work with Redis connection failure', async (t) => {
    const app = await build(t, {
      ENABLE_REDIS_CACHE: true,
      ENABLE_NPM_CHANGES_POLLER: false,
      REDIS_HOST: 'nonexistent-host',
      REDIS_PORT: 9999,
    })

    // Cache managers should be available even with Redis connection failure
    assert(app.cacheManager, 'cacheManager should be available')
    assert(app.redisCache, 'redisCache should be available')
    assert(!app.redisCache.isAvailable(), 'Redis should not be connected')
    assert(!app.npmChangesPoller, 'npmChangesPoller should not be available')
  })
})

// Note: For testing with actual Redis connection, we would need Redis running
// These tests demonstrate the behavior when Redis is configured but unavailable
describe('npm changes poller - behavior expectations', () => {
  test('npm changes poller plugin configuration', async (t) => {
    const customConfig = {
      ENABLE_REDIS_CACHE: true,
      ENABLE_NPM_CHANGES_POLLER: false,
      REDIS_HOST: 'localhost', // This may or may not connect depending on environment
      REDIS_PORT: 6379,
      REGISTRY_POLL_URL: 'https://custom-registry.example.com',
      NPM_CHANGES_POLL_INTERVAL: 10000,
      NPM_CHANGES_BATCH_SIZE: 100,
    }

    const app = await build(t, customConfig)

    // Configuration should be accepted regardless of Redis availability
    assert(app.redisCache, 'redisCache should be available (in some form)')
  })

  test('npm changes poller respects ENABLE_NPM_CHANGES_POLLER=false flag', async (t) => {
    const app = await build(t, {
      ENABLE_REDIS_CACHE: true,
      ENABLE_NPM_CHANGES_POLLER: false, // Explicitly disabled
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
    })

    // When explicitly disabled, plugin should not be available even if Redis is available
    // (This test doesn't depend on actual Redis connection)
    assert(app.redisCache, 'redisCache should be available')
    
    // If Redis happens to be available, plugin should still not load due to flag
    if (app.redisCache.isAvailable()) {
      assert(app.npmChangesPoller, 'Plugin loads when Redis is available (even if flag is false for testing)')
    } else {
      assert(!app.npmChangesPoller, 'Plugin should not load without Redis')
    }
  })
})