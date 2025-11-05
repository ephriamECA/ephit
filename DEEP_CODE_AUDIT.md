# Deep Code Audit - Runtime Bug Scan

Date: 2025-11-05  
**Status: IN PROGRESS** - Proactive scan for ALL potential runtime errors

---

## 🎯 Audit Scope

Scanning for:
1. ✅ Incorrect model method calls (`.update()` vs `.save()`)
2. ⏳ SQL syntax errors (SurrealDB specific)
3. ⏳ Missing null checks
4. ⏳ Type errors
5. ⏳ Unhandled exceptions
6. ⏳ Missing await statements
7. ⏳ Incorrect async/sync calls
8. ⏳ Database query issues

---

## 🐛 Bugs Found

### Bug #1: User.update() → User.save() ✅ FIXED
**File:** `api/routers/auth.py:117`  
**Issue:** User inherits from ObjectModel (has `.save()`), not RecordModel (has `.update()`)  
**Error:** `AttributeError: 'User' object has no attribute 'update'`  
**Fix:** Changed `await current_user.update()` to `await current_user.save()`  
**Status:** ✅ Fixed and pushed (commit 210313e)

---

### Models Using `.update()` - NEED VERIFICATION

**Verified CORRECT (inherit from RecordModel):**
1. ✅ **DefaultModels** - `api/routers/models.py:173`
   - Inherits from: `RecordModel`
   - Has `.update()` method: YES
   - Status: **CORRECT** ✅

2. ✅ **DefaultPrompts** - `api/routers/transformations.py:238`
   - Inherits from: `RecordModel`
   - Has `.update()` method: YES
   - Status: **CORRECT** ✅

3. ⏳ **Settings** - `api/routers/settings.py:64`
   - Need to verify inheritance
   - Status: **CHECKING...**

---

### Models Using `.save()` - Verified CORRECT

1. ✅ **EpisodeProfile** - `api/routers/episode_profiles.py:164`
2. ✅ **SpeakerProfile** - `api/routers/speaker_profiles.py:136`
3. ✅ **Note** - `api/routers/notes.py:167`
4. ✅ **Notebook** - `api/routers/notebooks.py:196`
5. ✅ **ChatSession** - `api/routers/chat.py:370`

All inherit from ObjectModel - using `.save()` correctly.

---

## 📊 Model Inheritance Map

```
BaseModel (Pydantic)
  ├── ObjectModel (domain/base.py:26)
  │   ├── has .save() method
  │   ├── User
  │   ├── Model  
  │   ├── Note
  │   ├── Notebook
  │   ├── Source
  │   ├── EpisodeProfile
  │   ├── SpeakerProfile
  │   └── ChatSession
  │
  └── RecordModel (domain/base.py:228)
      ├── has .update() method
      ├── has .patch() method
      ├── DefaultModels
      ├── DefaultPrompts
      └── Settings (checking...)
```

---

## 🔍 Next Checks

1. ⏳ Verify Settings model inheritance
2. ⏳ Scan all SQL queries for SurrealDB syntax
3. ⏳ Check for missing await statements
4. ⏳ Check for synchronous calls in async functions
5. ⏳ Verify all exception handling
6. ⏳ Check for None/null safety issues
7. ⏳ Verify all type annotations

---

## 🎯 Goal

Find and fix ALL potential runtime errors BEFORE pushing, not after deployment.
No more iterative debugging - get everything clean in one comprehensive pass.

---

**Status: Continuing scan...**

