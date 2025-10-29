# Deep Deployment Plan: Render.com Single-Container Architecture

## 📊 Overview

Your application will run as a **single Docker container** on Render that includes all 4 services managed by Supervisord.

---

## 🏗️ Architecture Diagram

```
User's Browser
    ↓
Render.com (Single Container)
    ↓
┌─────────────────────────────────────────────┐
│  Docker Container: ephitup                   │
│                                               │
│  ┌─────────────────────────────────────┐     │
│  │  Supervisord (Process Manager)      │     │
│  │                                       │     │
│  │  Manages 4 services:                 │     │
│  │                                       │     │
│  │  1. SurrealDB (Port 8000)           │     │
│  │     ├─ Database file: /mydata/*     │     │
│  │     └─ Persistent to disk           │     │
│  │                                       │     │
│  │  2. FastAPI Backend (Port 5055)     │     │
│  │     ├─ API endpoints: /api/*        │     │
│  │     └─ Communicates with DB         │     │
│  │                                       │     │
│  │  3. Worker Process                   │     │
│  │     ├─ Podcast generation           │     │
│  │     ├─ Processing tasks              │     │
│  │     └─ Uses SurrealDB                │     │
│  │                                       │     │
│  │  4. Next.js Frontend (Port 8502)    │     │
│  │     ├─ Serves UI                     │     │
│  │     ├─ Proxy to API on /api/*       │     │
│  │     └─ Exposed as main port          │     │
│  └─────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

---

## 🌐 How Users Visit Your Site

### URL Structure

**Your Site URL (example):**
```
https://ephitup.onrender.com
```

**How It Works:**
1. User visits: `https://ephitup.onrender.com`
2. Render routes traffic to port 8502 (your Next.js frontend)
3. Next.js serves the UI
4. User clicks "Login" → Frontend makes API call to `/api/auth/login`
5. Next.js proxies `/api/*` to FastAPI on port 5055
6. FastAPI processes request and queries SurrealDB on port 8000
7. Response flows back: SurrealDB → FastAPI → Next.js → Browser

### Internal Communication (Within Container)

```
Browser Request: GET /api/notebooks
    ↓
Frontend (Next.js) on port 8502
    ↓
Next.js detects /api/* and proxies to:
    ↓
Backend (FastAPI) on port 5055
    ↓
FastAPI queries:
    ↓
SurrealDB on port 8000 (via WebSocket)
    ↓
Returns data:
    ↓
FastAPI → Next.js → Browser
```

**Key Points:**
- All services run in the **same container** (same process space)
- Communication happens via `localhost` (0.0.0.0 internally)
- SurrealDB runs as embedded database
- No network hops needed - everything is local

---

## 💾 Where Data Is Stored

### Database Storage

**Location:** `/mydata/mydatabase.db` (inside container)
- SurrealDB uses RocksDB storage engine
- File persisted to Render's persistent storage

**What Gets Stored:**
```
/mydata/mydatabase.db
├── user (user accounts, passwords hashed)
├── notebook (user notebooks)
├── source (uploaded documents metadata)
├── note (user notes)
├── episode (podcast episodes)
├── user_provider_secret (encrypted API keys)
└── model (AI model configurations)
```

### Application Data Storage

**Location:** `/app/data` (inside container)
- Podcast audio files (if not using S3)
- Uploaded documents (if stored locally)
- Temp files, checkpoints, caches

### Render's Storage

Render provides **persistent disk storage** that survives:
- Container restarts
- Deployments
- Service updates

Storage path is configured in `render.yaml`:
```yaml
envVars:
  - key: DATA_PATH
    value: /mydata
```

**Important:** The volume at `/mydata` is automatically persisted by Render.

---

## 🔄 How Services Communicate

### 1. SurrealDB (Database)
```python
# Connection string
SURREAL_URL = "ws://localhost:8000/rpc"
SURREAL_USER = "root"
SURREAL_PASSWORD = "root"
```

**Why `localhost:8000`?**
- All services run in same container
- SurrealDB listens on 0.0.0.0:8000 (inside container)
- Other services connect via `localhost` (no network routing needed)
- Not exposed externally - only accessible within container

### 2. FastAPI Backend
```python
# Runs on port 5055
uvicorn api.main:app --host 0.0.0.0 --port 5055

# Endpoints available:
- /api/auth/* (login, register)
- /api/notebooks/*
- /api/sources/*
- /api/podcasts/*
- /api/models/*
```

**How Frontend Calls It:**
```typescript
// Next.js automatically proxies /api/* to backend
fetch('/api/notebooks')
  ↓ (Next.js rewrite)
fetch('http://localhost:5055/api/notebooks')
```

### 3. Worker Process
```bash
# Runs continuously in background
surreal-commands-worker --import-modules commands

# What it does:
- Listens for database commands
- Processes podcast generation
- Handles long-running tasks
- Uses same SurrealDB connection as API
```

**Communication Flow:**
```
API receives podcast generation request
  ↓
API creates command record in SurrealDB
  ↓
Worker detects new command (live query)
  ↓
Worker executes podcast generation
  ↓
Worker saves result back to SurrealDB
  ↓
Frontend polls for updates
```

### 4. Next.js Frontend
```bash
# Runs on port 8502 (exposed to internet)
npm run start -p 8502

# Configuration:
INTERNAL_API_URL = "http://localhost:5055"
```

**Next.js Rewrites:**
```typescript
// next.config.ts
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:5055/api/:path*',  // Internal routing
    },
  ]
}
```

**What This Means:**
- User makes request to `https://your-app.onrender.com/api/notebooks`
- Next.js intercepts and forwards to FastAPI on port 5055
- FastAPI queries SurrealDB on port 8000
- Response comes back through Next.js to user

---

## 📦 Container Breakdown

### What's Inside the Container

```bash
Container (/app)
├── .venv/              # Python virtual environment
│   ├── python packages
│   └── uv, fastapi, etc.
├── frontend/
│   ├── .next/          # Built Next.js app
│   ├── standalone/     # Standalone server
│   └── static/         # Static assets
├── api/                # FastAPI code
├── open_notebook/      # Core modules
├── commands/            # Worker commands
├── migrations/          # Database migrations
├── supervisord.conf     # Process manager config
└── /mydata/            # Persistent database storage
```

### Processes Running (Managed by Supervisord)

```bash
# Process 1: SurrealDB
surreal start --log trace --user root --pass root rocksdb:/mydata/mydatabase.db
# Port: 8000 (internal only)

# Process 2: FastAPI
uv run uvicorn api.main:app --host 0.0.0.0 --port 5055
# Port: 5055 (internal only)

# Process 3: Worker
uv run surreal-commands-worker --import-modules commands
# No port (background process)

# Process 4: Next.js
npm run start -p 8502
# Port: 8502 (EXPOSED TO INTERNET)
```

---

## 🔌 Port Explanation

### Why Only Port 8502 is Exposed?

**Render Configuration:**
```yaml
# In Dockerfile.single
EXPOSE 8502 5055  # Defines available ports

# In render.yaml
services:
  - type: web      # Render automatically exposes port 8502
```

**Port Mapping:**
- **8502 (Frontend)** → Exposed to internet ✅
- **5055 (API)** → Internal only (accessed via Next.js proxy)
- **8000 (Database)** → Internal only (never exposed)

**Request Flow:**
```
Internet
  ↓
Render (exposes port 8502)
  ↓
Container: Next.js (port 8502)
  ↓
Proxy /api/* → FastAPI (port 5055)
  ↓
Query SurrealDB (port 8000)
```

Users **never** directly access port 5055 or 8000 - only through the Next.js proxy.

---

## 📊 Data Flow Examples

### Example 1: User Logs In

```
1. User enters email/password at https://ephitup.onrender.com
   ↓
2. Browser sends: POST /api/auth/login
   ↓
3. Next.js receives on port 8502
   ↓
4. Next.js rewrites to: http://localhost:5055/api/auth/login
   ↓
5. FastAPI on port 5055 receives request
   ↓
6. FastAPI queries SurrealDB on port 8000:
   SELECT * FROM user WHERE email = $email
   ↓
7. FastAPI validates password and creates JWT token
   ↓
8. Response flows back: 5055 → 8502 → Browser
   ↓
9. User logged in!
```

### Example 2: Create Podcast

```
1. User clicks "Generate Podcast" at https://ephitup.onrender.com/podcasts
   ↓
2. Browser sends: POST /api/podcasts/create
   ↓
3. FastAPI receives and validates request
   ↓
4. FastAPI creates command record in SurrealDB:
   INSERT INTO command ...
   ↓
5. Worker (listening for changes) detects new command
   ↓
6. Worker starts podcast generation
   ↓
7. Worker uses user's OpenAI API key (encrypted in DB)
   ↓
8. Worker saves progress to SurrealDB
   ↓
9. Frontend polls GET /api/podcasts/episodes/{id}
   ↓
10. Worker completes, saves audio to S3
    ↓
11. Frontend shows "Ready to play!" ✅
```

---

## 🔒 Security Architecture

### API Key Storage

**How it works:**
1. User enters API key in UI
2. Frontend sends to: `POST /api/provider-secrets`
3. Backend encrypts using `FERNET_SECRET_KEY`
4. Encrypted key stored in `user_provider_secret` table
5. When needed, key is decrypted in-memory only

**Security layers:**
```
User Input
  ↓ (HTTPS)
Next.js → FastAPI
  ↓ (within container)
Encryption (FERNET_AES)
  ↓ (encrypted string)
SurrealDB Storage (persisted)
```

### Data Isolation

**Per-User Isolation:**
```sql
-- Each user only sees their data
SELECT * FROM notebook WHERE owner = $user_id
SELECT * FROM source WHERE owner = $user_id
SELECT * FROM note WHERE owner = $user_id
```

**Database Access:**
- Only processes inside container can access SurrealDB
- Not exposed to internet
- Authentication via user/pass
- All queries are isolated per user ID

---

## 🚀 Deployment Checklist

### Pre-Deployment

- [ ] Commit all code to GitHub
- [ ] Verify `render.yaml` is configured
- [ ] Ensure migrations are ready
- [ ] Add environment variables

### Environment Variables Needed

```bash
# Required
OPENAI_API_KEY=sk-...
JWT_SECRET=<generate-random-secret>

# Optional (S3 for podcast storage)
S3_BUCKET_NAME=...
S3_ENDPOINT_URL=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_REGION=us-east-2

# Database (auto-configured by render.yaml)
SURREAL_URL=ws://localhost:8000/rpc
SURREAL_USER=root
SURREAL_PASSWORD=<generated>
SURREAL_NAMESPACE=open_notebook
SURREAL_DATABASE=production
```

### Render Deployment

1. **Push to GitHub**
2. **Connect Repository**
3. **Render Detects Docker**
4. **Build Process:**
   - Install Python deps
   - Build Next.js
   - Create container image
5. **Start Processes:**
   - Supervisord starts
   - SurrealDB initializes
   - API starts
   - Worker starts
   - Frontend starts
6. **Traffic Routes:**
   - External → Port 8502
   - Internal routing handles backend

---

## 📈 Scaling Considerations

### Current Setup (Single Container)

**Pros:**
- Simple to deploy
- Low cost (free tier available)
- Everything works together
- No network latency between services

**Cons:**
- Can't scale services independently
- All-or-nothing scaling

### Future: Multi-Container (If Needed)

If you grow and need to scale:

```
Container 1: SurrealDB (managed service)
Container 2: FastAPI (can scale horizontally)
Container 3: Worker (can scale horizontally)
Container 4: Frontend (can scale horizontally)
```

**When to Consider:**
- High traffic (>1000 users)
- Need separate scaling
- Want managed database

**For now:** Single container is perfect for your use case!

---

## 🎯 Summary

**How it works:**
1. One container holds everything
2. Supervisord manages 4 processes
3. Port 8502 is exposed (Next.js)
4. Internal ports (5055, 8000) are private
5. Next.js proxies API calls internally
6. All data persists in /mydata
7. Users visit via Render URL

**Key Benefits:**
- Simple deployment
- Single point of management
- Cost effective
- All services in sync
- Automatic scaling (if needed)

**You're ready to deploy!** 🚀

