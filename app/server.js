import process from 'node:process'
import { options } from '@uscreen.de/fastify-app'
import fastify from 'fastify'
import app from './app.js'

import config from './config.js'

const defaultOptions = {
  ...options(config),
  keepAliveTimeout: 72000,
  requestTimeout: 300000,
  bodyLimit: 500 * 1024 * 1024,

  // For high throughput
  connectionTimeout: 0,
  pluginTimeout: 30000,
}

const server = fastify(defaultOptions)

server.register(app, config)

/**
 * post-treatment
 */
server.ready((err) => {
  if (err) {
    throw err
  }
  server.log.debug(
    `server ready, routes are set:\n${
      server.printRoutes({ commonPrefix: false })}`,
  )
})

/**
 * graceful shutdown (closing handles, etc.)
 */
async function shutdown() {
  server.log.info(
    `application shutting down. (${server.app.name} ${server.app.version})`,
  )
  await server.close()
  process.exit()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

/**
 * start http server
 */
server.listen({ port: config.HTTP_PORT, host: config.HTTP_BIND })
