import fastifyApp from '@uscreen.de/fastify-app'
import fp from 'fastify-plugin'

export default fp((fastify, opts, next) => {
  /**
   * register app
   */
  fastify.register(fastifyApp, opts)

  next()
})
