# Phase 27 Verification: Independent Memory Wiring (Postgres/RabbitMQ/Local Second Brain)

## Goal-Backward Verification

### 1. Observable Truths
- [ ] Schema `gsd_local_brain` exists in Postgres with `artifacts`, `symbols`, and `dependencies` tables.
- [ ] RabbitMQ exchange `gsd.pulse` is active and receiving messages.
- [ ] `broker.cjs` gracefully handles RabbitMQ being down (retries, no crash).
- [ ] `second-brain.cjs` gracefully handles Postgres being down (logs error, continues execution).
- [ ] Artifact normalization automatically triggers Second Brain ingestion.
- [ ] Symbols and dependencies from normalization are correctly stored in Postgres.

### 2. Required Artifacts
- [ ] `scripts/init-local-brain.sql`: SQL schema definition.
- [ ] `get-stuff-done/bin/lib/broker.cjs`: RabbitMQ wrapper with retry logic.
- [ ] `get-stuff-done/bin/lib/second-brain.cjs`: Postgres storage wrapper with failure handling.
- [ ] `tests/second-brain.test.cjs`: Integration and failure simulation tests.

### 3. Key Links
- [ ] `internal-normalizer.cjs` -> `second-brain.cjs`: `ingestArtifact()` call.
- [ ] `second-brain.cjs` -> `broker.cjs`: `publish()` call for symbols.
- [ ] `second-brain.cjs` -> `pg`: Database connection.
- [ ] `broker.cjs` -> `amqplib`: RabbitMQ connection.

## Automated Verification Tests
- `npm test tests/second-brain.test.cjs` (Standard flow)
- `FAILURE_SIM=postgres node tests/second-brain.test.cjs` (Postgres down simulation)
- `FAILURE_SIM=rabbitmq node tests/second-brain.test.cjs` (RabbitMQ down simulation)
