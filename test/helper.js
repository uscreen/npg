// This file contains code that we reuse
// between our tests.

import Fastify from 'fastify'
import fp from 'fastify-plugin'

// setup to import YOUR app
import App from '../app/app.js'
import Config from '../app/config.js'

// automatically build and tear down our instance
export async function build(t, ConfigOverwrite = {}) {
  return new Promise((resolve) => {
    const app = Fastify()

    // Use test-specific storage to avoid cross-test contamination
    const testConfig = {
      ...Config,
      STORAGE_DIR: `${process.cwd()}/test-storage-${Date.now()}`,
      LOG_LEVEL: 'silent',
      ENABLE_REDIS_CACHE: false,
      ENABLE_NPM_CHANGES_POLLER: false,
      ...ConfigOverwrite,
    }

    // setup to register YOUR app
    app.register(fp(App), testConfig)

    // tear down our app after we are done
    t.after(async () => {
      await app.close()
      // Clean up test storage
      try {
        const fs = await import('node:fs/promises')
        await fs.rm(testConfig.STORAGE_DIR, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    app.ready((err) => {
      if (err) {
        throw err
      }
      resolve(app)
    })
  })
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
