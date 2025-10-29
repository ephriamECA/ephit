import asyncio
from pathlib import Path
from typing import List

from loguru import logger
from surrealdb import RecordID

from api.models import (
    AdminEpisodeInfo,
    AdminNotebookInfo,
    AdminNoteInfo,
    AdminSourceInfo,
    AdminUserDetail,
    AdminUserSummary,
)
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.storage import delete_object, parse_s3_url


class AdminService:
    """Service layer for administrative operations."""

    async def list_users(self) -> List[AdminUserSummary]:
        users = await repo_query(
            """
            SELECT id, email, display_name, is_active, is_admin, created, updated
            FROM user
            ORDER BY created
            """
        )

        summaries: List[AdminUserSummary] = []
        for user in users:
            user_id = user["id"]
            owner_ref = ensure_record_id(user_id)
            notebook_count, source_count, note_count, episode_count = await asyncio.gather(
                self._count_records("notebook", owner_ref),
                self._count_records("source", owner_ref),
                self._count_records("note", owner_ref),
                self._count_records("episode", owner_ref),
            )

            summaries.append(
                AdminUserSummary(
                    id=user_id,
                    email=user.get("email", ""),
                    display_name=user.get("display_name"),
                    is_active=bool(user.get("is_active", True)),
                    is_admin=bool(user.get("is_admin", False)),
                    created=str(user.get("created")) if user.get("created") else None,
                    updated=str(user.get("updated")) if user.get("updated") else None,
                    notebook_count=notebook_count,
                    source_count=source_count,
                    note_count=note_count,
                    episode_count=episode_count,
                )
            )
        return summaries

    async def get_user_detail(self, user_id: str) -> AdminUserDetail:
        owner_ref = ensure_record_id(user_id)
        user_rows = await repo_query(
            """
            SELECT id, email, display_name, is_active, is_admin, created, updated
            FROM user WHERE id = $user_id
            """,
            {"user_id": owner_ref},
        )
        if not user_rows:
            raise ValueError("User not found")
        user = user_rows[0]

        notebook_rows, source_rows, note_rows, episode_rows = await asyncio.gather(
            repo_query(
                "SELECT id, name, created, updated FROM notebook WHERE owner = $owner",
                {"owner": owner_ref},
            ),
            repo_query(
                "SELECT id, title, created, updated FROM source WHERE owner = $owner",
                {"owner": owner_ref},
            ),
            repo_query(
                "SELECT id, title, created, updated FROM note WHERE owner = $owner",
                {"owner": owner_ref},
            ),
            repo_query(
                "SELECT id, name, created, updated FROM episode WHERE owner = $owner",
                {"owner": owner_ref},
            ),
        )

        summary = AdminUserSummary(
            id=user["id"],
            email=user.get("email", ""),
            display_name=user.get("display_name"),
            is_active=bool(user.get("is_active", True)),
            is_admin=bool(user.get("is_admin", False)),
            created=str(user.get("created")) if user.get("created") else None,
            updated=str(user.get("updated")) if user.get("updated") else None,
            notebook_count=len(notebook_rows),
            source_count=len(source_rows),
            note_count=len(note_rows),
            episode_count=len(episode_rows),
        )

        return AdminUserDetail(
            **summary.model_dump(),
            notebooks=[
                AdminNotebookInfo(
                    id=row["id"],
                    name=row.get("name", ""),
                    created=str(row.get("created")) if row.get("created") else None,
                    updated=str(row.get("updated")) if row.get("updated") else None,
                )
                for row in notebook_rows
            ],
            sources=[
                AdminSourceInfo(
                    id=row["id"],
                    title=row.get("title"),
                    created=str(row.get("created")) if row.get("created") else None,
                    updated=str(row.get("updated")) if row.get("updated") else None,
                )
                for row in source_rows
            ],
            notes=[
                AdminNoteInfo(
                    id=row["id"],
                    title=row.get("title"),
                    created=str(row.get("created")) if row.get("created") else None,
                    updated=str(row.get("updated")) if row.get("updated") else None,
                )
                for row in note_rows
            ],
            episodes=[
                AdminEpisodeInfo(
                    id=row["id"],
                    name=row.get("name", ""),
                    created=str(row.get("created")) if row.get("created") else None,
                    updated=str(row.get("updated")) if row.get("updated") else None,
                )
                for row in episode_rows
            ],
        )

    async def clear_user_data(self, user_id: str) -> None:
        owner_ref = ensure_record_id(user_id)

        exists = await repo_query(
            "SELECT id FROM user WHERE id = $user_id",
            {"user_id": owner_ref},
        )
        if not exists:
            raise ValueError("User not found")

        await self._delete_episode_assets(owner_ref)

        # Delete data collections
        notebook_ids = await self._collect_ids("notebook", owner_ref)
        source_ids = await self._collect_ids("source", owner_ref)
        note_ids = await self._collect_ids("note", owner_ref)

        if source_ids:
            await repo_query(
                "DELETE FROM source_embedding WHERE source IN $ids",
                {"ids": source_ids},
            )
            await repo_query(
                "DELETE FROM source_insight WHERE source IN $ids",
                {"ids": source_ids},
            )
            await repo_query(
                "DELETE FROM reference WHERE in IN $ids",
                {"ids": source_ids},
            )

        if note_ids:
            await repo_query(
                "DELETE FROM artifact WHERE in IN $ids",
                {"ids": note_ids},
            )

        if notebook_ids:
            await repo_query(
                "DELETE FROM reference WHERE out IN $ids",
                {"ids": notebook_ids},
            )
            await repo_query(
                "DELETE FROM artifact WHERE out IN $ids",
                {"ids": notebook_ids},
            )

        await repo_query("DELETE FROM notebook WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM note WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM source WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM user_provider_secret WHERE user = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM chat_session WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM episode_profile WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM speaker_profile WHERE owner = $owner", {"owner": owner_ref})
        await repo_query("DELETE FROM episode WHERE owner = $owner", {"owner": owner_ref})

    async def _count_records(self, table: str, owner_ref) -> int:
        result = await repo_query(
            f"SELECT count() AS count FROM {table} WHERE owner = $owner",
            {"owner": owner_ref},
        )
        if result and isinstance(result, list):
            return int(result[0].get("count", 0) or 0)
        return 0

    async def _delete_episode_assets(self, owner_ref) -> None:
        episodes = await repo_query(
            "SELECT id, audio_file FROM episode WHERE owner = $owner",
            {"owner": owner_ref},
        )
        for episode in episodes:
            audio_file = episode.get("audio_file")
            if not audio_file:
                continue

            if isinstance(audio_file, str) and audio_file.startswith("s3://"):
                bucket, key = parse_s3_url(audio_file)
                if key:
                    delete_object(key)
            elif isinstance(audio_file, str):
                path = Path(audio_file)
                if path.exists():
                    try:
                        path.unlink()
                    except Exception as exc:
                        logger.warning(f"Failed to delete local audio file {path}: {exc}")
                # Attempt to remove parent directory if empty
                parent = path.parent
                if parent.exists():
                    try:
                        parent.rmdir()
                    except OSError:
                        pass

    async def _collect_ids(self, table: str, owner_ref) -> List[RecordID]:
        rows = await repo_query(
            f"SELECT id FROM {table} WHERE owner = $owner",
            {"owner": owner_ref},
        )
        return [ensure_record_id(row["id"]) for row in rows if "id" in row]


admin_service = AdminService()
