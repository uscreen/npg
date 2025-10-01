import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, test } from 'node:test'
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import App from '../../app/app.js'
import Config from '../../app/config.js'

let server
const TEST_PACKAGE = '@uscreen.de/fastify-app'
const TEST_PACKAGE_VERSION = '0.4.0' // Known stable version
const TEST_TARBALL = `fastify-app-${TEST_PACKAGE_VERSION}.tgz`

// Custom test storage directory to avoid conflicts
const testStorageDir = path.join(process.cwd(), 'test-storage')
const testBlacklistPath = path.join(process.cwd(), 'test-integration-blacklist.yml')
const testConfig = {
  ...Config,
  STORAGE_DIR: testStorageDir,
  BLACKLIST_PATH: testBlacklistPath,
  LOG_LEVEL: 'silent', // Reduce noise during tests
  ENABLE_REDIS_CACHE: false, // Disable Redis during tests
  ENABLE_NPM_CHANGES_POLLER: false, // Disable background polling during tests
}

before(async () => {
  // Create test blacklist configuration
  const blacklistConfig = `packages:
  - name: malicious-package
    reason: Test blocked package
  - name: lodash
    versions: ['4.17.20']
    reason: Test blocked version
  - name: colors
    versions: ['>=1.4.44 <1.4.46']
    reason: Test semver range

patterns:
  - pattern: ".*-blocked.*"
    reason: Test blocked pattern`

  await fs.writeFile(testBlacklistPath, blacklistConfig)

  // Create server instance
  server = Fastify()
  server.register(fp(App), testConfig)

  // Clean cache before tests
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true })
  }
  catch {
    // Ignore if doesn't exist
  }

  await server.ready()
})

after(async () => {
  await server?.close()

  // Clean up test storage and blacklist
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true })
    await fs.unlink(testBlacklistPath)
  }
  catch {
    // Ignore if doesn't exist
  }
})

test('integration: Scoped package metadata - first request (cache MISS)', async () => {
  // Clear memory cache to ensure this is a MISS
  server.cacheManager.clearMemoryCache()

  // Also clear filesystem cache
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true })
  }
  catch {}

  const response = await server.inject({
    method: 'GET',
    url: `/npm/${TEST_PACKAGE}`,
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(response.headers['x-cache'], 'MISS')

  const data = JSON.parse(response.payload)
  assert.equal(data.name, TEST_PACKAGE)
  assert.ok(data.versions)
  assert.ok(data.versions[TEST_PACKAGE_VERSION])

  // Verify URL rewriting - tarball URLs should point to our proxy
  const version = data.versions[TEST_PACKAGE_VERSION]
  assert.ok(version.dist.tarball.includes('http://127.0.0.1:3000/npm'))
  assert.ok(version.dist.tarball.includes(TEST_TARBALL))
})

// test('integration: Scoped package metadata - second request (cache HIT)', async () => {
//   const response = await server.inject({
//     method: 'GET',
//     url: `/npm/${TEST_PACKAGE}`,
//   })

//   assert.equal(response.statusCode, 200)
//   assert.ok(response.headers['content-type'].includes('application/json'))
//   assert.equal(response.headers['x-cache'], 'HIT')

//   const data = JSON.parse(response.payload)
//   assert.equal(data.name, TEST_PACKAGE)

//   // Verify cached data still has rewritten URLs
//   const version = data.versions[TEST_PACKAGE_VERSION]
//   assert.ok(version.dist.tarball.includes('http://127.0.0.1:3000/npm'))
// })

// test('integration: Cache file exists on disk after metadata request', async () => {
//   // Check that metadata cache file was created
//   const expectedPath = path.join(
//     testStorageDir,
//     '@u', // First 2 chars of @uscreen.de/fastify-app
//     TEST_PACKAGE,
//     'meta.json',
//   )

//   const stats = await fs.stat(expectedPath)
//   assert.ok(stats.isFile())
//   assert.ok(stats.size > 0)

//   // Verify cache file contents
//   const cacheContent = await fs.readFile(expectedPath, 'utf8')
//   const cacheData = JSON.parse(cacheContent)
//   assert.equal(cacheData.name, TEST_PACKAGE)

//   // Verify URLs are rewritten in cache
//   const version = cacheData.versions[TEST_PACKAGE_VERSION]
//   assert.ok(version.dist.tarball.includes('http://127.0.0.1:3000/npm'))
// })

test('integration: Tarball download - first request (cache MISS)', async () => {
  const tarballUrl = `/npm/${TEST_PACKAGE}/-/${TEST_TARBALL}`

  const response = await server.inject({
    method: 'GET',
    url: tarballUrl,
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/octet-stream')
  assert.equal(response.headers['x-cache'], 'MISS')

  // Verify we got binary data
  assert.ok(response.rawPayload.length > 0)

  // Should start with gzip magic bytes (tarballs are gzipped)
  const firstBytes = response.rawPayload.subarray(0, 2)
  assert.equal(firstBytes[0], 0x1F)
  assert.equal(firstBytes[1], 0x8B)
})

test('integration: Tarball download - second request (cache HIT)', async () => {
  const tarballUrl = `/npm/${TEST_PACKAGE}/-/${TEST_TARBALL}`

  const response = await server.inject({
    method: 'GET',
    url: tarballUrl,
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/octet-stream')
  assert.equal(response.headers['x-cache'], 'HIT')

  // Verify we got the same binary data
  assert.ok(response.rawPayload.length > 0)

  // Should start with gzip magic bytes
  const firstBytes = response.rawPayload.subarray(0, 2)
  assert.equal(firstBytes[0], 0x1F)
  assert.equal(firstBytes[1], 0x8B)
})

test('integration: Tarball cache file exists on disk', async () => {
  // Check that tarball cache file was created
  const expectedPath = path.join(
    testStorageDir,
    '@u', // First 2 chars of @uscreen.de/fastify-app
    TEST_PACKAGE,
    TEST_TARBALL,
  )

  const stats = await fs.stat(expectedPath)
  assert.ok(stats.isFile())
  assert.ok(stats.size > 0)

  // Verify it's a valid gzipped tarball
  const buffer = await fs.readFile(expectedPath)
  assert.equal(buffer[0], 0x1F) // gzip magic byte 1
  assert.equal(buffer[1], 0x8B) // gzip magic byte 2
})

test('integration: Regular package (non-scoped) works too', async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/npm/lodash',
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  // Could be HIT or MISS depending on test order
  assert.ok(['HIT', 'MISS'].includes(response.headers['x-cache']))

  const data = JSON.parse(response.payload)
  assert.equal(data.name, 'lodash')
  assert.ok(data.versions)
})

test('integration: 404 for non-existent package', async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/npm/this-package-definitely-does-not-exist-12345',
  })

  assert.equal(response.statusCode, 404)

  const data = JSON.parse(response.payload)
  assert.equal(data.error, 'Package not found')
})

test('integration: Verify cache directory structure', async () => {
  // Should have created sharded directories
  const storageContents = await fs.readdir(testStorageDir)

  // Should contain '@u' shard for @uscreen.de/fastify-app
  assert.ok(storageContents.includes('@u'))

  // Check @uscreen package structure (should only have tarballs, not metadata)
  const usreenDir = path.join(testStorageDir, '@u', TEST_PACKAGE)
  const usreenContents = await fs.readdir(usreenDir)
  
  // Only tarballs should be cached to filesystem now (metadata is memory + Redis only)
  assert.ok(usreenContents.includes(TEST_TARBALL), 'Should cache tarballs to filesystem')
  assert.ok(!usreenContents.includes('meta.json'), 'Should NOT cache metadata to filesystem')
})

// test('integration: Blacklist blocks entire package', async () => {
//   const response = await server.inject({
//     method: 'GET',
//     url: '/npm/malicious-package',
//   })

//   assert.equal(response.statusCode, 403)
//   assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')

//   const data = JSON.parse(response.payload)
//   assert.equal(data.error, 'Package is blacklisted')
//   assert.equal(data.reason, 'Test blocked package')
//   assert.equal(data.package, 'malicious-package')
//   assert.equal(data.type, 'package')
// })

test('integration: Blacklist blocks specific version via tarball', async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/npm/lodash/-/lodash-4.17.20.tgz',
  })

  assert.equal(response.statusCode, 403)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')

  const data = JSON.parse(response.payload)
  assert.equal(data.error, 'Package tarball is blacklisted (Test blocked version)')
  assert.equal(data.reason, 'Test blocked version')
  assert.equal(data.package, 'lodash')
  assert.equal(data.version, '4.17.20')
  assert.equal(data.type, 'version')
})

// test('integration: Blacklist blocks pattern-matched package', async () => {
//   const response = await server.inject({
//     method: 'GET',
//     url: '/npm/test-blocked-package',
//   })

//   assert.equal(response.statusCode, 403)
//   assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')

//   const data = JSON.parse(response.payload)
//   assert.equal(data.error, 'Package is blacklisted')
//   assert.equal(data.reason, 'Test blocked pattern')
//   assert.equal(data.package, 'test-blocked-package')
//   assert.equal(data.type, 'pattern')
// })

test('integration: Blacklist blocks semver range via tarball', async () => {
  const response = await server.inject({
    method: 'GET',
    url: '/npm/colors/-/colors-1.4.45.tgz',
  })

  assert.equal(response.statusCode, 403)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')

  const data = JSON.parse(response.payload)
  assert.equal(data.error, 'Package tarball is blacklisted (Test semver range)')
  assert.equal(data.reason, 'Test semver range')
  assert.equal(data.package, 'colors')
  assert.equal(data.version, '1.4.45')
  assert.equal(data.versionSpec, '>=1.4.44 <1.4.46')
  assert.equal(data.type, 'version')
})
