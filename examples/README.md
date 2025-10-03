# NPG Examples

This directory contains configuration examples and deployment scenarios for NPG (Node Package Guard).

## Contents

### [`blacklist.yml`](./blacklist.yml)
Example package blacklist configuration showing how to block malicious packages, specific versions, and suspicious patterns.

### [`deployments/`](./deployments/)
Docker Compose deployment examples for various scenarios:

- **[`single-nginx/`](./deployments/single-nginx/)** - Simple NPG deployment with nginx configuration
- **[`single-redis/`](./deployments/single-redis/)** - NPG with Redis cache for high performance
- **[`single-traefik/`](./deployments/single-traefik/)** - NPG with Traefik proxy and automatic HTTPS
- **[`multi-traefik-redis/`](./deployments/multi-traefik-redis/)** - Production cluster with multiple NPG instances, Redis cache, and Traefik load balancing

## Quick Start

Choose the deployment that fits your needs:

### Simple Development Setup
```bash
cd examples/deployments/single-nginx
docker compose up -d
echo "registry=http://localhost:3000/npm/" >> ~/.npmrc
npm install lodash  # Test it works
```

### High Performance with Redis
```bash
cd examples/deployments/single-redis
docker compose up -d
echo "registry=http://localhost:3000/npm/" >> ~/.npmrc
npm install lodash  # Should be faster on subsequent installs
```

### Production with HTTPS
```bash
cd examples/deployments/single-traefik
# Edit .env with your domain and email
docker compose up -d
echo "registry=https://npg.yourdomain.com/npm/" >> ~/.npmrc
```

### Enterprise Cluster
```bash
cd examples/deployments/multi-traefik-redis
# Edit .env with your domain and email
docker compose up -d  # Starts 3 NPG instances by default
echo "registry=https://npg.yourdomain.com/npm/" >> ~/.npmrc
```

## Deployment Comparison

| Feature | single-nginx | single-redis | single-traefik | multi-traefik-redis |
|---------|--------------|--------------|----------------|------------|
| **Complexity** | Simple | Medium | Medium | Advanced |
| **Performance** | Basic | High | Basic | Highest |
| **HTTPS** | Manual | Manual | Automatic | Automatic |
| **Scaling** | Manual | Manual | Easy | Easy |
| **Production Ready** | Partial | Partial | Yes | Yes |

## Configuration Examples

### Development .npmrc
```
registry=http://localhost:3000/npm/
```

### Production .npmrc
```
registry=https://npg.yourdomain.com/npm/
```

### Environment Variables
Each deployment includes a `.env` file with example configuration. See [main config docs](../app/config.js) for all available options.

## Getting Help

- Check deployment-specific READMEs for detailed instructions
- Review the main [NPG documentation](../README.md)
- Report issues at [GitHub Issues](https://github.com/uscreen/npg/issues)
