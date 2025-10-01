// Only join relative paths, leave absolute paths as-is
import { isAbsolute } from 'node:path'
import CommonESM from '@uscreen.de/common-esm'

import envSchema from 'env-schema'

const { join } = new CommonESM(import.meta.url)

const schema = {
  type: 'object',
  properties: {
    HTTP_PORT: { default: 3000 },
    HTTP_BIND: { default: '0.0.0.0' },
    PREFIX: { default: '/api' },
    LOG_ENABLED: { default: true },
    LOG_LEVEL: { default: 'warn' },
    REGISTRY_URL: { default: 'https://registry.npmjs.org' },
    REGISTRY_POLL_URL: { default: 'https://replicate.npmjs.com/registry' },
    PROXY_URL: { default: 'http://127.0.0.1:3000/npm' },
    STORAGE_DIR: { default: '../var/storage' },
    BLACKLIST_PATH: { default: '../etc/blacklist.yml' },
    MALWARE_LIST_DIR: { default: '../var/malware-list' },
    UPDATE_INTERVAL: { default: 30 * 60 * 1000 }, // 30 minutes
    ENABLE_REDIS_CACHE: { default: true },
    REDIS_HOST: { default: 'localhost' },
    REDIS_PORT: { default: 6379 },
    REDIS_PASSWORD: { default: undefined },
    REDIS_DB: { default: 0 },
    ENABLE_NPM_CHANGES_POLLER: { default: true },
    NPM_CHANGES_POLL_INTERVAL: { default: 5000 },
    NPM_CHANGES_BATCH_SIZE: { default: 500 },
  },
}

const config = envSchema({
  schema,
  dotenv: true,
})

config.autoloads = [join('plugins'), join('services')]

config.swagger = {
  routePrefix: `${config.PREFIX}/docs`,
  exposeRoute: false,
  addModels: true,
}

config.health = {
  exposeStatusRoute: `${config.PREFIX}/health`,
  maxHeapUsedBytes: 10 * 1024 * 1024 * 1024,
  maxRssBytes: 20 * 1024 * 1024 * 1024,
}

config.STORAGE_DIR = isAbsolute(config.STORAGE_DIR) ? config.STORAGE_DIR : join(config.STORAGE_DIR)
config.MALWARE_LIST_DIR = isAbsolute(config.MALWARE_LIST_DIR) ? config.MALWARE_LIST_DIR : join(config.MALWARE_LIST_DIR)
config.BLACKLIST_PATH = isAbsolute(config.BLACKLIST_PATH) ? config.BLACKLIST_PATH : join(config.BLACKLIST_PATH)

export default config
