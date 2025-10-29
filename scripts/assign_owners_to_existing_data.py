#!/usr/bin/env python3
"""
Assign owners to existing notebooks, notes, and sources that don't have owners.
This ensures data isolation between users.

Run this once to migrate existing data.
"""
import asyncio
from open_notebook.database.repository import repo_query, ensure_record_id


async def assign_owners():
    """
    For all existing data without owners:
    - Try to infer owner from the user who might have created it first
    - Or assign to the first user in the system
    - Or mark as orphaned if no users exist
    """
    print("Assigning owners to existing data...")
    
    # Get all users
    users = await repo_query("SELECT * FROM user")
    if not users:
        print("No users found in database. Exiting.")
        return
    
    print(f"Found {len(users)} users in database")
    
    # Get first user as default owner
    first_user_id = users[0].get("id")
    
    # 1. Assign owners to notebooks without owners
    notebooks_result = await repo_query(
        "SELECT id FROM notebook WHERE owner IS NULL OR owner = NONE"
    )
    if notebooks_result:
        print(f"Found {len(notebooks_result)} notebooks without owners")
        for nb in notebooks_result:
            await repo_query(
                "UPDATE notebook SET owner = $owner WHERE id = $id",
                {"owner": ensure_record_id(first_user_id), "id": ensure_record_id(nb["id"])}
            )
            print(f"✅ Assigned owner to notebook: {nb['id']}")
    
    # 2. Assign owners to notes without owners
    notes_result = await repo_query(
        "SELECT id FROM note WHERE owner IS NULL OR owner = NONE"
    )
    if notes_result:
        print(f"Found {len(notes_result)} notes without owners")
        for note in notes_result:
            await repo_query(
                "UPDATE note SET owner = $owner WHERE id = $id",
                {"owner": ensure_record_id(first_user_id), "id": ensure_record_id(note["id"])}
            )
            print(f"✅ Assigned owner to note: {note['id']}")
    
    # 3. Assign owners to sources without owners
    sources_result = await repo_query(
        "SELECT id FROM source WHERE owner IS NULL OR owner = NONE"
    )
    if sources_result:
        print(f"Found {len(sources_result)} sources without owners")
        for source in sources_result:
            await repo_query(
                "UPDATE source SET owner = $owner WHERE id = $id",
                {"owner": ensure_record_id(first_user_id), "id": ensure_record_id(source["id"])}
            )
            print(f"✅ Assigned owner to source: {source['id']}")
    
    print("\n✅ Done assigning owners!")
    

if __name__ == "__main__":
    asyncio.run(assign_owners())



