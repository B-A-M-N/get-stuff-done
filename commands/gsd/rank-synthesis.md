---
name: gsd:rank-synthesis
description: Rank synthesis artifacts by quality metrics
argument-hint: "<mission_id> [--limit N]"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Rank all synthesis artifacts for a mission using composite quality metrics: atom diversity, section density, completeness (has sections), and evidence richness (content length).
</objective>

<execution_context>
@/home/bamn/get-stuff-done/get-stuff-done/workflows/rank-synthesis.md
</execution_context>

<context>
Arguments:
- mission_id: The mission identifier
- --limit N: Maximum number of results to show (default 10, max 100)
- --raw: Output raw JSON instead of formatted table

Metrics computed per artifact:
- density: sections per atom (normalized)
- diversity: unique atom count (log-scaled)
- completeness: binary (has sections)
- evidence_richness: content length in KB
- composite_score: weighted combination

Ranking: composite_score DESC, then created_at DESC (newer wins ties).
</context>

<process>
Execute the rank-synthesis workflow with optional flags.
</process>

<success_criteria>
- [ ] Mission has at least one artifact
- [ ] Ranking table displayed with scores and key columns
- [ ] Top N artifacts shown (default 10)
- [ ] JSON output available via --raw
</success_criteria>
