# Source Processing System

## Overview

Source processing is the core workflow for converting user inputs (PDFs, URLs, text) into searchable, AI-ready content.

## Architecture

```
┌─────────────────┐
│  User Uploads   │
│  PDF/URL/Text   │
└────────┬────────┘
         │
┌────────▼──────────────────────────────────────────────────┐
│              API Endpoint                                  │
│         POST /api/sources                                  │
│  • Saves file to /mydata/uploads/                         │
│  • Creates source record in database                       │
│  • Queues processing command                               │
└────────┬──────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────┐
│           Background Worker                                │
│  Executes: source_graph (LangGraph)                       │
│                                                            │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐│
│  │ 1. Extract   │─►│ 2. Save       │─►│ 3. Transform   ││
│  │    Content   │  │    Content    │  │    (Optional)  ││
│  └──────────────┘  └───────────────┘  └────────────────┘│
│        │                   │                    │         │
│  PDF, URL, Text      Store in DB       Generate insights │
│  → Markdown          + Embeddings                         │
└────────┬──────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────┐
│         Database (SurrealDB)                               │
│  • source (metadata)                                       │
│  • asset (extracted content)                               │
│  • chunk (for embeddings)                                  │
│  • insight (transformations)                               │
└────────────────────────────────────────────────────────────┘
```

## Flow Diagram

### Complete Processing Pipeline

```
User Action: Upload document.pdf
    ↓
╔═══════════════════════════════════════════════════════╗
║             STEP 1: API Endpoint                       ║
║         (api/routers/sources.py)                      ║
╚═══════════════════════════════════════════════════════╝
    ↓
1a. Validate file type/size
1b. Save to /mydata/uploads/document.pdf
1c. Create source record (status: "queued")
1d. Queue command: process_source
1e. Return immediately (async_processing=true)
    ↓
User sees: "Processing..." status
    ↓
╔═══════════════════════════════════════════════════════╗
║           STEP 2: Worker Detects Command              ║
║         (Worker live query on commands table)         ║
╚═══════════════════════════════════════════════════════╝
    ↓
2a. Worker picks up command (status: "new" → "running")
2b. Load command input (source_id, options)
2c. Execute source_graph (LangGraph)
    ↓
╔═══════════════════════════════════════════════════════╗
║      STEP 3: Content Extraction Node                  ║
║         (open_notebook/graphs/source.py)              ║
╚═══════════════════════════════════════════════════════╝
    ↓
3a. Determine content type (PDF, URL, text)
3b. Extract content:
    • PDF → Extract text with content-core
    • URL → Scrape with content-core
    • Text → Use as-is
3c. Convert to markdown
3d. Output: markdown_content
    ↓
╔═══════════════════════════════════════════════════════╗
║         STEP 4: Save Content Node                     ║
╚═══════════════════════════════════════════════════════╝
    ↓
4a. Update source with extracted content
4b. If embed=true:
    • Split into chunks
    • Generate embeddings with AI model
    • Store chunks in database
4c. Link source to notebooks
4d. Update status: "completed"
    ↓
╔═══════════════════════════════════════════════════════╗
║     STEP 5: Transform Content (Optional)              ║
╚═══════════════════════════════════════════════════════╝
    ↓
5a. If transformations selected:
    • For each transformation:
      - Load transformation prompt
      - Call LLM with content
      - Save insight to source
5b. Update source with insights
    ↓
User polls: GET /api/sources/{id}
User sees: Full content + insights
```

## Code Walkthrough

### 1. API Endpoint (Upload)

**Location:** `api/routers/sources.py` lines 341-614

```python
@router.post("/sources", response_model=SourceResponse)
async def create_source(
    form_data: tuple[SourceCreate, Optional[UploadFile]] = Depends(parse_source_form_data),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create source and queue processing.
    
    Supports:
    - type: "upload" (multipart form data)
    - type: "link" (URL to scrape)
    - type: "text" (direct text input)
    """
    source_data, upload_file = form_data
    
    # STEP 1: Handle file upload
    file_path = None
    if upload_file and source_data.type == "upload":
        file_path = await save_uploaded_file(upload_file)
        # Saves to: /mydata/uploads/filename.pdf
    
    # STEP 2: Prepare content_state
    content_state = {}
    if source_data.type == "link":
        content_state["url"] = source_data.url
    elif source_data.type == "upload":
        content_state["file_path"] = file_path
    elif source_data.type == "text":
        content_state["content"] = source_data.content
    
    # STEP 3: Async processing (default for frontend)
    if source_data.async_processing:
        # 3a. Create source record (status: queued)
        source = Source(
            title=source_data.title or "Processing...",
            owner=current_user.id,
            status="queued"
        )
        await source.save()
        
        # 3b. Queue command for worker
        command_input = SourceProcessingInput(
            source_id=str(source.id),
            content_state=content_state,
            notebook_ids=source_data.notebooks or [],
            transformations=source_data.transformations or [],
            embed=source_data.embed,
            user_id=current_user.id
        )
        
        command_id = await CommandService.submit_command_job(
            "open_notebook",
            "process_source",
            command_input.model_dump()
        )
        
        # 3c. Return immediately
        return SourceResponse(
            source=source,
            status="queued",
            command_id=command_id
        )
```

### 2. File Storage

**Location:** `api/routers/sources.py` lines 42-87

```python
def generate_unique_filename(original_filename: str, upload_folder: str) -> str:
    """
    Generate unique filename to prevent collisions.
    
    Example:
    - document.pdf → document.pdf (if not exists)
    - document.pdf → document (1).pdf (if exists)
    - document.pdf → document (2).pdf (if exists)
    """
    file_path = Path(upload_folder)
    stem = Path(original_filename).stem
    suffix = Path(original_filename).suffix
    
    counter = 0
    while True:
        if counter == 0:
            new_filename = original_filename
        else:
            new_filename = f"{stem} ({counter}){suffix}"
        
        full_path = file_path / new_filename
        if not full_path.exists():
            return str(full_path)
        counter += 1

async def save_uploaded_file(upload_file: UploadFile) -> str:
    """
    Save uploaded file to persistent storage.
    
    Storage location: /mydata/uploads/ (persistent across deployments)
    """
    file_path = generate_unique_filename(upload_file.filename, UPLOADS_FOLDER)
    
    # Write file in chunks (memory efficient)
    with open(file_path, "wb") as f:
        while chunk := await upload_file.read(8192):  # 8KB chunks
            f.write(chunk)
    
    return file_path
```

### 3. Worker Command

**Location:** `commands/source_commands.py`

```python
@command("open_notebook", "process_source")
async def process_source_command(
    input_data: SourceProcessingInput
) -> SourceProcessingOutput:
    """
    Background command to process source content.
    
    Executed by worker, not API directly.
    """
    try:
        # Update status to "running"
        source = await Source.get(input_data.source_id)
        source.status = "running"
        await source.save()
        
        # Execute source_graph (LangGraph workflow)
        from open_notebook.graphs.source import source_graph
        
        result = await source_graph.ainvoke({
            "source_id": input_data.source_id,
            "content_state": input_data.content_state,
            "notebook_ids": input_data.notebook_ids,
            "transformations": input_data.transformations,
            "embed": input_data.embed,
            "user_id": input_data.user_id
        })
        
        # Update status to "completed"
        source.status = "completed"
        await source.save()
        
        return SourceProcessingOutput(
            success=True,
            source_id=input_data.source_id
        )
        
    except Exception as e:
        # Update status to "failed"
        source.status = "failed"
        source.error_message = str(e)
        await source.save()
        
        return SourceProcessingOutput(
            success=False,
            source_id=input_data.source_id,
            error_message=str(e)
        )
```

### 4. Content Extraction (LangGraph)

**Location:** `open_notebook/graphs/source.py`

```python
async def content_process(state: SourceState) -> dict:
    """
    Node 1: Extract content from source.
    
    Supports:
    - PDF files (via pypdf, pdfminer)
    - URLs (web scraping)
    - Text (direct input)
    - Audio/Video (transcription)
    """
    content_state = state["content_state"]
    
    # Determine content type
    if "url" in content_state:
        # Extract from URL
        from content_core import get_content_from_url
        
        content = await get_content_from_url(
            content_state["url"],
            format="markdown"
        )
        
    elif "file_path" in content_state:
        # Extract from file
        from content_core import get_content_from_file
        
        content = await get_content_from_file(
            content_state["file_path"],
            format="markdown"
        )
        
        # Delete file if requested
        if content_state.get("delete_source"):
            os.unlink(content_state["file_path"])
    
    elif "content" in content_state:
        # Use text directly
        content = content_state["content"]
    
    return {
        "markdown_content": content,
        "extraction_complete": True
    }

async def save_source(state: SourceState) -> dict:
    """
    Node 2: Save extracted content to database.
    
    Tasks:
    - Update source with content
    - Generate embeddings (if requested)
    - Link to notebooks
    """
    source = await Source.get(state["source_id"])
    
    # Save content
    source.full_text = state["markdown_content"]
    source.content_length = len(state["markdown_content"])
    
    # Generate embeddings
    if state.get("embed"):
        from open_notebook.utils.embeddings import generate_embeddings
        
        # Split into chunks
        chunks = split_text(state["markdown_content"], chunk_size=1000)
        
        # Generate embeddings for each chunk
        for i, chunk_text in enumerate(chunks):
            embedding_vector = await generate_embeddings(chunk_text)
            
            # Save chunk with embedding
            chunk = Chunk(
                source_id=source.id,
                content=chunk_text,
                index=i,
                embedding=embedding_vector
            )
            await chunk.save()
        
        source.embedded_chunks = len(chunks)
    
    # Link to notebooks
    for notebook_id in state.get("notebook_ids", []):
        await repo_relate(
            source.id,
            "contains",
            notebook_id
        )
    
    await source.save()
    
    return {
        "save_complete": True
    }

async def transform_content(state: SourceState) -> dict:
    """
    Node 3: Apply AI transformations (optional).
    
    Transformations:
    - Summary
    - Key points
    - Questions
    - Custom prompts
    """
    if not state.get("transformations"):
        return {"transform_complete": True}
    
    source = await Source.get(state["source_id"])
    
    for trans_id in state["transformations"]:
        transformation = await Transformation.get(trans_id)
        
        # Call LLM with transformation prompt
        from langchain_core.messages import HumanMessage
        from open_notebook.utils.ai import get_llm
        
        llm = await get_llm(state["user_id"])
        
        prompt = transformation.prompt.replace("{content}", source.full_text)
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # Save as insight
        insight = Insight(
            source_id=source.id,
            transformation_id=trans_id,
            content=response.content
        )
        await insight.save()
    
    return {"transform_complete": True}

# Build graph
from langgraph.graph import StateGraph

source_graph = StateGraph(SourceState)

# Add nodes
source_graph.add_node("content_process", content_process)
source_graph.add_node("save_source", save_source)
source_graph.add_node("transform_content", transform_content)

# Define flow
source_graph.set_entry_point("content_process")
source_graph.add_edge("content_process", "save_source")
source_graph.add_edge("save_source", "transform_content")
source_graph.add_edge("transform_content", END)

# Compile
source_graph = source_graph.compile()
```

## Status Tracking

### Source Status Values

```python
class SourceStatus(str, Enum):
    QUEUED = "queued"        # Command queued, not started
    RUNNING = "running"      # Worker processing
    COMPLETED = "completed"  # Successfully processed
    FAILED = "failed"        # Error occurred
```

### Frontend Polling

**Location:** `frontend/src/lib/hooks/use-sources.ts`

```typescript
export function useSource(id: string) {
  return useQuery({
    queryKey: ['source', id],
    queryFn: () => getSource(id),
    refetchInterval: (data) => {
      // Poll every 2 seconds if still processing
      if (data?.status === 'queued' || data?.status === 'running') {
        return 2000;
      }
      // Stop polling once complete/failed
      return false;
    }
  });
}
```

### User Experience Flow

```
Time 0s:
  User uploads PDF → API returns immediately
  UI shows: "Processing..." with spinner

Time 2s:
  Frontend polls → status: "queued"
  UI shows: "Waiting to start..."

Time 5s:
  Frontend polls → status: "running"
  UI shows: "Extracting content..."

Time 15s:
  Frontend polls → status: "completed"
  UI shows: Full content + download button
  Polling stops
```

## Error Handling

### Common Errors

#### 1. File Too Large

```python
# api/routers/sources.py
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

if upload_file.size > MAX_FILE_SIZE:
    raise HTTPException(
        status_code=413,
        detail="File too large (max 50MB)"
    )
```

#### 2. Unsupported File Type

```python
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".pptx"}

if not any(upload_file.filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}"
    )
```

#### 3. Extraction Failed

```python
# Worker command
try:
    content = await extract_content(file_path)
except Exception as e:
    source.status = "failed"
    source.error_message = f"Content extraction failed: {str(e)}"
    await source.save()
    raise
```

#### 4. Embedding Generation Failed

```python
try:
    embeddings = await generate_embeddings(chunks)
except Exception as e:
    # Continue without embeddings
    logger.warning(f"Embedding generation failed: {e}")
    source.embedded_chunks = 0
```

## Performance Considerations

### 1. Async Processing

**Why async?**
- User doesn't wait for processing
- Multiple sources can be processed in parallel
- Long-running operations don't block API

**Trade-off:**
- Adds complexity (polling, status tracking)
- Requires worker process

### 2. Chunking Strategy

```python
def split_text(text: str, chunk_size: int = 1000, overlap: int = 200):
    """
    Split text into overlapping chunks for better context.
    
    Args:
        chunk_size: Target characters per chunk
        overlap: Characters to overlap between chunks
    
    Example:
        Input: "ABCDEFGHIJ" (chunk_size=4, overlap=2)
        Output: ["ABCD", "CDEF", "EFGH", "GHIJ"]
    """
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - overlap  # Overlap for context
    
    return chunks
```

### 3. Embedding Batch Size

```python
# Process embeddings in batches to avoid memory issues
BATCH_SIZE = 10

for i in range(0, len(chunks), BATCH_SIZE):
    batch = chunks[i:i + BATCH_SIZE]
    embeddings = await generate_embeddings_batch(batch)
    
    for chunk, embedding in zip(batch, embeddings):
        await chunk.save_with_embedding(embedding)
```

## Storage Patterns

### File Organization

```
/mydata/uploads/
├── document.pdf
├── document (1).pdf
├── research_paper.pdf
├── meeting_notes.txt
└── presentation.pptx
```

**Cleanup Strategy:**
- Files persist by default (users may want to re-download)
- Optional `delete_source=true` flag deletes after processing
- Manual cleanup via admin endpoint (future)

### Database Structure

```
source:abc123
├── id: "source:abc123"
├── title: "Research Paper"
├── type: "upload"
├── file_path: "/mydata/uploads/document.pdf"
├── full_text: "# Research Paper\n\n..."
├── content_length: 15000
├── embedded_chunks: 15
├── status: "completed"
├── owner: "user:xyz"
└── created: 2025-01-01T12:00:00Z

chunk:chunk1 (linked to source:abc123)
├── content: "First chunk of text..."
├── index: 0
├── embedding: [0.123, 0.456, ...]
└── source_id: "source:abc123"

insight:insight1 (linked to source:abc123)
├── transformation_id: "transformation:summary"
├── content: "This paper discusses..."
└── source_id: "source:abc123"
```

## Related Documentation
- [Worker System](./WORKER_SYSTEM.md)
- [AI Provider Integration](./AI_PROVIDERS.md)
- [Content Extraction](./CONTENT_EXTRACTION.md)
- [Embeddings](./EMBEDDINGS.md)



