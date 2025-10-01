# NPG (Node Package Guard)

[![CI](https://github.com/uscreen/npg-dev/actions/workflows/test.yml/badge.svg)](https://github.com/uscreen/npg-dev/actions/workflows/test.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/uscreen/npg-dev/badge.svg)](https://snyk.io/test/github/uscreen/npg-dev)
[![codecov](https://codecov.io/gh/uscreen/npg-dev/branch/main/graph/badge.svg)](https://codecov.io/gh/uscreen/npg-dev)
[![License: MIT](https://img.shields.io/github/license/uscreen/npg-dev)](https://opensource.org/license/agpl-v3)

A security-focused npm registry proxy that protects your development environment from malicious packages and supply chain attacks while providing high-performance caching.

## Security Features

- **Aikido Intel Integration** - Automatic blocking using [Aikido's open-source malware threat feed](https://www.aikido.dev/blog/launching-aikido-malware---open-source-threat-feed)
- **Package Blacklisting** - Block malicious packages, vulnerable versions, and suspicious patterns via YAML configuration
- **Version-Specific Blocking** - Support for exact versions and semver ranges
- **Pattern Matching** - Block packages by regex patterns (e.g., typosquatting)
- **Supply Chain Protection** - Multi-layer defense against compromised packages
- **Automatic Database Updates** - Malware database updates every 30 minutes (default) with ETag optimization

## Performance Features

- **Smart Caching** - Redis for metadata when available, in-memory LRU (10k packages) fallback + filesystem for tarballs
- **High-Speed Storage** - Tarballs cached permanently in filesystem
- **Real-time Cache Invalidation** - npm changes polling for automatic cache updates of metadata
- **Zero-Copy Streaming** - Direct tarball streaming for cache hits
- **Connection Pooling** - Optimized HTTP client with undici connection pooling
- **Sharded Storage** - 2-character directory sharding for optimal filesystem performance
- **Cache Monitoring** - `X-Cache` headers for performance insights

## Quick Start

### 1. Install dependencies
```bash
pnpm install
```

### 2. Start the proxy
```bash
pnpm dev
```

### 3. Configure npm/pnpm to use the proxy
```bash
# Create or edit ~/.npmrc
echo "registry=http://127.0.0.1:3000/npm/" >> ~/.npmrc

# For pnpm, create or edit ~/.npmrc
echo "registry=http://127.0.0.1:3000/npm/" >> ~/.npmrc
```

### 4. Use npm/pnpm normally
```bash
npm install lodash
# or
pnpm install lodash
```

## Configuration

Configuration is managed through environment variables or a `.env` file:

```bash
# Server settings
HTTP_PORT=3000
HTTP_BIND=0.0.0.0

# Registry settings
REGISTRY_URL=https://registry.npmjs.org
PROXY_URL=http://127.0.0.1:3000/npm

# Storage settings
STORAGE_DIR=../var/storage
```

## Storage Structure

NPG organizes storage data under the `../var` directory (separated from the app directory) and uses a sharded storage structure for optimal performance with millions of packages:

```
../var/                        # Variable data (one level up)
├── .gitignore                # Ignores all contents (runtime data)
├── storage/                   # Package storage with tarball cache
│   ├── lo/                    # First 2 characters shard
│   │   └── lodash/
│   │       ├── lodash-4.17.21.tgz # Tarball files (cached permanently)
│   │       └── lodash-4.17.20.tgz # Multiple versions supported
│   ├── ex/
│   │   └── express/
│   │       └── express-4.18.2.tgz
│   └── @b/                    # Scoped packages sharded by first 2 chars
│       └── @babel/core/       # Natural directory structure
│           └── core-7.23.0.tgz # Scoped package tarball
└── malware-list/              # Aikido malware database
    └── malware_predictions.json

../etc/                        # Configuration files (one level up)
├── blacklist.example.yml     # Example blacklist configuration
└── blacklist.yml             # Package blacklist configuration (ignored by git)
```

## Cache Management

### View cache status

Cache hits and misses are indicated by the `X-Cache` header in responses.

### Clear cache for specific package
```bash
rm -rf ../var/storage/lo/lodash/        # Regular package
rm -rf ../var/storage/@b/@babel/core/   # Scoped package
```

### Clear all cached data
```bash
rm -rf ../var/storage/ ../var/malware-list/
```

## API Endpoints

- **Package metadata**: `GET /npm/:packageName`
- **Scoped packages**: `GET /npm/@:scope/:packageName`
- **Tarballs**: `GET /npm/:packageName/-/:filename`
- **Scoped tarballs**: `GET /npm/@:scope/:packageName/-/:filename`
- **Audit/Search/etc**: All other npm registry endpoints are proxied

## Development

### Commands
- `pnpm dev` - Start development server with nodemon
- `pnpm test` - Run tests using Node.js built-in test runner
- `pnpm test:cov` - Run tests with coverage
- `pnpm lint` - Run linting
- `pnpm lint:fix` - Run linting with auto-fix

## Security Configuration

### Package Blacklist

Protect your environment from malicious packages and known vulnerabilities:

#### Setup
1. Copy `../etc/blacklist.example.yml` to `../etc/blacklist.yml`
2. Configure packages to block
3. Restart server to apply blacklist changes (loaded once at startup)

#### Blocking Strategies
```yaml
# Block packages (entirely or specific versions/ranges)
packages:
  - name: malicious-package
    reason: Known malware - blocks all versions

  - name: '@evil/package'
    reason: Malicious scoped package - blocks all versions

  - name: lodash
    versions: [4.17.20, 4.17.21]
    reason: Prototype pollution vulnerability - exact versions

  - name: colors
    versions: ['>=1.4.44 <1.4.46']
    reason: DoS vulnerability - semver range

  - name: node-ipc
    versions: [^9.0.0, ^10.0.0]
    reason: Malicious code in these major versions

  - name: mixed-example
    versions: [1.2.3, '>=2.0.0 <3.0.0', ^4.0.0]
    reason: Mixed exact versions and ranges

# Block by pattern
patterns:
  - pattern: '.*malware.*'
    reason: Suspicious package name
```

**Precise Targeting:**
- **Exact versions**: Block specific vulnerable releases
- **Semver ranges**: Block version ranges with known issues
- **Complete packages**: Block entire malicious packages
- **Pattern matching**: Block suspicious package names

**Flexible Blocking:**
- Static YAML configuration loaded at startup
- Granular control over versions vs. entire packages
- Support for both regular and scoped packages
- Integration with Aikido malware database for automatic threat detection

### Security Response
Blocked packages return detailed security information:
```json
{
  "error": "Package is blacklisted",
  "reason": "Known malware",
  "package": "malicious-package",
  "type": "package"
}
```

## Advanced Security

### Supply Chain Protection
- **Aikido Intel threat feed** - automatic blocking of known malicious packages with 30-minute updates using Aikido's AGPL-licensed malware database
- **Version-aware security** - block specific vulnerable releases using semver ranges
- **Pattern-based detection** - regex-based blocking for typosquatting and suspicious names
- **Scoped package support** - full protection for @scope/package patterns
- **Cache invalidation** - npm changes polling ensures fresh security data

> **Complementary Security**: For local dependency scanning, use [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) - a CLI tool that detects malicious packages in your existing dependencies. NPG provides proxy-level protection while Safe Chain analyzes your current project dependencies.

### Infrastructure Security
- **Path traversal protection** - prevents directory escape attacks with path validation
- **Input sanitization** - secure handling of package names and files
- **Private registry support** - configurable upstream registry URL
- **No credential exposure** - credentials never cached or logged
- **Memory-safe operations** - LRU cache with configurable limits to prevent memory exhaustion

## Performance

- **High-performance HTTP client** using undici with connection pooling
- **Connection pooling** with 128 concurrent connections and HTTP/1.1 pipelining
- **Keep-alive optimization** with 60s keep-alive and 10min max timeout
- **16x faster** metadata cache key generation using simple sanitization
- **Sharded storage** with 2-character directory distribution for filesystem performance
- **Efficient storage** with readable directory structure
- **Minimal overhead** proxy for uncached requests
- **Smart caching** with appropriate TTL for different content types

## Compatibility

NPG is compatible with:
- npm (all versions)
- pnpm (all versions)
- npm audit
- npm search
- Private registries (configure `REGISTRY_URL`)
- Scoped packages

---

Built with [Fastify](https://fastify.dev) and [Node.js](https://nodejs.org) by [u|screen](https://uscreen.de)

**Security powered by [Aikido Intel](https://www.aikido.dev/blog/launching-aikido-malware---open-source-threat-feed)** - Open-source malware threat feed (AGPL-3.0). For local package scanning, consider [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain) - CLI tool for detecting malicious packages in your dependencies
