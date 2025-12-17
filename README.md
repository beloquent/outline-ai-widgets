# Outline AI Widget Extension

A zero-modification widget framework that adds AI capabilities to Outline without modifying any Outline source code.

## What's Included

- **Gateway** - Reverse proxy that injects widget bootstrap script into Outline HTML responses
- **Widget Framework** - SDK and loader for extensible widgets
- **AI Service** - AI Copilot, RAG-powered Q&A, document generation, and workflows

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

## Quick Start

### 1. Configure Environment

```bash
cd docker
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
```

### 2. Build and Start

From the export root directory:

```bash
# Build the widgets container
docker-compose -f docker/docker-compose.yml build

# Start all services
docker-compose -f docker/docker-compose.yml up -d

# Run database migrations
docker-compose -f docker/docker-compose.yml exec outline yarn db:migrate
```

### 3. Access

Open `http://localhost:5000` (or your configured URL) in your browser.

## AI Features

Once running, the AI Copilot widget appears as a floating button in the bottom-right corner of Outline. Features include:

- **Documentation Mode** - Answer questions about the current document
- **Co-pilot Mode** - Interactive AI editing assistance
- **Create Draft Mode** - Generate new documents with AI
- **RAG Search** - Semantic search across your knowledge base

### Configure AI

1. Click the AI Copilot button (bottom-right)
2. Click the gear icon for AI Settings
3. Enter your OpenAI API key
4. Optionally create an Outline API key for RAG reindexing

## Directory Structure

```
├── docker/
│   ├── docker-compose.yml    # Main orchestration file
│   ├── Dockerfile.widgets    # Widgets container build
│   ├── entrypoint.sh         # Container startup script
│   ├── .env.example          # Environment template
│   ├── init-db.sql           # PostgreSQL pgvector init
│   └── README.md             # Detailed documentation
├── gateway/                   # Reverse proxy service
├── widget-framework/          # Widget SDK and bundles
├── ai-service/                # AI backend service
└── README.md                  # This file
```

## Troubleshooting

### Enable Debug Logging

```env
LOG_LEVEL=debug
```

Then restart:
```bash
docker-compose -f docker/docker-compose.yml restart widgets
```

### View Logs

```bash
# All services
docker-compose -f docker/docker-compose.yml logs -f widgets

# Filter by service
docker-compose -f docker/docker-compose.yml logs -f widgets | grep "Gateway"
docker-compose -f docker/docker-compose.yml logs -f widgets | grep "AI Service"
```

### Common Issues

- **"Service Starting Up" page** - Wait for Outline to fully start (auto-refreshes)
- **Widgets not loading** - Check browser console for errors
- **AI features not working** - Verify OPENAI_API_KEY is set

## Development

To rebuild after code changes:

```bash
# Rebuild TypeScript
cd gateway && npm run build
cd widget-framework && npm run build
cd ai-service && npm run build

# Rebuild Docker image
docker-compose -f docker/docker-compose.yml build widgets
docker-compose -f docker/docker-compose.yml up -d widgets
```

## License

This widget extension is designed to work alongside Outline. See Outline's license for the base application.
