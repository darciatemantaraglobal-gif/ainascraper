---
name: Phantom artifacts from backup folders
description: A migration backup folder containing leftover artifact.toml files gets auto-registered as duplicate artifacts/workflows.
---

When porting an app that was already a Replit-native pnpm-workspace project (e.g. re-importing/restoring a prior export), keeping a full copy of the old project under something like `.migration-backup/` is risky: if that copy still has `<artifact-dir>/.replit-artifact/artifact.toml` files inside it, the environment's artifact scanner treats them as real artifacts and auto-registers duplicate artifacts and duplicate workflows (same ports/services, wrong paths).

**Why:** artifact registration scans for `artifact.toml` files anywhere in the tree, not just under the canonical `artifacts/` dir — it doesn't know a folder is "just a reference copy."

**How to apply:** immediately after copying/extracting a backup that may contain its own `.replit-artifact` dirs, delete those `.replit-artifact` directories from the backup copy (not from the real `artifacts/*`) before or right after they get scanned. Confirm with `find . -name artifact.toml -not -path "*/node_modules/*"` that only the real `artifacts/*` entries remain, and check for "Removed workflows" / "Updated artifact" automatic_updates confirming cleanup.
