import assert from 'node:assert/strict'
import { unlink, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import Fastify from 'fastify'
import YAML from 'yaml'
import blacklistManager from '../../app/plugins/blacklist.js'

// Test utilities for blacklist functionality

// YAML parser test with proper library
test('YAML parser handles basic blacklist config', () => {
  const yamlContent = `packages:
  - name: malicious-package
    reason: Known malware
  - name: lodash
    versions: [4.17.20, 4.17.21]
    reason: Vulnerability

patterns:
  - pattern: ".*malware.*"
    reason: Suspicious name`

  const result = YAML.parse(yamlContent)

  assert.ok(result.packages)
  assert.equal(result.packages[0].name, 'malicious-package')
  assert.equal(result.packages[0].reason, 'Known malware')

  assert.equal(result.packages[1].name, 'lodash')
  assert.deepEqual(result.packages[1].versions, ['4.17.20', '4.17.21'])
  assert.equal(result.packages[1].reason, 'Vulnerability')

  assert.ok(result.patterns)
  assert.equal(result.patterns[0].pattern, '.*malware.*')
  assert.equal(result.patterns[0].reason, 'Suspicious name')
})

test('Blacklist manager plugin methods work correctly', async () => {
  // Create a test blacklist file
  const testBlacklist = `packages:
  - name: malicious-package
    reason: Known malware
  - name: '@evil/package'
    reason: Malicious scoped package
  - name: lodash
    versions: ['4.17.20', '4.17.21']
    reason: Vulnerability

patterns:
  - pattern: ".*-malware.*"
    reason: Suspicious pattern`

  const testBlacklistPath = `./test-blacklist-${Date.now()}.yml`
  await writeFile(testBlacklistPath, testBlacklist)

  try {
    // Create a real Fastify instance and register the plugin with test config
    const fastify = Fastify({ logger: false })
    await fastify.register(blacklistManager, { BLACKLIST_PATH: testBlacklistPath })

    // Test version extraction method
    const { extractVersionFromTarball } = fastify.blacklistManager

    // Standard semver
    assert.equal(extractVersionFromTarball('lodash-4.17.21.tgz'), '4.17.21')
    assert.equal(extractVersionFromTarball('package-1.0.0.tgz'), '1.0.0')

    // Prerelease versions
    assert.equal(extractVersionFromTarball('package-1.0.0-alpha.1.tgz'), '1.0.0-alpha.1')
    assert.equal(extractVersionFromTarball('package-2.0.0-beta.tgz'), '2.0.0-beta')

    // Build metadata (should be cleaned by semver)
    assert.equal(extractVersionFromTarball('package-1.0.0+build.123.tgz'), '1.0.0')

    // Version prefix cleaning (v prefix removed by semver)
    assert.equal(extractVersionFromTarball('package-v1.0.0.tgz'), '1.0.0')

    // Incomplete versions (coerced by semver)
    assert.equal(extractVersionFromTarball('package-1.tgz'), '1.0.0')
    assert.equal(extractVersionFromTarball('package-1.0.tgz'), '1.0.0')

    // Non-semver versions (should return null for invalid semver)
    assert.equal(extractVersionFromTarball('package-2023.01.01.tgz'), null)

    // Edge cases
    assert.equal(extractVersionFromTarball('invalid-filename.tgz'), null)
    assert.equal(extractVersionFromTarball('package.tgz'), null)

    // Test blacklist checking method
    const { isBlacklisted } = fastify.blacklistManager

    // Test package blocking
    const maliciousResult = isBlacklisted('malicious-package')
    assert.equal(maliciousResult.blocked, true)
    assert.equal(maliciousResult.reason, 'Known malware')
    assert.equal(maliciousResult.type, 'package')

    // Test scoped package blocking (now in packages section)
    const scopedResult = isBlacklisted('@evil/package')
    assert.equal(scopedResult.blocked, true)
    assert.equal(scopedResult.reason, 'Malicious scoped package')
    assert.equal(scopedResult.type, 'package')

    // Test version blocking
    const lodashResult = isBlacklisted('lodash', '4.17.20')
    assert.equal(lodashResult.blocked, true)
    assert.equal(lodashResult.reason, 'Vulnerability')
    assert.equal(lodashResult.type, 'version')

    // Test pattern blocking
    const patternResult = isBlacklisted('test-malware-package')
    assert.equal(patternResult.blocked, true)
    assert.equal(patternResult.reason, 'Suspicious pattern')
    assert.equal(patternResult.type, 'pattern')

    // Test allowed packages
    const allowedResult = isBlacklisted('safe-package')
    assert.equal(allowedResult.blocked, false)

    // Test allowed version
    const allowedVersionResult = isBlacklisted('lodash', '4.17.22')
    assert.equal(allowedVersionResult.blocked, false)
  }
  finally {
    await unlink(testBlacklistPath).catch(() => {})
  }
})

test('Blacklist manager supports semver ranges', async () => {
  // Create a test blacklist file with semver ranges
  const testBlacklist = `packages:
  - name: colors
    versions: ['>=1.4.44 <1.4.46']
    reason: DoS vulnerability range
  - name: node-ipc
    versions: ['^9.0.0', '^10.0.0']
    reason: Malicious code in major versions
  - name: mixed-example
    versions: ['1.2.3', '>=2.0.0 <3.0.0', '^4.0.0']
    reason: Mixed exact and range specs

patterns:
  - pattern: ".*-test.*"
    reason: Test pattern`

  const testSemverBlacklistPath = `./test-semver-blacklist-${Date.now()}.yml`
  await writeFile(testSemverBlacklistPath, testBlacklist)

  try {
    // Create a real Fastify instance and register the plugin with test config
    const fastify = Fastify({ logger: false })
    await fastify.register(blacklistManager, { BLACKLIST_PATH: testSemverBlacklistPath })

    const { isBlacklisted } = fastify.blacklistManager

    // Test semver range blocking: >=1.4.44 <1.4.46
    assert.equal(isBlacklisted('colors', '1.4.44').blocked, true)
    assert.equal(isBlacklisted('colors', '1.4.45').blocked, true)
    assert.equal(isBlacklisted('colors', '1.4.46').blocked, false)
    assert.equal(isBlacklisted('colors', '1.4.43').blocked, false)

    // Test caret range blocking: ^9.0.0
    assert.equal(isBlacklisted('node-ipc', '9.0.0').blocked, true)
    assert.equal(isBlacklisted('node-ipc', '9.1.5').blocked, true)
    assert.equal(isBlacklisted('node-ipc', '9.99.99').blocked, true)
    assert.equal(isBlacklisted('node-ipc', '10.0.0').blocked, true)
    assert.equal(isBlacklisted('node-ipc', '8.9.9').blocked, false)
    assert.equal(isBlacklisted('node-ipc', '11.0.0').blocked, false)

    // Test mixed exact and range specs
    assert.equal(isBlacklisted('mixed-example', '1.2.3').blocked, true) // Exact match
    assert.equal(isBlacklisted('mixed-example', '2.0.0').blocked, true) // Range match
    assert.equal(isBlacklisted('mixed-example', '2.5.0').blocked, true) // Range match
    assert.equal(isBlacklisted('mixed-example', '4.0.0').blocked, true) // Caret match
    assert.equal(isBlacklisted('mixed-example', '4.1.0').blocked, true) // Caret match
    assert.equal(isBlacklisted('mixed-example', '1.2.4').blocked, false) // No match
    assert.equal(isBlacklisted('mixed-example', '3.0.0').blocked, false) // No match
    assert.equal(isBlacklisted('mixed-example', '5.0.0').blocked, false) // No match

    // Test reason and version spec are returned
    const result = isBlacklisted('colors', '1.4.44')
    assert.equal(result.blocked, true)
    assert.equal(result.reason, 'DoS vulnerability range')
    assert.equal(result.versionSpec, '>=1.4.44 <1.4.46')
    assert.equal(result.version, '1.4.44')
    assert.equal(result.type, 'version')

    // Test non-semver fallback to exact match
    const nonSemverResult = isBlacklisted('mixed-example', '1.2.3')
    assert.equal(nonSemverResult.blocked, true)
    assert.equal(nonSemverResult.versionSpec, '1.2.3')
  }
  finally {
    await unlink(testSemverBlacklistPath).catch(() => {})
  }
})

test('Version extraction with semver enhancement', async () => {
  // Test enhanced version extraction with semver validation and coercion
  const fastify = Fastify({ logger: false })
  await fastify.register(blacklistManager, { blacklistPath: './nonexistent.yml' })

  const { extractVersionFromTarball } = fastify.blacklistManager

  // Test semver cleaning (removes v prefix and build metadata)
  assert.equal(extractVersionFromTarball('package-v1.2.3.tgz'), '1.2.3')
  assert.equal(extractVersionFromTarball('package-1.0.0+build.123.tgz'), '1.0.0')
  assert.equal(extractVersionFromTarball('package-v2.1.0+meta.data.tgz'), '2.1.0')

  // Test semver coercion (incomplete versions)
  assert.equal(extractVersionFromTarball('package-1.tgz'), '1.0.0')
  assert.equal(extractVersionFromTarball('package-2.5.tgz'), '2.5.0')
  assert.equal(extractVersionFromTarball('package-v3.tgz'), '3.0.0')

  // Test complex semver versions
  assert.equal(extractVersionFromTarball('package-1.0.0-alpha.1.tgz'), '1.0.0-alpha.1')
  assert.equal(extractVersionFromTarball('package-2.0.0-beta.2+exp.sha.123.tgz'), '2.0.0-beta.2')
  assert.equal(extractVersionFromTarball('package-1.0.0-rc.1.tgz'), '1.0.0-rc.1')

  // Test non-semver fallback (should return null for invalid semver)
  assert.equal(extractVersionFromTarball('package-2023.01.01.tgz'), null)

  // Test versions that don't start with digits (should return null)
  assert.equal(extractVersionFromTarball('package-latest.tgz'), null)

  // Test complex version strings (extracts numeric part and coerces)
  assert.equal(extractVersionFromTarball('package-nightly-20231201.tgz'), '20231201.0.0')

  // Test invalid cases
  assert.equal(extractVersionFromTarball('package-not-a-version.tgz'), null)
  assert.equal(extractVersionFromTarball('no-version-separator.tgz'), null)
  assert.equal(extractVersionFromTarball('package.tgz'), null)
})

test('Semver-enhanced version extraction integrates with blacklist matching', async () => {
  // Test that cleaned/coerced versions work correctly with blacklist ranges
  const testBlacklist = `packages:
  - name: test-package
    versions: ['^1.0.0', '>=2.0.0 <3.0.0']
    reason: Test semver integration

patterns:
  - pattern: ".*-test.*"
    reason: Test pattern`

  const testSemverIntegrationPath = `./test-semver-integration-blacklist-${Date.now()}.yml`
  await writeFile(testSemverIntegrationPath, testBlacklist)

  try {
    const fastify = Fastify({ logger: false })
    await fastify.register(blacklistManager, { BLACKLIST_PATH: testSemverIntegrationPath })

    const { isBlacklisted, extractVersionFromTarball } = fastify.blacklistManager

    // Test that v-prefixed versions are cleaned and match ranges correctly
    const versionV1 = extractVersionFromTarball('test-package-v1.2.3.tgz')
    assert.equal(versionV1, '1.2.3') // v prefix removed
    assert.equal(isBlacklisted('test-package', versionV1).blocked, true) // Matches ^1.0.0

    // Test that build metadata is cleaned and matches ranges correctly
    const versionWithBuild = extractVersionFromTarball('test-package-2.1.0+build.123.tgz')
    assert.equal(versionWithBuild, '2.1.0') // Build metadata removed
    assert.equal(isBlacklisted('test-package', versionWithBuild).blocked, true) // Matches >=2.0.0 <3.0.0

    // Test that coerced versions match ranges correctly
    const coercedVersion = extractVersionFromTarball('test-package-1.tgz')
    assert.equal(coercedVersion, '1.0.0') // Coerced from 1
    assert.equal(isBlacklisted('test-package', coercedVersion).blocked, true) // Matches ^1.0.0

    // Test version that should not match
    const unmatchedVersion = extractVersionFromTarball('test-package-4.0.0.tgz')
    assert.equal(unmatchedVersion, '4.0.0')
    assert.equal(isBlacklisted('test-package', unmatchedVersion).blocked, false) // Doesn't match any range
  }
  finally {
    await unlink(testSemverIntegrationPath).catch(() => {})
  }
})
