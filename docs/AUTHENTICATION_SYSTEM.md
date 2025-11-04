# Authentication System

## Overview

Open Notebook uses JWT (JSON Web Tokens) for stateless authentication with Argon2 password hashing.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser   │◄────►│   Backend    │◄────►│  SurrealDB   │
│  (Frontend) │      │  (FastAPI)   │      │  (Database)  │
└─────────────┘      └──────────────┘      └──────────────┘
      │                     │                      │
      │ 1. Login           │                      │
      │─────────────────►  │                      │
      │                    │ 2. Verify Password   │
      │                    │─────────────────────►│
      │                    │◄─────────────────────│
      │ 3. Return JWT      │                      │
      │◄─────────────────  │                      │
      │                    │                      │
      │ 4. API Request     │                      │
      │    + JWT Token     │                      │
      │─────────────────►  │                      │
      │                    │ 5. Validate JWT      │
      │                    │ 6. Get User          │
      │                    │─────────────────────►│
      │                    │◄─────────────────────│
      │ 7. Response        │                      │
      │◄─────────────────  │                      │
```

## Components

### 1. User Model
**Location:** `open_notebook/domain/user.py`

```python
class User:
    id: str                    # Unique user ID (SurrealDB RecordID)
    email: str                 # Email (unique)
    hashed_password: str       # Argon2 hash
    name: Optional[str]        # Display name
    is_active: bool            # Account status
    is_admin: bool             # Admin privileges
    onboarding_complete: bool  # Setup wizard completed
    created: datetime          # Account creation
    updated: datetime          # Last update
```

### 2. Security Module
**Location:** `api/security.py`

Key functions:
- `get_password_hash(password)` - Hash password with Argon2
- `verify_password(plain, hashed)` - Verify password
- `create_access_token(data)` - Generate JWT
- `get_current_user(token)` - Validate JWT and get user
- `get_current_active_user(user)` - Check if user is active
- `require_admin(user)` - Require admin role

### 3. Auth Router
**Location:** `api/routers/auth.py`

Endpoints:
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login and get token
- `POST /api/auth/token` - OAuth2-compatible token endpoint
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/onboarding/complete` - Complete setup

## Registration Flow

### Step 1: User Registration

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**Backend Process:**
```python
# 1. Check if registration is allowed
if not registrations_allowed():
    raise HTTPException(403, "Registration disabled")

# 2. Check if email already exists
existing = await User.find_by_email(email)
if existing:
    raise HTTPException(400, "Email already registered")

# 3. Hash password with Argon2
hashed = get_password_hash(password)

# 4. Create user record
user = User(
    email=email,
    hashed_password=hashed,
    name=name,
    is_active=True,
    is_admin=False,
    onboarding_complete=False
)
await user.save()

# 5. Generate JWT token
token = create_access_token({"sub": user.id})

# 6. Return user + token
return {
    "user": user,
    "access_token": token,
    "token_type": "bearer"
}
```

**Response:**
```json
{
  "user": {
    "id": "user:abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "is_active": true,
    "is_admin": false,
    "onboarding_complete": false
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Step 2: Frontend Stores Token

```typescript
// frontend/src/lib/hooks/use-auth.ts

// Store in localStorage
localStorage.setItem('auth-storage', JSON.stringify({
  state: {
    user: userData,
    accessToken: token,
    isAuthenticated: true
  }
}));

// Axios interceptor adds to all requests
config.headers.Authorization = `Bearer ${token}`;
```

## Login Flow

### Step 1: User Login

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Backend Process:**
```python
# 1. Find user by email
user = await User.find_by_email(email)
if not user:
    raise HTTPException(401, "Invalid credentials")

# 2. Verify password
if not verify_password(password, user.hashed_password):
    raise HTTPException(401, "Invalid credentials")

# 3. Check if active
if not user.is_active:
    raise HTTPException(403, "Account disabled")

# 4. Generate JWT token
token = create_access_token({
    "sub": user.id  # User ID in "subject" claim
})

# 5. Return user + token
return {
    "user": user,
    "access_token": token,
    "token_type": "bearer"
}
```

### Step 2: Token Generation

```python
def create_access_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    
    # Token expires in 24 hours (configurable)
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES  # Default: 1440
    )
    
    # Add expiration claim
    to_encode.update({"exp": expire})
    
    # Sign with secret key (HS256)
    encoded_jwt = jwt.encode(
        to_encode,
        get_secret_key(),  # From JWT_SECRET env var
        algorithm="HS256"
    )
    
    return encoded_jwt
```

## Protected Routes

### Backend Protection

```python
# api/routers/notebooks.py

@router.get("/notebooks")
async def get_notebooks(
    current_user: User = Depends(get_current_active_user)
):
    # current_user is automatically injected
    # If token is invalid/expired, 401 error is raised
    
    notebooks = await Notebook.find_by_owner(current_user.id)
    return notebooks
```

### Token Validation Flow

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    # 1. Decode JWT
    try:
        payload = jwt.decode(
            token,
            get_secret_key(),
            algorithms=["HS256"]
        )
    except JWTError:
        raise HTTPException(401, "Invalid token")
    
    # 2. Extract user ID from "sub" claim
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token")
    
    # 3. Get user from database
    user = await User.get(user_id)
    if not user:
        raise HTTPException(401, "User not found")
    
    # 4. Check if active
    if not user.is_active:
        raise HTTPException(401, "Account disabled")
    
    return user
```

## Security Features

### 1. Password Hashing (Argon2)

**Why Argon2?**
- Winner of Password Hashing Competition
- Resistant to GPU cracking attacks
- Memory-hard algorithm
- Better than bcrypt/scrypt

**Configuration:**
```python
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["argon2"],  # Argon2 algorithm
    deprecated="auto"     # Auto-upgrade old hashes
)
```

**Example Hash:**
```
$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
│         │      │                │       └─ Hash output
│         │      │                └───────── Base64-encoded salt
│         │      └──────────────────────── Parameters (memory, time, parallelism)
│         └─────────────────────────────── Version
└───────────────────────────────────────── Algorithm variant (argon2id)
```

### 2. JWT Configuration

**Token Structure:**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user:abc123",    // User ID
    "exp": 1736294400        // Expiration timestamp
  },
  "signature": "..."         // HMAC-SHA256 signature
}
```

**Security Settings:**
- **Algorithm:** HS256 (HMAC with SHA-256)
- **Expiry:** 24 hours (1440 minutes)
- **Secret:** From `JWT_SECRET` env var (auto-generated by Render)
- **Storage:** localStorage (XSS risk mitigated by CSP)

### 3. Password Requirements

**Validation (Frontend):**
```typescript
// Minimum requirements
const schema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[a-z]/, "Must contain lowercase letter")
    .regex(/[0-9]/, "Must contain number")
});
```

**Backend (API Routers):**
No additional validation - frontend handles it
Could add zxcvbn for strength scoring

### 4. Token Expiry

**Current Settings:**
- **Default:** 24 hours (1440 minutes)
- **Configurable:** `JWT_EXPIRES_MINUTES` env var
- **No Refresh:** User must re-login after expiry

**Future Enhancement:**
Implement refresh tokens for "remember me" functionality

### 5. CORS Protection

**Current Settings:**
```python
# api/main.py
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins.split(","),
    allow_credentials=True,  # Allow cookies/auth headers
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)
```

**Production Recommendation:**
```yaml
# render.yaml
- key: ALLOWED_ORIGINS
  value: "https://ephitup.onrender.com"
```

## Session Management

### Token Lifecycle

```
User logs in
  ↓
Token generated (expires in 24h)
  ↓
Token stored in localStorage
  ↓
Token sent with each API request
  ↓
Backend validates token
  ↓
[After 24 hours]
  ↓
Token expires → 401 Unauthorized
  ↓
Frontend redirects to /login
  ↓
User must login again
```

### Logout Flow

```typescript
// frontend/src/lib/hooks/use-auth.ts

function logout() {
  // 1. Clear localStorage
  localStorage.removeItem('auth-storage');
  
  // 2. Clear cookie (if any)
  document.cookie = 'auth-token=; path=/; max-age=0';
  
  // 3. Reset state
  setState({
    user: null,
    accessToken: null,
    isAuthenticated: false
  });
  
  // 4. Redirect to login
  router.push('/login');
}
```

**Note:** No server-side logout needed (stateless JWT)

## Admin Privileges

### Admin User Creation

**First User = Admin:**
```python
# Automatic in registration
is_admin = await User.count() == 0  # True if first user
```

**Manual Admin Grant:**
```sql
-- SurrealDB query
UPDATE user:xyz SET is_admin = true;
```

### Admin-Only Endpoints

```python
@router.get("/admin/users")
async def list_users(
    admin: User = Depends(require_admin)  # Requires is_admin=true
):
    users = await User.list()
    return users
```

## Security Best Practices

### ✅ Implemented
1. Argon2 password hashing
2. JWT with expiration
3. HTTPS in production (Render)
4. CORS configuration
5. Password requirements
6. Active user check
7. Email uniqueness

### ⚠️ Recommended Enhancements
1. **Rate Limiting** - Prevent brute force
2. **Refresh Tokens** - Better UX
3. **Email Verification** - Confirm ownership
4. **2FA** - Extra security layer
5. **Password Reset** - Forgot password flow
6. **Session Invalidation** - Logout all devices
7. **Audit Logging** - Track auth events

## Common Issues

### Issue 1: Token Expired
**Symptom:** 401 Unauthorized after 24 hours
**Solution:** User must login again (expected behavior)
**Enhancement:** Add refresh token

### Issue 2: JWT_SECRET Changed
**Symptom:** All users logged out after deployment
**Solution:** Render persists JWT_SECRET (shouldn't happen)
**Check:** Verify JWT_SECRET in Render dashboard

### Issue 3: CORS Errors
**Symptom:** "CORS policy" errors in browser
**Solution:** Add frontend domain to ALLOWED_ORIGINS
```yaml
- key: ALLOWED_ORIGINS
  value: "https://your-domain.com"
```

### Issue 4: Password Not Accepted
**Symptom:** Login fails with correct password
**Possible Causes:**
- Password changed in database directly
- Hash algorithm mismatch
- Database corruption
**Solution:** Reset password or recreate user

## Testing Authentication

### Manual Testing

```bash
# 1. Register user
curl -X POST http://localhost:5055/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test"}'

# 2. Save token from response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 3. Access protected endpoint
curl http://localhost:5055/api/notebooks \
  -H "Authorization: Bearer $TOKEN"
```

### Automated Testing

```python
# tests/test_auth.py
import pytest
from fastapi.testclient import TestClient

def test_registration(client: TestClient):
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "Test123!",
        "name": "Test User"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login(client: TestClient):
    # Register first
    client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "Test123!"
    })
    
    # Then login
    response = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "Test123!"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_protected_route(client: TestClient, auth_token: str):
    response = client.get(
        "/api/notebooks",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
```

## Related Documentation
- [Backend API Routers](./API_ROUTERS.md)
- [Frontend Auth Flow](./FRONTEND_ARCHITECTURE.md#authentication)
- [Security Configuration](./SECURITY_GUIDE.md)



