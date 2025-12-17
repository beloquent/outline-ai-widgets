# Outline + Widget Framework - Docker Deployment

This guide explains how to run Outline with the Widget Framework (AI Copilot, RAG, document generation) using Docker.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │           Widgets Container                  │
User ──► Port 5000 ─┤  Gateway ─┬─► Widget Framework (3003)        │
                    │           │                                   │
                    │           └─► AI Service (3001) ─► PostgreSQL │
                    │           │                                   │
                    └───────────┼───────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Outline Container    │
                    │  (Port 3000 internal) │
                    └───────────────────────┘
```

The widgets container acts as a reverse proxy, injecting widget functionality into Outline's HTML responses without modifying Outline's codebase.

## Quick Start

### 1. Create Environment File

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required - generate with: openssl rand -hex 32
SECRET_KEY=your_64_character_hex_string
UTILS_SECRET=your_64_character_hex_string

# Required - your public URL
URL=https://your-domain.com

# Optional - for AI features
OPENAI_API_KEY=sk-...

# Optional - custom database password
POSTGRES_PASSWORD=your_secure_password
```

### 2. Build and Start

**Important:** Run all commands from the project root directory.

```bash
# Build the widgets container (from project root)
docker-compose -f docker/docker-compose.yml build

# Start all services
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f
```

### 3. Run Database Migrations

On first startup, run Outline's database migrations:

```bash
docker-compose -f docker/docker-compose.yml exec outline yarn db:migrate
```

### 4. Access the Application

Open `http://localhost:5000` (or your configured URL) in your browser.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | 64-character hex string for encryption |
| `UTILS_SECRET` | Yes | 64-character hex string for utilities |
| `URL` | Yes | Public URL of your installation |
| `POSTGRES_PASSWORD` | No | Database password (default: `outline_password`) |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |
| `OUTLINE_API_KEY` | No | Outline API key for AI reindexing (can also be set in UI) |
| `FORCE_HTTPS` | No | Enforce HTTPS (default: `true`) |

### Ports

| Port | Service | Access |
|------|---------|--------|
| 5000 | Gateway | Public (exposed) |
| 3000 | Outline | Internal only |
| 3003 | Widget Framework | Internal only |
| 3001 | AI Service | Internal only |

## Services

### Gateway (Port 5000)
- Reverse proxy that injects widget bootstrap script
- Routes requests to Outline, Widget Framework, and AI Service
- Implements retry logic for startup resilience
- Shows friendly error pages during service startup

### Outline (Port 3000)
- Official Outline knowledge base
- Completely unmodified codebase
- Accessed only through the Gateway

### Widget Framework (Port 3003)
- Serves widget bundles and manifest
- Provides widget SDK for extensions

### AI Service (Port 3001)
- AI Copilot for document assistance
- RAG-powered knowledge base Q&A
- Document generation and workflows
- Uses pgvector for semantic search

## Volumes

| Volume | Purpose |
|--------|---------|
| `postgres_data` | PostgreSQL database |
| `redis_data` | Redis cache and sessions |
| `outline_data` | Uploaded files and attachments |

## Common Commands

All commands should be run from the project root directory.

```bash
# Start services
docker-compose -f docker/docker-compose.yml up -d

# Stop services
docker-compose -f docker/docker-compose.yml down

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# View specific service logs
docker-compose -f docker/docker-compose.yml logs -f widgets

# Rebuild after code changes
docker-compose -f docker/docker-compose.yml build widgets
docker-compose -f docker/docker-compose.yml up -d widgets

# Reset database (WARNING: destroys data)
docker-compose -f docker/docker-compose.yml down -v
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.yml exec outline yarn db:migrate
```

## Updating

### Update Outline

```bash
docker-compose -f docker/docker-compose.yml pull outline
docker-compose -f docker/docker-compose.yml up -d outline
docker-compose -f docker/docker-compose.yml exec outline yarn db:migrate
```

### Update Widgets

```bash
docker-compose -f docker/docker-compose.yml build widgets
docker-compose -f docker/docker-compose.yml up -d widgets
```

## Troubleshooting

### Enabling Verbose Logging

For troubleshooting startup issues or request tracing, enable debug logging:

```env
# In your .env file
LOG_LEVEL=debug
```

Then restart the containers:

```bash
docker-compose -f docker/docker-compose.yml restart widgets
```

**Log Levels:**
| Level | Description |
|-------|-------------|
| `debug` | Verbose output including request details, timing, headers |
| `info` | Standard operational messages (default) |
| `warn` | Warning conditions and recoverable errors |
| `error` | Error conditions only |

**Viewing logs by service:**
```bash
# All widget container logs
docker-compose -f docker/docker-compose.yml logs -f widgets

# Filter by service (Gateway, Widget Framework, AI Service)
docker-compose -f docker/docker-compose.yml logs -f widgets | grep "Gateway"
docker-compose -f docker/docker-compose.yml logs -f widgets | grep "Widget Framework"
docker-compose -f docker/docker-compose.yml logs -f widgets | grep "AI Service"
```

**Log format:**
```
2024-01-15T10:30:45.123Z [INFO ] [Gateway] Gateway started {"port":5000,"logLevel":"info"}
2024-01-15T10:30:45.456Z [DEBUG] [Gateway] GET /api/documents.info -> Outline [200] 45ms
```

### "Service Starting Up" page appears
The Gateway shows this page while waiting for Outline to start. It has 3 retry attempts with 1-second delays. Wait for auto-refresh or click "Refresh now".

### Reindex job fails
If reindexing fails with "Reindex job failed. Check server logs.":
1. Verify `OUTLINE_API_KEY` is configured (either via environment variable or AI Settings UI)
2. Create an API key in Outline: Settings -> API -> Create new API key
3. The API key needs read access to documents for indexing

### Widgets not loading
1. Check the widgets container is running: `docker-compose ps`
2. Check logs: `docker-compose logs widgets`
3. Verify bootstrap script injection: View page source, look for `/widget-framework/bootstrap.js`

### AI features not working
1. Verify `OPENAI_API_KEY` is set in `.env`
2. Check AI Service logs: `docker-compose logs widgets | grep "AI Service"`
3. Configure API key in AI Settings widget panel

### Database connection issues
1. Check PostgreSQL is healthy: `docker-compose ps`
2. Verify DATABASE_URL is correct
3. Check pgvector extension is enabled

## Zero-Modification Principle

This deployment maintains **zero modifications** to Outline's codebase. All widget functionality is injected externally through the Gateway reverse proxy. The official Outline container runs completely unmodified.

## Security Configuration

### Network Isolation

The Docker deployment uses two networks:
- **outline-internal**: Internal network for database, Redis, Outline, and widgets. Cannot access internet directly.
- **outline-public**: External-facing network for the Gateway container.

Only the Gateway container is exposed externally. All internal services (PostgreSQL, Redis, Outline port 3000) are isolated.

### Required Security Settings

For production deployments, configure these security secrets in your `.env`:

```env
# Generate all secrets with: openssl rand -hex 32
SECRET_KEY=<64-character-hex>
UTILS_SECRET=<64-character-hex>
AI_ADMIN_SECRET=<64-character-hex>
AI_CSRF_SECRET=<64-character-hex>

# Strong database passwords
POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
```

### Content Security Policy (CSP)

The Gateway injects CSP headers to prevent XSS attacks:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CSP` | `true` | Enable CSP headers |
| `CSP_REPORT_ONLY` | `false` | Report violations without blocking (for testing) |

### Origin Validation

Session-authenticated requests are validated against trusted origins:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENFORCE_ORIGIN_CHECK` | `true` | Validate request origins |
| `TRUSTED_ORIGINS` | (empty) | Comma-separated additional trusted origins |

### Subresource Integrity (SRI)

Widget scripts are served with SRI hashes computed at runtime. The Gateway fetches integrity hashes from the Widget Framework and injects them into script tags, preventing tampering.

### Container Security

All containers run with:
- `no-new-privileges:true` - Prevents privilege escalation
- Read-only filesystems where possible (PostgreSQL)
- Minimal exposed ports

### Gateway Binding

By default, the Gateway binds to `127.0.0.1`:

```env
# For reverse proxy setup (recommended)
GATEWAY_BIND_IP=127.0.0.1

# For direct exposure (development only)
GATEWAY_BIND_IP=0.0.0.0
```

**Production Recommendation**: Use `127.0.0.1` with a reverse proxy (nginx/Traefik/Caddy) for TLS termination.

### Admin API Protection

AI admin endpoints (`/ai/admin/*`) require an `Authorization: Bearer <AI_ADMIN_SECRET>` header. Never expose the admin secret publicly.

### Security Checklist

- [ ] Generated unique secrets for SECRET_KEY, UTILS_SECRET, AI_ADMIN_SECRET, AI_CSRF_SECRET
- [ ] Changed default database passwords (POSTGRES_PASSWORD, REDIS_PASSWORD)
- [ ] Configured reverse proxy with TLS/HTTPS
- [ ] Set GATEWAY_BIND_IP=127.0.0.1
- [ ] Enabled CSP (ENABLE_CSP=true)
- [ ] Enabled origin validation (ENFORCE_ORIGIN_CHECK=true)
- [ ] Configured authentication provider (Google, Slack, OIDC, etc.)
- [ ] Reviewed firewall rules to block direct access to internal ports

## Production Deployment Notes

### SSL/TLS Termination

For production, use a reverse proxy (nginx, Traefik, Caddy) in front of the widgets container:

```nginx
# Example nginx configuration
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support for real-time collaboration
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### S3 File Storage (Optional)

For production file storage, configure S3 instead of local storage:

```env
FILE_STORAGE=s3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_UPLOAD_BUCKET_NAME=your-bucket-name
AWS_S3_UPLOAD_BUCKET_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
AWS_S3_FORCE_PATH_STYLE=false
AWS_S3_ACL=private
```

### Running Without HTTPS

For internal networks or testing, you can disable HTTPS enforcement:

```env
FORCE_HTTPS=false
```

Note: Session cookies won't have the `Secure` flag, which is acceptable for internal use but not recommended for public internet access.

### Authentication Providers

Configure at least one authentication provider in your `.env` file. See `.env.example` for available options (Google, Slack, Azure AD, OIDC).
