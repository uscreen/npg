# NPG Redis Deployment

NPG deployment with Redis cache for high-performance package metadata caching.
Perfect for high-traffic environments or when you need persistent metadata cache across restarts.

## What's Included

- **NPG proxy server** on port 3000, bound to localhost by default
- **Redis cache** for fast metadata caching with persistence
- **NPM changes polling** enabled for automatic cache invalidation
- **Persistent storage** for package tarballs, Redis data, and malware database
- **Health checks** for both NPG and Redis

## Performance Benefits

- **Fast metadata cache** - Redis stores package metadata in memory
- **Persistent cache** - Metadata survives NPG restarts
- **Cache invalidation** - NPM changes polling keeps cache fresh
- **High concurrency** - Redis handles thousands of concurrent requests
- **Memory efficient** - Only metadata in Redis, tarballs on disk

## Quick Start

Review the configuration:

```bash
# Check the Redis-optimized settings in .env file
cat .env
```

Start the services:

```bash
# Start Redis and NPG services
docker compose up -d
```

Configure npm/pnpm to use the proxy:

```bash
# Add to ~/.npmrc
echo "registry=http://localhost:3000/npm/" >> ~/.npmrc
```

Test the installation:

```bash
npm install lodash
# Second install should be much faster due to Redis cache
npm install express
```

Check logs to see Redis in action:

```bash
docker compose logs -f npg
# Look for "Redis connection established" and cache hit/miss logs
```

## Configuration

Configuration is managed through the [`.env`](./.env) file. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3000` | Port for the NPG server |
| `HTTP_BIND` | `0.0.0.0` | Bind address (required for Docker) |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `PROXY_URL` | `http://localhost:3000/npm` | URL clients use to reach NPG |
| `ENABLE_REDIS_CACHE` | `true` | Enable Redis for metadata caching |
| `REDIS_HOST` | `redis` | Redis container hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `ENABLE_NPM_CHANGES_POLLER` | `true` | Enable automatic cache invalidation |
| `NPM_CHANGES_POLL_INTERVAL` | `5000` | Poll npm changes every 5 seconds |

**To customize:**
1. Edit the `.env` file with your preferred settings
2. Restart the services: `docker compose down && docker compose up -d`

## Storage

Three Docker volumes are created for persistent data:

- `npg_storage` - Package tarballs cache
- `npg_malware` - Aikido malware database
- `redis_data` - Redis cache data with AOF persistence

## Redis Features

- **AOF persistence** - Redis data survives container restarts
- **Memory optimization** - Only metadata cached, not tarballs
- **Automatic failover** - Falls back to filesystem cache if Redis fails
- **Health monitoring** - Redis health checks ensure reliability

## Custom Blacklist

To use a custom package blacklist:

**Create a blacklist file:**

```bash
touch blacklist.yml
```

**Edit the configuration:**

```yaml
packages:
  - name: malicious-package
    reason: Known malware

  - name: debug
    versions: [4.4.2]
    reason: cryptostealer malware

patterns:
  - pattern: '.*suspicious.*'
    reason: Suspicious package names
```

**Restart the services:**

```bash
docker compose down && docker compose up -d
```

## Monitoring

**Check Redis connection:**

```bash
# NPG logs should show Redis connection
docker compose logs npg | grep -i redis

# Connect to Redis directly
docker compose exec redis redis-cli ping
```

**Monitor cache performance:**

```bash
# Check Redis memory usage
docker compose exec redis redis-cli info memory

# Monitor cache hits
docker compose exec redis redis-cli monitor
```

## Nginx Reverse Proxy

For production and better performance, deploy nginx in front of NPG.

**Key benefits:**

- **TLS termination** - Add HTTPS support
- **Gzip compression** - Essential for npm metadata performance

**Basic nginx setup:**

Add to your nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name npg.localhost; # your domain

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    gzip on;
    gzip_types application/json;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 300s;
    }
}
```

**Update .env to match your domain:**

```bash
echo "PROXY_URL=https://npg.localhost/npm" >> .env
docker compose down && docker compose up -d
```

**Configure npm to use nginx:**

```bash
echo "registry=https://npg.localhost/npm/" >> ~/.npmrc
```

## Performance Tuning

For high-traffic scenarios:

- **Increase Redis memory** - Add `maxmemory` settings to Redis config
- **Enable compression** - Use nginx/Traefik in front for gzip
- **Scale horizontally** - Multiple NPG instances can share the same Redis
- **Monitor metrics** - Watch X-Cache headers for cache hit rates
