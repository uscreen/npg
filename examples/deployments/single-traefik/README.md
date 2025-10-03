# NPG Traefik Deployment

NPG deployment with Traefik reverse proxy, automatic HTTPS via Let's Encrypt, and compression.
Perfect for production deployments with zero SSL configuration.

## What's Included

- **NPG proxy server** with automatic HTTPS
- **Traefik reverse proxy** with Let's Encrypt integration
- **Automatic compression** for optimal npm performance
- **Persistent storage** for packages, certificates, and malware database
- **HTTP to HTTPS redirect** for security
- **Health checks** for container monitoring

## Quick Start

**Configure your domains:**

```bash
# Edit .env file with your actual domains
nano .env

# Required settings:
# NPG_DOMAIN=npg.yourdomain.com
# ACME_EMAIL=admin@yourdomain.com
```

**Start the services:**

```bash
docker compose up -d
```

**Configure npm/pnpm:**

```bash
echo "registry=https://npg.yourdomain.com/npm/" >> ~/.npmrc
```

**Test the installation:**

```bash
npm install lodash
```

## Configuration

Configuration is managed through the [`.env`](./.env) file:

| Variable | Description |
|----------|-------------|
| `NPG_DOMAIN` | **Required** - Domain for NPG service |
| `ACME_EMAIL` | **Required** - Email for Let's Encrypt certificates |
| `TRAEFIK_DOMAIN` | Optional - Domain for Traefik dashboard |
| `PROXY_URL` | NPG proxy URL (should match NPG_DOMAIN) |

## Features

### Automatic HTTPS
- Let's Encrypt certificates with TLS challenge
- Automatic certificate renewal
- HTTP to HTTPS redirect

### Compression
- Automatic gzip compression for all responses
- Essential for npm metadata performance

### Traefik Dashboard
Access at `https://traefik.yourdomain.com/dashboard/` (if TRAEFIK_DOMAIN is set)

## DNS Requirements

Point your domains to the server:

```
npg.yourdomain.com     A    YOUR_SERVER_IP
traefik.yourdomain.com A    YOUR_SERVER_IP  # Optional
```

## Security Notes

- Certificates stored in Docker volume `traefik_letsencrypt`
- Traefik dashboard protected by default
- NPG only accessible via HTTPS
- No ports exposed except 80/443
