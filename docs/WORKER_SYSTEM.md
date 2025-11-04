# Worker System

## Overview

The worker system handles long-running background tasks using a database-driven command queue with SurrealDB live queries.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    API Process                           │
│                                                           │
│  User Request → Create Command Record in Database        │
│                 (status: "new")                          │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Database Write
                   ▼
┌──────────────────────────────────────────────────────────┐
│              SurrealDB (Command Queue)                   │
│                                                           │
│  commands table:                                          │
│  ┌────────────────────────────────────────────┐         │
│  │ id: "command:abc123"                       │         │
│  │ app: "open_notebook"                       │         │
│  │ command: "process_source"                  │         │
│  │ status: "new" → "running" → "completed"    │         │
│  │ input: {...}                               │         │
│  │ output: {...}                              │         │
│  └────────────────────────────────────────────┘         │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Live Query (WebSocket)
                   ▼
┌──────────────────────────────────────────────────────────┐
│               Worker Process                              │
│                                                           │
│  1. Detect new command (live query)                      │
│  2. Claim command (status: "new" → "running")           │
│  3. Execute command handler                              │
│  4. Save result (status: "running" → "completed")       │
│  5. Wait for next command...                             │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. Command Service (API)

**Location:** `api/command_service.py`

```python
class CommandService:
    """
    Service for submitting background commands.
    Used by API to queue work for the worker.
    """
    
    @staticmethod
    async def submit_command_job(
        app_name: str,
        command_name: str,
        input_data: Dict[str, Any]
    ) -> str:
        """
        Submit a command to be executed by worker.
        
        Args:
            app_name: Application namespace (e.g., "open_notebook")
            command_name: Command to execute (e.g., "process_source")
            input_data: Command parameters
        
        Returns:
            Command ID for tracking
        """
        command_record = {
            "app": app_name,
            "command": command_name,
            "status": "new",
            "input": input_data,
            "created": datetime.now(timezone.utc),
            "updated": datetime.now(timezone.utc)
        }
        
        result = await repo_create("command", command_record)
        
        logger.info(f"Queued command: {app_name}.{command_name} → {result['id']}")
        
        return result["id"]
```

### 2. Command Registry

**Location:** `commands/` directory

```python
from surreal_commands import command, CommandInput, CommandOutput

# Define input/output schemas
class SourceProcessingInput(CommandInput):
    source_id: str
    content_state: Dict[str, Any]
    notebook_ids: List[str]
    transformations: List[str]
    embed: bool
    user_id: str

class SourceProcessingOutput(CommandOutput):
    success: bool
    source_id: str
    error_message: Optional[str] = None

# Register command
@command("open_notebook", "process_source")
async def process_source_command(
    input_data: SourceProcessingInput
) -> SourceProcessingOutput:
    """
    Process uploaded source (PDF, URL, text).
    
    This runs in the worker process, not the API.
    Can take minutes for large documents.
    """
    try:
        # Update source status
        source = await Source.get(input_data.source_id)
        source.status = "running"
        await source.save()
        
        # Execute processing graph
        from open_notebook.graphs.source import source_graph
        
        result = await source_graph.ainvoke({
            "source_id": input_data.source_id,
            "content_state": input_data.content_state,
            "notebook_ids": input_data.notebook_ids,
            "transformations": input_data.transformations,
            "embed": input_data.embed,
            "user_id": input_data.user_id
        })
        
        # Mark as completed
        source.status = "completed"
        await source.save()
        
        return SourceProcessingOutput(
            success=True,
            source_id=input_data.source_id
        )
        
    except Exception as e:
        logger.error(f"Source processing failed: {e}")
        
        # Mark as failed
        source.status = "failed"
        source.error_message = str(e)
        await source.save()
        
        return SourceProcessingOutput(
            success=False,
            source_id=input_data.source_id,
            error_message=str(e)
        )
```

### 3. Worker Process

**Location:** Started by `supervisord.single.conf`

```bash
# Worker startup (with 15s delay for DB initialization)
/app/start-worker.sh

# Which runs:
uv run surreal-commands-worker --import-modules commands
```

**Worker Startup Script:** `start-worker.sh`

```bash
#!/bin/bash
ENABLE_WORKER=${ENABLE_WORKER:-true}

if [ "$ENABLE_WORKER" = "false" ]; then
    echo "Worker disabled (ENABLE_WORKER=false)"
    echo "Document processing will not work!"
    sleep infinity
else
    echo "Worker enabled - starting after 15s delay..."
    sleep 15  # Wait for SurrealDB initialization
    echo "Starting surreal-commands-worker..."
    exec uv run surreal-commands-worker --import-modules commands
fi
```

### 4. Worker Main Loop

**Conceptual flow (handled by surreal-commands library):**

```python
async def worker_main_loop():
    """
    Main worker loop (simplified).
    Actual implementation in surreal-commands package.
    """
    # Connect to database
    async with db_connection() as db:
        
        # Setup live query for new commands
        async for command in db.live_query(
            "SELECT * FROM command WHERE status = 'new'"
        ):
            # Claim command
            await db.query(
                "UPDATE $command SET status = 'running'",
                {"command": command["id"]}
            )
            
            # Find registered handler
            handler = get_command_handler(
                command["app"],
                command["command"]
            )
            
            # Execute handler
            try:
                result = await handler(command["input"])
                
                # Save result
                await db.query(
                    "UPDATE $command SET status = 'completed', output = $output",
                    {"command": command["id"], "output": result}
                )
            except Exception as e:
                # Save error
                await db.query(
                    "UPDATE $command SET status = 'failed', error = $error",
                    {"command": command["id"], "error": str(e)}
                )
```

## Registered Commands

### 1. process_source (Critical)

**Purpose:** Extract content from uploaded documents/URLs
**Frequency:** Every time user uploads a file
**Duration:** 5-30 seconds
**Priority:** 🔴 Critical

```python
@command("open_notebook", "process_source")
async def process_source_command(input_data: SourceProcessingInput):
    # Extract text from PDF/URL
    # Generate embeddings
    # Apply transformations
```

### 2. generate_podcast (Optional)

**Purpose:** Create audio podcast from sources
**Frequency:** User-initiated
**Duration:** 5-15 minutes
**Priority:** 🟢 Optional

```python
@command("open_notebook", "generate_podcast")
async def generate_podcast_command(input_data: PodcastGenerationInput):
    # Generate briefing with LLM
    # Create dialogue
    # Synthesize audio with TTS
    # Save to /mydata/podcasts/
```

### 3. embed_single_item (Important)

**Purpose:** Generate embedding for single text item
**Frequency:** On-demand
**Duration:** 1-5 seconds
**Priority:** 🟡 Important

```python
@command("open_notebook", "embed_single_item")
async def embed_single_item_command(input_data: EmbedItemInput):
    # Generate embedding vector
    # Save to database
```

### 4. rebuild_embeddings (Maintenance)

**Purpose:** Regenerate all embeddings (e.g., model change)
**Frequency:** Rarely (manual trigger)
**Duration:** Minutes to hours
**Priority:** 🟢 Optional

```python
@command("open_notebook", "rebuild_embeddings")
async def rebuild_embeddings_command(input_data: RebuildEmbeddingsInput):
    # Get all chunks
    # Regenerate embeddings
    # Update database
```

### 5. process_text (Important)

**Purpose:** Apply AI transformation to text
**Frequency:** User-initiated
**Duration:** 5-30 seconds
**Priority:** 🟡 Important

```python
@command("open_notebook", "process_text")
async def process_text_command(input_data: ProcessTextInput):
    # Call LLM with prompt
    # Save result
```

### 6. analyze_data (Optional)

**Purpose:** Run data analysis
**Frequency:** User-initiated
**Duration:** Variable
**Priority:** 🟢 Optional

```python
@command("open_notebook", "analyze_data")
async def analyze_data_command(input_data: AnalyzeDataInput):
    # Perform analysis
    # Return insights
```

## Command Lifecycle

### Complete Flow

```
1. API: User uploads document.pdf
   ↓
2. API: Create command record
   INSERT INTO command {
     app: "open_notebook",
     command: "process_source",
     status: "new",
     input: {source_id: "source:abc123", ...}
   }
   ↓
3. Worker: Live query detects new command
   SELECT * FROM command WHERE status = 'new'
   ↓
4. Worker: Claim command
   UPDATE command:xyz SET status = 'running'
   ↓
5. Worker: Execute handler
   result = await process_source_command(input)
   ↓
6. Worker: Save result
   UPDATE command:xyz SET 
     status = 'completed',
     output = result,
     completed_at = now()
   ↓
7. API/Frontend: Poll for status
   SELECT status FROM command WHERE id = 'command:xyz'
   → Returns: "completed"
```

### Status Values

```python
class CommandStatus(str, Enum):
    NEW = "new"            # Just created, waiting for worker
    RUNNING = "running"    # Worker is processing
    COMPLETED = "completed"  # Successfully finished
    FAILED = "failed"      # Error occurred
    CANCELLED = "cancelled"  # Manually cancelled
```

### Timing Example

```
00:00 - User uploads PDF
00:01 - API creates command (status: "new")
00:02 - Worker detects command
00:02 - Worker claims command (status: "running")
00:02-00:15 - Worker extracts content
00:15-00:20 - Worker generates embeddings
00:20 - Worker saves result (status: "completed")
00:21 - Frontend polls, sees completion
00:21 - User sees extracted content
```

## Worker Configuration

### Environment Variables

```bash
# Database connection (same as API)
SURREAL_URL=ws://localhost:8000/rpc
SURREAL_USER=root
SURREAL_PASSWORD=<secret>
SURREAL_NAMESPACE=open_notebook
SURREAL_DATABASE=production

# Worker control
ENABLE_WORKER=true  # Set to false to disable

# AI provider keys (for embeddings, transformations)
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
GEMINI_API_KEY=<key>

# S3 storage (for podcasts)
S3_BUCKET_NAME=<bucket>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

### Startup Configuration

**supervisord.single.conf:**

```ini
[program:worker]
# Worker handles background tasks (document processing, podcasts)
# Waits 15s to ensure SurrealDB is fully initialized
command=/app/start-worker.sh
stdout_logfile=/dev/stdout
stderr_logfile=/dev/stderr
autorestart=true
priority=20  # Starts after SurrealDB and API
autostart=true
startsecs=18  # Must stay up 18s to be considered "running"
passenv=SURREAL_URL,SURREAL_USER,SURREAL_PASSWORD,SURREAL_NAMESPACE,SURREAL_DATABASE,FERNET_SECRET_KEY,S3_BUCKET_NAME,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,ENABLE_WORKER
```

### Concurrency

**Current Setup:** Single worker, processes one command at a time

**Configuration:**
```bash
# Worker can handle up to 5 concurrent tasks
surreal-commands-worker --import-modules commands --max-tasks 5
```

**Scaling:**
- Single container: 1 worker, 5 concurrent tasks
- Multiple containers: Each has 1 worker
- Future: Dedicated worker containers

## Error Handling

### Worker Failures

#### 1. Worker Crash

**Symptom:** Commands stuck in "running" status
**Detection:** Supervisord restarts worker automatically
**Recovery:** 
```python
# On startup, reset stale commands
await db.query("""
    UPDATE command 
    SET status = 'new' 
    WHERE status = 'running' 
    AND updated < time::now() - 5m
""")
```

#### 2. Command Timeout

**Prevention:** Set reasonable timeouts
```python
@command("open_notebook", "process_source", timeout=300)  # 5 minutes
async def process_source_command(input_data):
    # Will be cancelled if exceeds 5 minutes
```

#### 3. Database Connection Lost

**Handling:** Connection retry logic in repository layer
```python
# db_connection() retries 3 times with exponential backoff
async with db_connection() as db:
    # Automatic retry on connection failure
```

#### 4. Out of Memory

**Symptom:** Worker killed by system
**Prevention:**
- Process large files in chunks
- Use streaming for API calls
- Limit concurrent tasks
**Monitoring:** Check Render logs for OOM errors

### Command-Specific Errors

#### Source Processing Failure

```python
try:
    content = await extract_content(file_path)
except ExtractionError as e:
    # Save error to source
    source.status = "failed"
    source.error_message = f"Could not extract content: {e}"
    await source.save()
    
    # Return failed output
    return SourceProcessingOutput(
        success=False,
        error_message=str(e)
    )
```

#### Podcast Generation Failure

```python
try:
    audio_path = await generate_audio(dialogue)
except TTSError as e:
    # Save partial result
    episode.status = "failed"
    episode.error = f"TTS failed: {e}"
    await episode.save()
    
    return PodcastOutput(
        success=False,
        error_message=str(e)
    )
```

## Monitoring

### Worker Health

**Check if worker is running:**
```bash
# Via supervisord
supervisorctl status worker
# Output: worker    RUNNING   pid 123, uptime 1:23:45

# Via process list
ps aux | grep surreal-commands-worker
```

**Check recent commands:**
```sql
-- SurrealDB query
SELECT * FROM command 
ORDER BY created DESC 
LIMIT 10;
```

### Performance Metrics

**Average processing time:**
```sql
SELECT 
    command,
    math::round(avg(completed_at - created)) AS avg_duration_seconds,
    count() AS total_commands
FROM command
WHERE status = 'completed'
GROUP BY command;
```

**Failure rate:**
```sql
SELECT 
    command,
    math::round((count(FILTER status = 'failed') / count()) * 100) AS failure_rate_percent
FROM command
GROUP BY command;
```

### Logs

**Worker logs:**
```bash
# Render dashboard: View logs, filter by "worker"
# Or via supervisord:
tail -f /var/log/supervisor/worker-stdout.log
```

**Common log patterns:**
```
✅ Success:
Worker: Processing command open_notebook.process_source
Worker: Command completed successfully

❌ Failure:
Worker: Processing command open_notebook.generate_podcast
Worker: Command failed: TTSError: Rate limit exceeded

⚠️ Warning:
Worker: Connection retry 1/3...
Worker: Connected successfully
```

## Debugging

### Debug Mode

```bash
# Enable debug logging
DEBUG=true surreal-commands-worker --import-modules commands
```

### Manual Command Execution

```python
# Test command without worker
from commands.source_commands import process_source_command, SourceProcessingInput

input_data = SourceProcessingInput(
    source_id="source:test123",
    content_state={"url": "https://example.com"},
    notebook_ids=[],
    transformations=[],
    embed=False,
    user_id="user:abc"
)

result = await process_source_command(input_data)
print(result)
```

### Inspect Command Queue

```sql
-- See all pending commands
SELECT * FROM command WHERE status = 'new';

-- See running commands
SELECT * FROM command WHERE status = 'running';

-- See failed commands
SELECT * FROM command 
WHERE status = 'failed' 
ORDER BY created DESC 
LIMIT 10;
```

### Retry Failed Command

```sql
-- Reset failed command to retry
UPDATE command:xyz SET status = 'new', error = null;
-- Worker will pick it up automatically
```

## Best Practices

### 1. Idempotent Commands

Commands should be safe to run multiple times:

```python
@command("open_notebook", "embed_source")
async def embed_source(input_data):
    source = await Source.get(input_data.source_id)
    
    # Check if already embedded
    if source.embedded_chunks > 0:
        logger.info("Source already embedded, skipping")
        return EmbedOutput(success=True, skipped=True)
    
    # Generate embeddings...
```

### 2. Progress Updates

For long-running tasks, update status:

```python
@command("open_notebook", "process_large_file")
async def process_large_file(input_data):
    source = await Source.get(input_data.source_id)
    
    # Update progress
    source.processing_progress = "Extracting text..."
    await source.save()
    
    # ... do work ...
    
    source.processing_progress = "Generating embeddings..."
    await source.save()
    
    # ... more work ...
```

### 3. Resource Cleanup

Always cleanup resources:

```python
@command("open_notebook", "process_temp_file")
async def process_temp_file(input_data):
    temp_file = input_data.file_path
    
    try:
        # Process file
        content = await extract_content(temp_file)
        return ProcessOutput(success=True)
        
    finally:
        # Always cleanup
        if os.path.exists(temp_file):
            os.unlink(temp_file)
```

### 4. User Context

Use provider_env for user-specific API keys:

```python
from open_notebook.utils.provider_env import user_provider_context

@command("open_notebook", "generate_summary")
async def generate_summary(input_data):
    # Use user's API keys, not system keys
    async with user_provider_context(input_data.user_id):
        llm = await get_llm()  # Uses user's OpenAI key
        summary = await llm.ainvoke("Summarize: {text}")
```

## Related Documentation
- [Source Processing](./SOURCE_PROCESSING.md)
- [Podcast Generation](./PODCAST_GENERATION.md)
- [Command Queue Architecture](./COMMAND_QUEUE.md)
- [Troubleshooting Workers](../troubleshooting/worker-issues.md)



