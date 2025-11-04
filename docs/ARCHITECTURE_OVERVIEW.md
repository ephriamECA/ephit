# Open Notebook - Architecture Overview

## System Architecture

Open Notebook is a full-stack AI-powered research assistant with the following architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     USER BROWSER                         │
│                  (React/Next.js UI)                      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       │
┌──────────────────────▼──────────────────────────────────┐
│              FRONTEND (Next.js - Port 8502)              │
│  • Server-side rendering                                 │
│  • API request proxying (/api/* → backend)              │
│  • Static asset serving                                  │
└──────────────────────┬──────────────────────────────────┘
                       │ Internal HTTP (localhost)
                       │
┌──────────────────────▼──────────────────────────────────┐
│              BACKEND (FastAPI - Port 5055)               │
│  • REST API endpoints                                    │
│  • Authentication & authorization                        │
│  • Business logic                                        │
│  • File upload handling                                  │
└─────────┬──────────────┬─────────────────┬──────────────┘
          │              │                 │
          │              │                 │
┌─────────▼────┐  ┌──────▼──────┐  ┌──────▼──────────────┐
│  SURREALDB   │  │   WORKER    │  │   FILE STORAGE      │
│  (Port 8000) │  │  PROCESS    │  │   (/mydata)         │
│              │  │             │  │                     │
│ • User data  │  │ • Document  │  │ • Uploaded files    │
│ • Notebooks  │  │   processing│  │ • Podcast audio     │
│ • Sources    │  │ • Embeddings│  │ • Checkpoints       │
│ • Metadata   │  │ • Podcasts  │  │                     │
└──────────────┘  └─────────────┘  └─────────────────────┘
```

## Core Components

### 1. Frontend (Next.js)
**Location:** `frontend/`
- React-based UI with TypeScript
- Server-side rendering for better SEO
- API proxying to hide backend from users
- Real-time updates via polling

### 2. Backend (FastAPI)
**Location:** `api/`
- Python-based REST API
- JWT authentication
- File upload handling
- Business logic orchestration

### 3. Database (SurrealDB)
**Location:** Embedded, data in `/mydata/mydatabase.db`
- Multi-model database (document + graph)
- Handles relationships between entities
- Real-time queries for worker

### 4. Worker Process
**Location:** `commands/`
- Background job processor
- Document content extraction
- Embedding generation
- Podcast creation

### 5. Storage Layer
**Location:** `open_notebook/storage/`
- Local file storage (uploads, podcasts)
- Optional S3 integration
- Persistent across deployments

## Data Flow Examples

### Example 1: User Uploads a PDF

```
1. User clicks "Upload PDF" in browser
   ↓
2. Frontend sends multipart/form-data to /api/sources
   ↓
3. Backend (FastAPI):
   - Saves file to /mydata/uploads/
   - Creates source record in database
   - Queues processing command
   ↓
4. Worker Process:
   - Detects new command in database
   - Extracts text from PDF
   - Generates embeddings (if requested)
   - Updates source record
   ↓
5. Frontend polls /api/sources/{id}
   - Gets updated status
   - Displays extracted content
```

### Example 2: User Generates a Podcast

```
1. User selects sources and clicks "Generate Podcast"
   ↓
2. Frontend sends request to /api/podcasts
   ↓
3. Backend:
   - Creates episode record
   - Queues podcast generation command
   ↓
4. Worker Process:
   - Fetches source content
   - Generates briefing with LLM
   - Creates dialogue with LLM
   - Synthesizes audio with TTS
   - Saves to /mydata/podcasts/
   ↓
5. Frontend polls /api/podcasts/episodes/{id}
   - Shows generation progress
   - Plays audio when complete
```

## Technology Stack

### Frontend
- **Framework:** Next.js 15 (React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand (global state)
- **API Client:** Axios
- **Forms:** React Hook Form + Zod

### Backend
- **Framework:** FastAPI
- **Language:** Python 3.12
- **Authentication:** JWT (python-jose)
- **Password Hashing:** Argon2 (passlib)
- **Async:** asyncio

### Database
- **Engine:** SurrealDB 2.3
- **Storage:** RocksDB (embedded)
- **Query Language:** SurrealQL
- **Client:** surrealdb-py (async)

### Worker
- **Framework:** surreal-commands
- **Queue:** Database-based (SurrealDB live queries)
- **Content Extraction:** content-core library
- **Graph Orchestration:** LangGraph

### AI/ML
- **LLM Providers:** OpenAI, Anthropic, Gemini, Mistral, etc.
- **Embeddings:** Various (OpenAI, Gemini, etc.)
- **TTS:** ElevenLabs, OpenAI
- **Framework:** LangChain

## Deployment Architecture

### Single-Container Deployment (Render.com)
All services run in one Docker container managed by Supervisord:

```
Docker Container
├── Supervisord (process manager)
│   ├── SurrealDB (priority 5, starts first)
│   ├── FastAPI (priority 10, waits for DB)
│   ├── Worker (priority 20, waits 15s)
│   └── Next.js (priority 30, starts last)
├── /app (application code)
└── /mydata (persistent storage)
    ├── mydatabase.db (database file)
    ├── uploads/ (user files)
    ├── podcasts/ (generated audio)
    ├── sqlite-db/ (checkpoints)
    └── .secrets/ (encryption keys)
```

### Multi-Container Deployment (Docker Compose)
Each service runs in its own container:

```
docker-compose.yml
├── frontend (Next.js)
├── backend (FastAPI)
├── worker (Background jobs)
├── surrealdb (Database)
└── volume: ./data → persistent storage
```

## Key Design Decisions

### 1. Why Single Container for Render?
- **Simplicity:** One service to deploy
- **Cost:** Starter plan ($7/month) includes everything
- **Latency:** No network hops between services
- **Management:** One log stream to monitor

### 2. Why SurrealDB?
- **Multi-model:** Supports both documents and graphs
- **Embedded:** No separate database server needed
- **Real-time:** Live queries for worker notifications
- **Fast:** RocksDB backend, good performance

### 3. Why Async Command Queue?
- **User Experience:** Upload returns immediately
- **Scalability:** Process multiple documents in parallel
- **Reliability:** Retries on failure
- **Flexibility:** Can add more workers

### 4. Why JWT Authentication?
- **Stateless:** No session storage needed
- **Scalable:** Works across multiple instances
- **Standard:** Well-supported by libraries
- **Flexible:** Can add custom claims

## Directory Structure

```
open-notebook/
├── api/                    # FastAPI backend
│   ├── routers/           # API endpoints
│   ├── main.py            # App initialization
│   └── security.py        # Auth logic
├── frontend/              # Next.js frontend
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # React components
│   │   └── lib/          # Utilities
│   └── public/           # Static assets
├── open_notebook/         # Core Python modules
│   ├── database/         # Database layer
│   ├── domain/           # Data models
│   ├── graphs/           # LangGraph workflows
│   ├── storage/          # File storage
│   └── utils/            # Utilities
├── commands/              # Worker commands
│   ├── podcast_commands.py
│   └── source_commands.py
├── migrations/            # Database migrations
├── docs/                  # Documentation
├── Dockerfile.single      # Single-container build
├── docker-compose.*.yml   # Multi-container configs
├── render.yaml           # Render deployment config
└── supervisord.single.conf # Process manager config
```

## Performance Characteristics

### Memory Usage (Single Container)
- **SurrealDB:** 80-120 MB
- **FastAPI:** 80-120 MB
- **Worker:** 80-120 MB
- **Next.js:** 100-150 MB
- **Total:** ~340-510 MB
- **Recommended:** 2GB RAM (standard plan)

### Response Times (Typical)
- **Page Load:** 200-500ms
- **API Requests:** 50-200ms
- **Database Queries:** 1-10ms
- **File Upload:** Depends on size
- **Document Processing:** 5-30 seconds
- **Podcast Generation:** 5-15 minutes

### Storage Requirements
- **Database:** Grows with data (~1MB per 100 sources)
- **Uploads:** Depends on user files
- **Podcasts:** ~1-5MB per minute of audio
- **Recommended:** Start with 10GB, monitor usage

## Security Model

### Authentication Flow
1. User logs in with email/password
2. Backend verifies credentials (Argon2 hash)
3. Backend generates JWT token (24-hour expiry)
4. Frontend stores token in localStorage
5. Frontend sends token in Authorization header
6. Backend validates token on each request

### Authorization
- **User Model:** Each user owns their data
- **Ownership:** Notebooks, sources, notes belong to user
- **Admin Role:** Special privileges (user management)
- **API Keys:** Encrypted per-user with Fernet

### Data Protection
- **Passwords:** Argon2 hashing
- **API Keys:** Fernet encryption (AES-128)
- **JWT:** HS256 signing
- **HTTPS:** TLS in production
- **CORS:** Configurable allowed origins

## Scaling Considerations

### Current Limits (Single Container)
- **Users:** ~100-500 concurrent
- **Documents:** ~10,000-50,000
- **Requests:** ~100 req/sec
- **Bottleneck:** Memory (512MB-2GB)

### Horizontal Scaling (Future)
- Multiple backend instances
- Load balancer
- Shared database (SurrealDB cluster)
- Distributed worker pool
- S3 for file storage

## Monitoring & Observability

### Health Checks
- `/api/health` - Database + migration status
- Returns 200 (healthy) or 503 (unhealthy)

### Logging
- **FastAPI:** Loguru (structured logging)
- **Worker:** Command status in database
- **Frontend:** Console + error boundaries

### Metrics (Manual)
- Database size: `du -sh /mydata/mydatabase.db`
- Memory usage: Render dashboard
- Request logs: Render logs
- Error rates: Manual monitoring

## Next Steps

For detailed documentation on specific components, see:
- [Authentication System](./AUTHENTICATION_SYSTEM.md)
- [Database Layer](./DATABASE_LAYER.md)
- [Source Processing](./SOURCE_PROCESSING.md)
- [Worker System](./WORKER_SYSTEM.md)
- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)



