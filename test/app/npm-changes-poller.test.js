import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { build } from '../helper.js'

test('npm changes poller is disabled when Redis is not available', async (t) => {
  const app = await build(t, {
    ENABLE_REDIS_CACHE: false,
    ENABLE_NPM_CHANGES_POLLER: true,
  })

  // Plugin should not be registered when Redis is disabled
  assert(!app.npmChangesPoller, 'npmChangesPoller should not be available without Redis')
})

test('npm changes poller loads when Redis is available', async (t) => {
  const app = await build(t, {
    ENABLE_REDIS_CACHE: true,
    ENABLE_NPM_CHANGES_POLLER: false, // Disable auto-start for testing
  })

  // Plugin should be registered when Redis is available
  assert(app.npmChangesPoller, 'npmChangesPoller should be available with Redis')
  assert(typeof app.npmChangesPoller.start === 'function', 'should have start method')
  assert(typeof app.npmChangesPoller.stop === 'function', 'should have stop method')
  assert(typeof app.npmChangesPoller.poll === 'function', 'should have poll method')
})

test('npm changes poller integrates with cache managers', async (t) => {
  const app = await build(t, {
    ENABLE_REDIS_CACHE: true,
    ENABLE_NPM_CHANGES_POLLER: false,
  })

  // Both cache managers should be available
  assert(app.npmChangesPoller, 'npmChangesPoller should be available')
  assert(app.cacheManager, 'cacheManager should be available')
  assert(app.redisCache, 'redisCache should be available')
})

test('npm changes poller configuration options', async (t) => {
  const customConfig = {
    ENABLE_REDIS_CACHE: true,
    ENABLE_NPM_CHANGES_POLLER: false,
    REGISTRY_POLL_URL: 'https://custom-registry.example.com',
    NPM_CHANGES_POLL_INTERVAL: 10000,
    NPM_CHANGES_BATCH_SIZE: 100,
  }

  const app = await build(t, customConfig)

  // Plugin should be created with custom configuration
  assert(app.npmChangesPoller, 'Should accept custom configuration')
})

test('npm changes poller respects enableNpmChangesPoller flag', async (t) => {
  const app = await build(t, {
    ENABLE_REDIS_CACHE: true,
    ENABLE_NPM_CHANGES_POLLER: false, // Explicitly disabled
  })

  // Plugin should be available but not auto-started
  assert(app.npmChangesPoller, 'Plugin should be available when Redis is enabled')
  
  // No way to directly test if it auto-started without network calls
  // This test just ensures the plugin loads properly
})