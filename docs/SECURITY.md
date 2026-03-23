# Project Isolation and Multi-Project Safety

## Project Isolation Guarantees

GSD is designed to be safely reused across multiple projects on the same infrastructure without data leakage or collision.

- **Database Isolation**
  - **Postgres**: Each project uses a uniquely named database: `gsd_local_brain_<hash>` where `<hash>` is the first 12 hexadecimal characters of the SHA-256 hash of the project's absolute root path. This ensures that different projects on the same Postgres cluster never share a database. The default can be overridden by setting the `GSD_DB_NAME` environment variable.
  - **SQLite**: The fallback database is a file stored at `.gemini_security/second_brain.db` within the project directory, naturally isolated per project.

- **File Access Boundaries**
  - The Planning Server only serves files within the project root. Path checks use realpath to resolve symlinks and prevent directory traversal attacks.
  - The Sandbox validates all writes against the project root; writes outside are blocked with exit code 13.

- **Authority Envelopes**
  - Authority envelopes bind changes to a specific project run, preventing cross-project contamination.

## Multi-Project Deployment

### Environment Configuration

- **Explicit Project Root**: If the automatic `process.cwd()` detection is insufficient, set `GSD_PROJECT_ROOT` to the absolute path of the project.
- **Database Override**: To reuse an existing Postgres database (e.g., a pre-existing installation), set `GSD_DB_NAME` to the exact database name. This takes precedence over the auto-generated hash-based name.
- **Shared Postgres Cluster**: By default, each project gets its own database. If you choose to share a single database across projects (not recommended), you must manually manage schema separation via separate database roles or additional isolation layers — GSD does not enforce schema-level isolation when databases are shared.
- **Authority Keys**: Each project should have its own `.gemini_security/authority.key` to ensure cryptographic separation.

### Isolation Testing Checklist

Before deploying multiple projects on the same infrastructure, verify:

- [ ] Each project's Second Brain connects to a distinct Postgres database name (check logs or query `SELECT current_database();`).
- [ ] Planning Server refuses requests for files outside the project root (including symlink attacks).
- [ ] Audit logs (both `firecrawl_audit` and ledger) contain a `project_id` field that matches the project's hash.
- [ ] Sandbox blocks writes to paths outside the project root.

### Database Management

#### Backup

- **Postgres**: Use `pg_dump` on the project-specific database.
- **SQLite**: Copy the `.gemini_security/second_brain.db` file (ensure state is quiesced).

#### Restore

- **Postgres**: Use `pg_restore` into the target database.
- **SQLite**: Replace the `.gemini_security/second_brain.db` file with a backup copy (ensure permissions and state are consistent).

#### Migration

To move a project to a new server:

1. Backup the project's database (as above).
2. Transfer the backup to the new server.
3. Restore into a new database named appropriately (or use `GSD_DB_NAME` to point to the restored DB).
4. Copy the entire project root, including `.gemini_security/` directory.
5. Verify file permissions and environment variables.

#### Schema Initialization

For Postgres deployments, the `gsd_local_brain` schema must exist within the project database. It is typically created by running `scripts/init-local-brain.sql` against the database. The `SecondBrain` class will attempt to create the schema automatically on first connection if it does not exist.

## Notes

- The project identifier is derived from the absolute path of the project root. Changing the project root path will change the identifier and thus the default database name. To maintain continuity, set `GSD_DB_NAME` explicitly.
- Audit records in the `firecrawl_audit` table now include a `project_id` column for filtering in multi-project environments.
