# Source Processing Workflow - Complete Explanation

## What Should Happen When You Add a Source

### 1. **Source Creation** (`POST /api/sources`)
When you add a source (URL, file, or text), the API:
- Creates a source record in the database
- Saves uploaded files to disk
- Submits a background processing command
- Returns immediately with status: "queued"

### 2. **Background Processing** (Background command execution)

The `process_source_command` runs asynchronously and executes the `source_graph`:

#### Node 1: **content_process**
- Extracts content from the URL/file
- Uses `content-core` library (handles PDF, audio, video, etc.)
- Outputs markdown content
- **Does NOT need API keys** - pure content extraction

#### Node 2: **save_source**
- Saves the extracted content to the source record
- Updates the `full_text` field
- **If `embed=true`**: Generates embeddings using AI model
  - **REQUIRES API KEY** (for embedding model)
- Creates notebook associations (source → notebook edges)

#### Node 3: **transform_content** (conditional)
- Only runs if you selected transformations
- Applies AI transformations (summaries, insights, etc.)
- **REQUIRES API KEY** (for LLM model)
- Adds results as "insights" to the source

### 3. **Status Tracking**

The frontend polls the source status via `/api/sources/{id}/status`:
- **queued**: Command submitted, waiting to start
- **running**: Processing in progress
- **completed**: Success! Content extracted and saved
- **failed**: Error occurred (check error message)

## Why Your Source Might Be Stuck

### Possible Issues:

1. **No API Keys** ❌ 
   - Problem: Embedding/transformation steps fail silently
   - Solution: Add API keys in Settings → Provider Keys
   - Status: **FIXED** (we updated `list_for_user` to properly load keys)

2. **Content Extraction Failing**
   - Problem: URL timeout, file corruption, unsupported format
   - Solution: Try a different URL/file
   - Check: Server logs for extraction errors

3. **Command Never Started**
   - Problem: Background worker not running
   - Solution: Check if `surreal-commands-worker` is running
   - Check: `ps aux | grep surreal-commands-worker`

4. **Embedding/Transformation Stuck**
   - Problem: AI model call hanging or slow
   - Solution: Check API rate limits, model availability
   - Check: Backend logs for API errors

5. **Silent Failure**
   - Problem: Error not being logged properly
   - Solution: Check command status via `/api/commands/jobs/{command_id}`

## How to Check What's Actually Happening

### Check Command Status:
```bash
# Get the command ID from your source
curl http://localhost:5056/api/sources/source:7lvhn3lawu8do5m6r7dd

# Check command status  
curl http://localhost:5056/api/commands/jobs/{command_id}
```

### Check Backend Logs:
```bash
# Look for source processing messages
# The logs show each step
```

### Restart to Apply Fixes:
After the fixes we made:
1. Restart backend (Ctrl+C, start again)
2. The API key loading now works properly
3. Try adding a new source - it should work
4. Old stuck sources: Use the "Retry" button

## Next Steps to Fix Your Stuck Source

1. **Restart backend** to apply API key fixes
2. **Add API keys** if you haven't: Settings → Provider Keys
3. **Click "Retry" button** on the stuck source (in UI)
4. **Wait for processing** to complete (can take 1-2 minutes)
5. **Check status** - should show "completed"

## What You Need

For source processing to work, you need:
- ✅ Valid API key (we fixed the loading)
- ✅ For embeddings: Embedding model API key (e.g., OpenAI, Voyage, etc.)
- ✅ For transformations: LLM API key (e.g., OpenAI, Anthropic, etc.)

Without API keys, sources will extract content but won't generate embeddings or insights.

