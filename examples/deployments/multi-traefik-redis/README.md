# NPG Multi-Node Cluster

High-availability NPG deployment with multiple instances, Redis cache, Traefik load balancing, and automatic HTTPS.
Production-ready setup for high-traffic environments with redundancy and scalability.

## What's Included

- **Multiple NPG instances** - Scalable via `--scale npg=N`
- **Traefik load balancer** - Automatic service discovery and health checks
- **Redis shared cache** - High-performance metadata caching across all instances
- **Automatic HTTPS** - Let's Encrypt certificates with zero configuration

## Architecture Benefits

- **High availability** - Multiple NPG instances eliminate single points of failure
- **Scaling** - Easy horizontal scaling with `docker compose up --scale npg=5`
- **Load distribution** - Traefik distributes requests across healthy instances
- **Zero-downtime updates** - Rolling updates with health checks
- **Performance** - Parallel processing across multiple NPG instances

## Quick Start

**Configure your domains:**

```bash
# Edit .env file with your actual domains
nano .env

# Required settings:
# NPG_DOMAIN=npg.yourdomain.com
# ACME_EMAIL=admin@yourdomain.com
```

**Start the cluster (defaults to 3 NPG instances):**

```bash
docker compose up -d
```

**Configure npm/pnpm:**

```bash
echo "registry=https://npg.yourdomain.com/npm/" >> ~/.npmrc
```

**Test the cluster:**

```bash
# Multiple requests should hit different instances
for i in {1..5}; do
  curl -s https://npg.yourdomain.com/api/health
  echo
done
```

**Scale up/down as needed:**

```bash
# Scale to 5 instances
docker compose --env-file .env.local up -d --scale npg=5

# Scale down to 2 instances
docker compose --env-file .env.local up -d --scale npg=2
```

## Configuration

Configuration is managed through the [`.env`](./.env) file. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `NPG_DOMAIN` | **Required** | Domain for NPG service |
| `ACME_EMAIL` | **Required** | Email for Let's Encrypt certificates |
| `TRAEFIK_DOMAIN` | Optional | Domain for Traefik dashboard |
| `PROXY_URL` | **Required** | Should match NPG_DOMAIN |
| `REDIS_MAX_MEMORY` | `512mb` | Redis memory limit |
| `NPG_REPLICAS` | `3` | Default number of NPG instances |
| `NPG_MAX_MEMORY` | `1gb` | Per-instance NPG memory limit |
| `ENABLE_REDIS_CACHE` | `true` | Shared Redis cache for all instances |
| `ENABLE_NPM_CHANGES_POLLER` | `true` | Cache invalidation across cluster |

## Load Balancing Features

- **Health checks** - Traefik only routes to healthy NPG instances
- **Automatic discovery** - New instances automatically join the load balancer
- **Sticky sessions** - Optional session affinity using cookies
- **Round-robin** - Default load balancing algorithm
- **Circuit breaker** - Automatic failover for unhealthy instances

## Monitoring

**Check cluster status:**

```bash
# View all running instances
docker compose ps

# Check Traefik dashboard
open https://traefik.yourdomain.com/dashboard/
```

**Monitor individual instances:**

```bash
# Logs from all NPG instances
docker compose logs npg

# Logs from specific instance
docker compose logs npg-cluster-npg-2
```

**Redis monitoring:**

```bash
# Redis memory usage
docker compose exec redis redis-cli info memory

# Connected NPG instances
docker compose exec redis redis-cli client list
```

## Scaling Operations

**Horizontal scaling:**

```bash
# Scale up gradually
docker compose up -d --scale npg=3
docker compose up -d --scale npg=5
docker compose up -d --scale npg=10

# Scale down gracefully
docker compose up -d --scale npg=3
```

**Resource scaling:**

```bash
# Increase Redis memory
echo "REDIS_MAX_MEMORY=1gb" >> .env
docker compose up -d
```

## Production Considerations

**DNS Setup:**

```
npg.yourdomain.com     A    YOUR_SERVER_IP
traefik.yourdomain.com A    YOUR_SERVER_IP  # Optional
```

**Security:**

- All traffic encrypted with Let's Encrypt
- Traefik dashboard protected by default
- Redis only accessible within Docker network

**Performance:**

- Shared Redis cache across all NPG instances
- Gzip compression enabled for all responses
- Health checks ensure optimal routing

## Troubleshooting

**Load balancing issues:**

```bash
# Check Traefik service discovery
docker compose logs traefik | grep npg

# Verify health checks
curl -k https://npg.yourdomain.com/api/health
```

**Redis connectivity:**

```bash
# Check Redis from NPG instance
docker compose exec npg-cluster-npg-1 /nodejs/bin/node -e "console.log('Redis test')"

# Monitor Redis connections
docker compose exec redis redis-cli monitor
```

**Scaling problems:**

```bash
# Check resource usage
docker stats

# Verify all instances are healthy
docker compose ps | grep healthy
```
