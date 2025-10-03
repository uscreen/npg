# NPG Deployment Examples

This directory contains Docker Compose examples for deploying NPG (Node Package Guard) in various scenarios.

## Available Deployments

### [`single/`](./single/)
**Simple standalone NPG deployment**
- Single NPG container with persistent storage
- Basic configuration for development/testing
- No external dependencies
- Perfect for local development or simple production setups

### Coming Soon

### `single+nginx/`
**NPG with nginx reverse proxy**
- NPG container behind nginx for SSL termination
- Gzip compression for optimal performance
- Custom domain and path configuration
- Production-ready setup

### `single+redis/`
**NPG with Redis cache**
- NPG container with Redis for metadata caching
- Improved performance for high-traffic scenarios
- Persistent Redis data
- NPM changes polling enabled

### `multi-instance/`
**Load-balanced NPG deployment**
- Multiple NPG instances behind a load balancer
- Redis for shared caching
- High availability setup
- Horizontal scaling

### `traefik/`
**NPG with Traefik reverse proxy**
- Automatic SSL certificates with Let's Encrypt
- Service discovery and load balancing
- Modern cloud-native deployment
- Docker labels configuration

### `k8s/`
**Kubernetes deployment**
- Helm charts for NPG deployment
- Kubernetes-native configuration
- Ingress controller setup
- Persistent volumes and services

## Quick Start

1. **Choose your deployment scenario** from the directories above
2. **Navigate to the directory** (e.g., `cd single/`)
3. **Follow the README** in that directory for specific instructions
4. **Customize as needed** for your environment

## General Requirements

- Docker and Docker Compose
- At least 1GB RAM for NPG container
- Persistent storage for package cache (recommended)
- Network access to npmjs.org for package fetching

## Security Considerations

### For Production Deployments:

- **Always use HTTPS** - Deploy behind a reverse proxy with SSL termination
- **Enable compression** - Gzip/brotli compression is crucial for npm metadata performance
- **Custom domain** - Use a dedicated domain/subdomain for NPG
- **Firewall rules** - Restrict access to NPG ports as needed
- **Regular updates** - Keep NPG image updated for security patches
- **Monitor logs** - Set up log aggregation and monitoring

### Network Configuration:

```bash
# Configure npm/pnpm to use your NPG proxy
echo "registry=https://your-npg-domain.com/npm/" >> ~/.npmrc
```

## Performance Tips

- **Use Redis caching** for high-traffic environments
- **Enable compression** at the reverse proxy level
- **Mount storage on fast disks** (SSD recommended)
- **Monitor cache hit rates** via X-Cache headers
- **Consider multiple instances** for load distribution

## Support

For deployment-specific questions:
- Check the README in each deployment directory
- Review the main [NPG documentation](../../README.md)
- Report issues at [GitHub Issues](https://github.com/uscreen/npg/issues)