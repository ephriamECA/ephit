#!/usr/bin/env python3
"""
Set a user as admin by email.
Usage: python3 scripts/set_admin.py <email>
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from open_notebook.database.repository import repo_query


async def set_admin(email: str, is_admin: bool = True) -> None:
    """Set admin status for a user by email."""
    # Get all users
    users = await repo_query("SELECT * FROM user")
    
    # Find user by email
    target_user = None
    for user in users:
        if user.get("email", "").lower() == email.lower():
            target_user = user
            break
    
    if not target_user:
        print(f"❌ User with email '{email}' not found.")
        print("\nAvailable users:")
        for user in users:
            print(f"  - {user.get('email')}")
        return
    
    user_id = target_user["id"]
    
    # Update admin status
    await repo_query(
        f"UPDATE {user_id} SET is_admin = $is_admin",
        {"is_admin": is_admin}
    )
    
    status = "admin" if is_admin else "regular"
    print(f"✅ Successfully set {target_user.get('email')} to {status} user")


async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/set_admin.py <email> [--remove-admin]")
        print("\nExample:")
        print("  python3 scripts/set_admin.py user@example.com")
        print("  python3 scripts/set_admin.py user@example.com --remove-admin")
        sys.exit(1)
    
    email = sys.argv[1]
    is_admin = "--remove-admin" not in sys.argv
    
    await set_admin(email, is_admin)


if __name__ == "__main__":
    asyncio.run(main())

