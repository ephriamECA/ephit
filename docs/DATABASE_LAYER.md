# Database Layer

## Overview

Open Notebook uses **SurrealDB**, a multi-model database that combines document, graph, and relational paradigms.

## Architecture

```
┌─────────────────────────────────────────────┐
│           Application Layer                  │
│  (FastAPI, Worker, Domain Models)           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Repository Layer                     │
│  (open_notebook/database/repository.py)     │
│                                              │
│  • db_connection()      • repo_query()      │
│  • repo_create()        • repo_update()     │
│  • repo_delete()        • repo_relate()     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         SurrealDB Python Client              │
│  (AsyncSurreal - WebSocket connection)      │
└──────────────────┬──────────────────────────┘
                   │ ws://localhost:8000/rpc
┌──────────────────▼──────────────────────────┐
│              SurrealDB Server                │
│  • Query Engine  • Storage Engine           │
│  • Indexing      • Live Queries             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              RocksDB Storage                 │
│      /mydata/mydatabase.db                  │
└──────────────────────────────────────────────┘
```

## Connection Management

### Configuration

**Location:** `open_notebook/database/repository.py`

```python
def get_database_url() -> str:
    """
    Get database URL with fallback logic.
    Priority:
    1. SURREAL_URL env var
    2. Construct from SURREAL_ADDRESS + SURREAL_PORT
    """
    surreal_url = os.getenv("SURREAL_URL")
    if surreal_url:
        return surreal_url  # e.g., "ws://localhost:8000/rpc"
    
    # Fallback (backward compatibility)
    address = os.getenv("SURREAL_ADDRESS", "localhost")
    port = os.getenv("SURREAL_PORT", "8000")
    return f"ws://{address}:{port}/rpc"

def get_database_password() -> Optional[str]:
    """Get password with fallback."""
    return os.getenv("SURREAL_PASSWORD") or os.getenv("SURREAL_PASS")
```

### Connection with Retry Logic

```python
@asynccontextmanager
async def db_connection():
    """
    Create database connection with automatic retry.
    
    Features:
    - Retry up to 3 times with exponential backoff
    - Handles startup race conditions
    - Auto-closes connection on exit
    """
    max_retries = 3
    retry_delay = 2  # seconds
    
    db = None
    for attempt in range(max_retries):
        try:
            # 1. Create connection
            db = AsyncSurreal(get_database_url())
            
            # 2. Authenticate
            await db.signin({
                "username": os.environ.get("SURREAL_USER", "root"),
                "password": get_database_password() or "root",
            })
            
            # 3. Select namespace and database
            await db.use(
                os.environ.get("SURREAL_NAMESPACE", "open_notebook"),
                os.environ.get("SURREAL_DATABASE", "production")
            )
            
            break  # Success!
            
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"DB connection attempt {attempt + 1} failed: {e}")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logger.error(f"DB connection failed after {max_retries} attempts")
                raise
    
    try:
        yield db  # Provide connection to caller
    finally:
        if db:
            await db.close()  # Always cleanup
```

### Usage Example

```python
# Simple query
async with db_connection() as db:
    result = await db.query("SELECT * FROM user WHERE email = $email", {
        "email": "user@example.com"
    })
    print(result)

# Using repository functions
notebooks = await repo_query(
    "SELECT * FROM notebook WHERE owner = $owner",
    {"owner": user_id}
)
```

## Data Models

### Database Schema

```
open_notebook namespace
  └── production database
      ├── user              # User accounts
      ├── notebook          # User notebooks
      ├── source            # Documents, URLs, text
      ├── note              # User notes
      ├── asset             # Extracted content
      ├── chunk             # Text chunks for embeddings
      ├── transformation    # AI transformation configs
      ├── podcast_episode   # Generated podcasts
      ├── episode_profile   # Podcast templates
      ├── speaker_profile   # Voice configurations
      ├── user_provider_secret  # Encrypted API keys
      ├── model             # AI model configurations
      └── command           # Background job queue
```

### Relationships (Graph)

```
user ──owns──► notebook
             │
             └──contains──► source
                          │
                          ├──has_content──► asset
                          │
                          └──chunked_into──► chunk
                                           │
                                           └──embedded_with──► embedding_vector

source ──applied──► transformation ──produces──► insight

episode_profile ──used_for──► podcast_episode
speaker_profile ──voices──► podcast_episode
```

## Repository Functions

### Core Operations

#### 1. Query (SELECT)

```python
async def repo_query(
    query_str: str,
    vars: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Execute SurrealQL query and return results.
    
    Args:
        query_str: SurrealQL query
        vars: Query parameters (prevents injection)
    
    Returns:
        List of result records
    """
    async with db_connection() as connection:
        result = await connection.query(query_str, vars)
        return parse_record_ids(result)  # Convert RecordIDs to strings

# Example usage
users = await repo_query(
    "SELECT * FROM user WHERE is_admin = $admin",
    {"admin": True}
)
```

#### 2. Create (INSERT)

```python
async def repo_create(
    table: str,
    data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Create new record in table.
    
    Args:
        table: Table name
        data: Record data
    
    Returns:
        Created record with generated ID
    """
    data.pop("id", None)  # Remove ID if present
    data["created"] = datetime.now(timezone.utc)
    data["updated"] = datetime.now(timezone.utc)
    
    async with db_connection() as connection:
        return await connection.insert(table, data)

# Example usage
user = await repo_create("user", {
    "email": "user@example.com",
    "hashed_password": "...",
    "name": "John Doe"
})
# Returns: {"id": "user:abc123", "email": "...", ...}
```

#### 3. Update (UPDATE)

```python
async def repo_update(
    table: str,
    id: str,
    data: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Update existing record.
    
    Args:
        table: Table name
        id: Record ID (with or without table prefix)
        data: Fields to update
    
    Returns:
        Updated record
    """
    # Handle ID format (user:123 or just 123)
    record_id = f"{table}:{id}" if ":" not in id else id
    
    data.pop("id", None)  # Don't update ID
    data["updated"] = datetime.now(timezone.utc)
    
    query = f"UPDATE {record_id} MERGE $data;"
    return await repo_query(query, {"data": data})

# Example usage
updated = await repo_update("user", "abc123", {
    "name": "Jane Doe"
})
```

#### 4. Delete (DELETE)

```python
async def repo_delete(record_id: Union[str, RecordID]):
    """
    Delete record by ID.
    
    Args:
        record_id: Full record ID (e.g., "user:abc123")
    """
    async with db_connection() as connection:
        return await connection.delete(ensure_record_id(record_id))

# Example usage
await repo_delete("user:abc123")
```

#### 5. Relate (RELATE - Graph)

```python
async def repo_relate(
    source: str,
    relationship: str,
    target: str,
    data: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Create graph relationship between records.
    
    Args:
        source: Source record ID
        relationship: Relationship name
        target: Target record ID
        data: Optional relationship metadata
    
    Returns:
        Created relationship record
    """
    query = f"RELATE {source}->{relationship}->{target} CONTENT $data;"
    return await repo_query(query, {"data": data or {}})

# Example usage
await repo_relate(
    "user:abc123",
    "owns",
    "notebook:xyz789",
    {"created_at": datetime.now()}
)

# Query relationships
notebooks = await repo_query(
    "SELECT ->owns->notebook.* AS notebooks FROM $user",
    {"user": "user:abc123"}
)
```

#### 6. Upsert (INSERT or UPDATE)

```python
async def repo_upsert(
    table: str,
    id: Optional[str],
    data: Dict[str, Any],
    add_timestamp: bool = False
) -> List[Dict[str, Any]]:
    """
    Create if not exists, update if exists.
    
    Args:
        table: Table name
        id: Record ID (None for new record)
        data: Record data
        add_timestamp: Whether to update 'updated' field
    """
    if add_timestamp:
        data["updated"] = datetime.now(timezone.utc)
    
    query = f"UPSERT {id if id else table} MERGE $data;"
    return await repo_query(query, {"data": data})

# Example usage
result = await repo_upsert("user", "user:abc123", {
    "last_login": datetime.now()
}, add_timestamp=True)
```

## Domain Models

### Base Model Pattern

**Location:** `open_notebook/domain/base.py`

```python
class DomainModel:
    """
    Base class for all domain models.
    Provides CRUD operations using repository layer.
    """
    _table_name: str  # SurrealDB table name
    
    @classmethod
    async def get(cls, id: str):
        """Get single record by ID."""
        results = await repo_query(
            f"SELECT * FROM {cls._table_name} WHERE id = $id",
            {"id": id}
        )
        return cls(**results[0]) if results else None
    
    @classmethod
    async def list(cls, limit: int = 100):
        """Get all records."""
        results = await repo_query(
            f"SELECT * FROM {cls._table_name} LIMIT {limit}"
        )
        return [cls(**r) for r in results]
    
    async def save(self):
        """Create or update record."""
        data = self.model_dump(exclude={"id"})
        
        if hasattr(self, "id") and self.id:
            # Update existing
            result = await repo_update(self._table_name, self.id, data)
        else:
            # Create new
            result = await repo_create(self._table_name, data)
            self.id = result["id"]
        
        return self
    
    async def delete(self):
        """Delete record."""
        if hasattr(self, "id") and self.id:
            await repo_delete(f"{self._table_name}:{self.id}")
```

### Example: User Model

**Location:** `open_notebook/domain/user.py`

```python
class User(BaseModel, DomainModel):
    _table_name = "user"
    
    id: Optional[str] = None
    email: str
    hashed_password: str
    name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    onboarding_complete: bool = False
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
    
    @classmethod
    async def find_by_email(cls, email: str) -> Optional["User"]:
        """Find user by email address."""
        results = await repo_query(
            "SELECT * FROM user WHERE email = $email LIMIT 1",
            {"email": email}
        )
        return cls(**results[0]) if results else None
    
    @classmethod
    async def count(cls) -> int:
        """Count total users."""
        results = await repo_query("SELECT count() FROM user GROUP ALL")
        return results[0]["count"] if results else 0

# Usage
user = await User.find_by_email("user@example.com")
user.name = "New Name"
await user.save()
```

## Migrations

### Migration System

**Location:** `open_notebook/database/async_migrate.py`

```python
class AsyncMigrationManager:
    """
    Manages database schema migrations.
    
    Features:
    - Automatic migration on startup
    - Version tracking in database
    - Up/down migrations support
    """
    
    async def get_current_version(self) -> int:
        """Get current schema version from database."""
        async with db_connection() as db:
            result = await db.query(
                "SELECT version FROM migration_version ORDER BY version DESC LIMIT 1"
            )
            return result[0]["version"] if result else 0
    
    async def needs_migration(self) -> bool:
        """Check if migrations are pending."""
        current = await self.get_current_version()
        latest = len(self.up_migrations)
        return current < latest
    
    async def run_migration_up(self):
        """Run all pending migrations."""
        current = await self.get_current_version()
        
        for version in range(current + 1, len(self.up_migrations) + 1):
            migration = self.up_migrations[version - 1]
            logger.info(f"Running migration {version}: {migration.name}")
            
            await migration.run(bump=True)
            logger.success(f"Migration {version} completed")
```

### Migration Files

**Location:** `migrations/*.surrealql`

```sql
-- migrations/01.surrealql
-- Create initial tables

DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON user TYPE string;
DEFINE FIELD hashed_password ON user TYPE string;
DEFINE FIELD name ON user TYPE option<string>;
DEFINE FIELD is_active ON user TYPE bool DEFAULT true;
DEFINE FIELD is_admin ON user TYPE bool DEFAULT false;
DEFINE FIELD created ON user TYPE datetime;
DEFINE FIELD updated ON user TYPE datetime;

-- Unique email index
DEFINE INDEX unique_email ON user COLUMNS email UNIQUE;

-- Auto-update timestamps
DEFINE EVENT user_updated ON TABLE user WHEN $before != $after THEN (
    UPDATE $after.id SET updated = time::now()
);
```

### Running Migrations

**Automatic (on startup):**
```python
# api/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    migration_manager = AsyncMigrationManager()
    
    if await migration_manager.needs_migration():
        logger.warning("Running database migrations...")
        await migration_manager.run_migration_up()
        logger.success("Migrations completed")
```

**Manual (CLI):**
```bash
# Run migrations
python3 -c "
from open_notebook.database.async_migrate import AsyncMigrationManager
import asyncio

async def migrate():
    manager = AsyncMigrationManager()
    await manager.run_migration_up()

asyncio.run(migrate())
"
```

## Performance Optimization

### 1. Indexing

```sql
-- Speed up lookups
DEFINE INDEX idx_user_email ON user COLUMNS email;
DEFINE INDEX idx_source_owner ON source COLUMNS owner;
DEFINE INDEX idx_notebook_owner ON notebook COLUMNS owner;

-- Full-text search
DEFINE INDEX idx_source_title_search ON source COLUMNS title SEARCH ANALYZER simple BM25;
```

### 2. Query Optimization

```python
# ❌ Bad: N+1 query problem
for notebook_id in notebook_ids:
    notebook = await Notebook.get(notebook_id)  # Separate query each time

# ✅ Good: Batch query
notebooks = await repo_query(
    "SELECT * FROM notebook WHERE id IN $ids",
    {"ids": notebook_ids}
)
```

### 3. Connection Pooling

SurrealDB Python client handles connection pooling internally.
Use context manager to ensure proper cleanup:

```python
# ✅ Good
async with db_connection() as db:
    result = await db.query("...")

# ❌ Bad (connection leak)
db = AsyncSurreal("...")
await db.signin(...)
# ... forgot to close
```

## Common Patterns

### 1. Ownership Filter

```python
# Get user's notebooks
notebooks = await repo_query(
    "SELECT * FROM notebook WHERE owner = $user_id",
    {"user_id": current_user.id}
)
```

### 2. Graph Traversal

```python
# Get notebook with all sources
result = await repo_query("""
    SELECT *,
        ->contains->source.* AS sources
    FROM notebook
    WHERE id = $notebook_id
""", {"notebook_id": notebook_id})
```

### 3. Aggregation

```python
# Count sources per notebook
stats = await repo_query("""
    SELECT 
        id,
        title,
        count(->contains->source) AS source_count
    FROM notebook
    WHERE owner = $user_id
    GROUP BY id
""", {"user_id": user_id})
```

## Troubleshooting

### Connection Issues

**Symptom:** `ValueError: '' is not a valid UrlScheme`
**Cause:** Database URL not set or malformed
**Solution:** Check environment variables
```bash
echo $SURREAL_URL  # Should be ws://localhost:8000/rpc
```

### Authentication Failures

**Symptom:** `Failed to verify signin credentials`
**Cause:** Wrong username/password
**Solution:** Check credentials match server
```bash
# Server started with:
surreal start --user root --pass root ...

# Client must match:
SURREAL_USER=root
SURREAL_PASSWORD=root
```

### Migration Failures

**Symptom:** API won't start, migration errors
**Solution:** Check migration files exist
```bash
ls -la migrations/
# Should see: 01.surrealql, 02.surrealql, etc.
```

## Related Documentation
- [Domain Models](./DOMAIN_MODELS.md)
- [Migrations Guide](./MIGRATIONS.md)
- [SurrealDB Queries](./SURREALDB_QUERIES.md)



