import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import fp from 'fastify-plugin'
import semver from 'semver'
import YAML from 'yaml'

export default fp(
  async (fastify, opts) => {
    let blacklistConfig = {}
    const configPath = opts.BLACKLIST_PATH || path.join(process.cwd(), 'blacklist.yml')

    /**
     * Load blacklist configuration once at startup
     */
    const loadBlacklist = async () => {
      try {
        const content = await fs.readFile(configPath, 'utf8')
        blacklistConfig = YAML.parse(content)
        fastify.log.info('Blacklist configuration loaded')
      }
      catch (error) {
        if (error.code === 'ENOENT') {
          fastify.log.info('No blacklist.yml found, blacklist disabled')
          blacklistConfig = {}
        }
        else {
          fastify.log.error('Failed to load blacklist configuration:', error.message)
          throw error
        }
      }
    }

    /**
     * Check if a package or its version is blacklisted
     */
    const isBlacklisted = (packageName, version = null) => {
      // First check malware database if available
      if (fastify.malwareDatabaseManager) {
        const malwareCheck = fastify.malwareDatabaseManager.isMalware(packageName, version)
        if (malwareCheck.blocked) {
          return malwareCheck
        }
      }

      if (!blacklistConfig || Object.keys(blacklistConfig).length === 0) {
        return { blocked: false }
      }

      // Check packages
      if (blacklistConfig.packages) {
        for (const pkg of blacklistConfig.packages) {
          if (pkg.name === packageName) {
            // If no versions specified, block entire package
            if (!pkg.versions) {
              return {
                blocked: true,
                reason: pkg.reason || 'Package is blacklisted',
                type: 'package',
              }
            }

            // If versions specified and we have a version to check
            if (pkg.versions && version) {
              // Check if version matches any of the specified versions/ranges
              for (const versionSpec of pkg.versions) {
                if (typeof versionSpec === 'string') {
                  // Try semver range matching first, fall back to exact match
                  try {
                    if (semver.satisfies(version, versionSpec)) {
                      return {
                        blocked: true,
                        reason: pkg.reason || 'Package version is blacklisted',
                        type: 'version',
                        version,
                        versionSpec,
                      }
                    }
                  }
                  catch {
                    // If semver parsing fails, fall back to exact string match
                    if (version === versionSpec) {
                      return {
                        blocked: true,
                        reason: pkg.reason || 'Package version is blacklisted',
                        type: 'version',
                        version,
                        versionSpec,
                      }
                    }
                  }
                }
                else if (version === versionSpec) {
                  // Direct comparison for non-string specs
                  return {
                    blocked: true,
                    reason: pkg.reason || 'Package version is blacklisted',
                    type: 'version',
                    version,
                    versionSpec,
                  }
                }
              }
            }
          }
        }
      }

      // Check patterns
      if (blacklistConfig.patterns) {
        for (const pattern of blacklistConfig.patterns) {
          const regex = new RegExp(pattern.pattern)
          if (regex.test(packageName)) {
            return {
              blocked: true,
              reason: pattern.reason || 'Package name matches blacklisted pattern',
              type: 'pattern',
              pattern: pattern.pattern,
            }
          }
        }
      }

      return { blocked: false }
    }

    /**
     * Extract version from tarball filename using smart semver parsing
     */
    const extractVersionFromTarball = (filename) => {
      // Extract potential version part using a simple regex
      const match = filename.match(/-((v?\d[\w.+-]*))\.tgz$/)
      if (!match) {
        return null
      }

      const rawVersion = match[1]

      try {
        // First try semver.clean to preserve prerelease info
        const cleanedVersion = semver.clean(rawVersion)
        if (cleanedVersion) {
          return cleanedVersion
        }

        // If that fails, try coercing for incomplete versions
        const coercedVersion = semver.coerce(rawVersion)
        return coercedVersion ? coercedVersion.version : null
      }
      catch {
        return null
      }
    }

    fastify.decorate('blacklistManager', {
      isBlacklisted,
      extractVersionFromTarball,
      loadBlacklist,
    })

    // Load initial configuration
    await loadBlacklist()
  },
  {
    name: 'blacklist-manager',
  },
)
