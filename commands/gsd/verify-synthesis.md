---
name: gsd:verify-synthesis
description: Verify integrity of a synthesis artifact
argument-hint: "<artifact_id>"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Verify that a synthesis artifact maintains integrity: content consistency (artifact content matches section reconstructions), citation completeness (all atoms used are cited), and required fields presence.
</objective>

<execution_context>
@/home/bamn/get-stuff-done/get-stuff-done/workflows/verify-synthesis.md
</execution_context>

<context>
Arguments:
- artifact_id: The artifact ID (e.g., "syn_7aa5b3c2")

Verification checks:
- Required fields: artifact_type, content, atom_ids_used
- Content match: if artifact has sections, their concatenation should equal content
- Citation coverage: every atom in atom_ids_used must appear in at least one citation

Exit codes:
- 0 = verified (all checks pass)
- 1 = drift detected (one or more checks fail)
- 2 = missing artifact (not found)
</context>

<process>
Execute the verify-synthesis workflow.
</process>

<success_criteria>
- [ ] Artifact exists
- [ ] All integrity checks performed
- [ ] Clear pass/fail verdict with details
- [ ] JSON output available via --raw for scripting
</success_criteria>
