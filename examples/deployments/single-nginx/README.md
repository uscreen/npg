# NPG Simple Deployment

Simple standalone NPG deployment with Docker Compose and persistent storage.
This setup is ideal for local development, testing, or small-scale production use.
NPG will cache package metadata in memory in an LRU cache with 10k packages max, 1 hour TTL, which should result in ~500MB memory usage.
That cache is lost on restart, but package tarballs are stored on disk.

## What's Included

- **NPG proxy server** on port 3000, bound to localhost by default
- **Persistent storage** for package cache and malware database
- **Health checks** for container monitoring
- **Malware protection** with Aikido Intel threat feed
- **Basic logging** at info level
- **Automatic restarts** unless stopped manually

## Quick Start

Review the configuration:

```bash
# Check the default settings in .env file
cat .env
```

Start the service:

```bash
# Start the NPG service according to docker-compose.yml
docker compose up -d
```

Configure npm/pnpm to use the proxy:

```bash
# Add to ~/.npmrc
echo "registry=http://localhost:3000/npm/" >> ~/.npmrc
```

Test the installation:

```bash
npm install safe-chain-test
# or
pnpm install safe-chain-test
```
Trying to install a blacklisted package should fail with HTTP 403, i.e.:

```bash
npm error 403 403 Forbidden - GET http://localhost:3000/npm/safe-chain-test - Blocked package: safe-chain-test@0.0.1-security - MALWARE
# or
ERR_PNPM_FETCH_403 GET http://localhost:3000/npm/safe-chain-test: Forbidden - 403
```

### Configuration

Configuration is managed through the [`.env`](./.env) file. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `3000` | Port for the NPG server |
| `HTTP_BIND` | `0.0.0.0` | Bind address (required for Docker) |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `PROXY_URL` | `http://localhost:3000/npm` | URL clients use to reach NPG |

**To customize:**

1. Edit the `.env` file with your preferred settings
2. Restart the service: `docker compose down && docker compose up -d`

### Storage

Two Docker volumes are created for persistent data:

- `npg_storage` - Package tarballs and cache
- `npg_malware` - Aikido malware database

### Custom Blacklist

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

  - name: color
    versions: [5.0.1]
    reason: cryptostealer malware

patterns:
  - pattern: '.*suspicious.*'
    reason: Suspicious package names
```

**Restart the service:**

```bash
docker compose down && docker compose up -d
```

### Nginx Reverse Proxy

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
echo "PROXY_URL=http://npg.localhost/npm" >> .env
docker compose down && docker compose up -d
```

**Configure npm to use nginx:**

```bash
echo "registry=http://npg.localhost/npm/" >> ~/.npmrc
```
