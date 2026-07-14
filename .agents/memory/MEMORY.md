# Memory Index

- [Phantom artifacts from backup folders](phantom-backup-artifacts.md) — a `.migration-backup/` copy containing leftover `.replit-artifact/artifact.toml` files gets auto-registered as duplicate artifacts/workflows.
- [Lazy secret validation for optional-at-boot config](lazy-secret-validation.md) — validate required secrets at point-of-use, not at module load, so services can boot before secrets are configured.
