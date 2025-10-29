from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger

from api.models import NoteCreate, NoteResponse, NoteUpdate
from api.security import get_current_active_user
from open_notebook.domain.notebook import Note
from open_notebook.domain.user import User
from open_notebook.exceptions import InvalidInputError

router = APIRouter()


@router.get("/notes", response_model=List[NoteResponse])
async def get_notes(
    notebook_id: Optional[str] = Query(None, description="Filter by notebook ID"),
    current_user: User = Depends(get_current_active_user),
):
    """Get all notes with optional notebook filtering (user-scoped)."""
    try:
        if notebook_id:
            # Get notes for a specific notebook
            from open_notebook.domain.notebook import Notebook
            notebook = await Notebook.get(notebook_id)
            if not notebook:
                raise HTTPException(status_code=404, detail="Notebook not found")
            # Verify notebook belongs to user
            if notebook.owner and str(notebook.owner) != str(current_user.id):
                raise HTTPException(status_code=403, detail="Notebook not found")
            notes = await notebook.get_notes()
        else:
            # Get all notes owned by current user
            from open_notebook.database.repository import repo_query, ensure_record_id
            result = await repo_query(
                "SELECT * FROM note WHERE owner = $owner ORDER BY updated DESC",
                {"owner": ensure_record_id(current_user.id)}
            )
            notes = [Note(**note_data) for note_data in result]
        
        return [
            NoteResponse(
                id=note.id or "",
                title=note.title,
                content=note.content,
                note_type=note.note_type,
                created=str(note.created),
                updated=str(note.updated),
            )
            for note in notes
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching notes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching notes: {str(e)}")


@router.post("/notes", response_model=NoteResponse)
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_active_user),
):
    """Create a new note (user-scoped)."""
    try:
        # Auto-generate title if not provided and it's an AI note
        title = note_data.title
        if not title and note_data.note_type == "ai" and note_data.content:
            from open_notebook.graphs.prompt import graph as prompt_graph
            prompt = "Based on the Note below, please provide a Title for this content, with max 15 words"
            result = await prompt_graph.ainvoke(
                {  # type: ignore[arg-type]
                    "input_text": note_data.content,
                    "prompt": prompt
                }
            )
            title = result.get("output", "Untitled Note")
        
        # Validate note_type
        note_type: Optional[Literal["human", "ai"]] = None
        if note_data.note_type in ("human", "ai"):
            note_type = note_data.note_type  # type: ignore[assignment]
        elif note_data.note_type is not None:
            raise HTTPException(status_code=400, detail="note_type must be 'human' or 'ai'")

        new_note = Note(
            title=title,
            content=note_data.content,
            note_type=note_type,
            owner=current_user.id,
        )
        await new_note.save()
        
        # Add to notebook if specified
        if note_data.notebook_id:
            from open_notebook.domain.notebook import Notebook
            notebook = await Notebook.get(note_data.notebook_id)
            if not notebook:
                raise HTTPException(status_code=404, detail="Notebook not found")
            await new_note.add_to_notebook(note_data.notebook_id)
        
        return NoteResponse(
            id=new_note.id or "",
            title=new_note.title,
            content=new_note.content,
            note_type=new_note.note_type,
            created=str(new_note.created),
            updated=str(new_note.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating note: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")


@router.get("/notes/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Get a specific note by ID (user-scoped)."""
    try:
        note = await Note.get(note_id)
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        # Verify note belongs to user
        if note.owner and str(note.owner) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Note not found")
        
        return NoteResponse(
            id=note.id or "",
            title=note.title,
            content=note.content,
            note_type=note.note_type,
            created=str(note.created),
            updated=str(note.updated),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching note: {str(e)}")


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(note_id: str, note_update: NoteUpdate):
    """Update a note."""
    try:
        note = await Note.get(note_id)
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        
        # Update only provided fields
        if note_update.title is not None:
            note.title = note_update.title
        if note_update.content is not None:
            note.content = note_update.content
        if note_update.note_type is not None:
            if note_update.note_type in ("human", "ai"):
                note.note_type = note_update.note_type  # type: ignore[assignment]
            else:
                raise HTTPException(status_code=400, detail="note_type must be 'human' or 'ai'")

        await note.save()

        return NoteResponse(
            id=note.id or "",
            title=note.title,
            content=note.content,
            note_type=note.note_type,
            created=str(note.created),
            updated=str(note.updated),
        )
    except HTTPException:
        raise
    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating note: {str(e)}")


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    """Delete a note."""
    try:
        note = await Note.get(note_id)
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        
        await note.delete()
        
        return {"message": "Note deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting note: {str(e)}")