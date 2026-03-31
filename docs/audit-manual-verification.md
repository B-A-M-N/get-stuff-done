# Truth Audit Manual Verification

## Regenerate the audit

Run `npm run audit:truth` for the normal gate or `node scripts/generate-truth-audit.js --verbose` to print the full JSON payload while regenerating:

- `.planning/audit/truth_audit.json`
- `.planning/audit/52-TRUTH-AUDIT.md`

## Inspect the evidence

For each requirement, confirm the audit shows:

- `implementation`: the concrete source files that own the claim
- `test`: the unit or integration coverage proving the claim is exercised
- `trace`: proof or report artifacts produced by the phase
- `enforcement`: `enforced`, not `missing`

If any requirement is `UNPROVEN`, inspect `failures[*].missing` and `failures[*].evidence.enforcement_missing` in `.planning/audit/truth_audit.json` first. The markdown report is intended for quick review; the JSON is the source for detailed diagnosis.

## Update the requirement source

When adding or clarifying a claim, update `.planning/REQUIREMENTS.md` using the canonical single-line format:

```text
REQ-ID: Claim text with MUST or SHALL. | source: path/to/origin.md
```

Use `# needs-clarification` comments for vague claims that should not count as proven yet. Use `@deprecated` comments only when a requirement must be excluded from the audit entirely.

## Add evidence explicitly

Truth mapping is manual by design. To prove a requirement:

1. Add or update the requirement line in `.planning/REQUIREMENTS.md`.
2. Add the requirement entry in `packages/gsd-tools/src/audit/TruthAuditor.js`.
3. Include explicit `implementation`, `tests`, `traces`, and `enforcement` rule entries.
4. Regenerate the audit and confirm `unproven` returns to `0`.

If the audit passes only because the requirement text is weaker than the actual gate, fix the gate or the requirement so both say the same thing before accepting the result.
