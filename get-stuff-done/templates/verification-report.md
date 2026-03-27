# Verification Report Template

Template for `.planning/phases/XX-name/{phase_num}-VERIFICATION.md` — evidence-first phase truth verification.

---

## File Template

```markdown
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: VALID | CONDITIONAL | INVALID
score: N/M requirements verified
---

# Phase {X}: {Name} Verification Report

**Phase Goal:** {goal from ROADMAP.md}
**Verified:** {timestamp}
**Status:** {VALID | CONDITIONAL | INVALID}

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth from must_haves} | VALID | {direct evidence ref} |
| 2 | {truth from must_haves} | INVALID | {contradicting evidence} |
| 3 | {truth from must_haves} | CONDITIONAL | {partial evidence + gap} |

**Score:** {N}/{M} truths verified

## Requirements Coverage

| Requirement | Status | Evidence | Gap |
|-------------|--------|----------|-----|
| {REQ-01}: {description} | VALID | {commit/file/test/runtime proof} | - |
| {REQ-02}: {description} | INVALID | {direct contradictory evidence} | {why it fails} |
| {REQ-03}: {description} | CONDITIONAL | {partial direct evidence} | {missing_evidence} |

**Coverage:** {N}/{M} requirements satisfied

## Anti-Pattern Scan

| File | Pattern | Classification | Impact |
|------|---------|----------------|--------|
| src/app/api/chat/route.ts | `// TODO: implement` | degrader | Indicates incomplete |
| src/components/Chat.tsx | `return <div>Placeholder</div>` | blocker | Placeholder affects real execution |

## Drift Analysis

```json
[
  {
    "type": "verification_drift",
    "description": "Claimed success lacks direct evidence"
  }
]
```

## Escalation

```json
{
  "required": true,
  "type": "semantic_ambiguity",
  "reason": "The requirement meaning is ambiguous",
  "explanation": "Plain-English explanation of what the verifier cannot infer",
  "options": [
    "Interpret the requirement narrowly",
    "Interpret the requirement broadly"
  ],
  "implications": [
    "Narrow interpretation may leave expected behavior uncovered",
    "Broad interpretation may force additional evidence collection"
  ]
}
```

## Human Check

```json
{
  "steps": [
    "Describe the manual check step"
  ],
  "observed_result": "What the human actually saw",
  "captured_artifact": "path/to/screenshot-or-log"
}
```

## Final Status

```json
{
  "status": "CONDITIONAL",
  "reason": "Direct evidence is incomplete or escalation remains unresolved"
}
```

## Verification Metadata

**Verification approach:** Evidence-first
**Must-haves source:** {PLAN.md frontmatter | derived from ROADMAP.md goal}
**Automated checks:** {N} passed, {M} failed
**Escalation required:** {true | false}
**Total verification time:** {duration}

---
*Verified: {timestamp}*
*Verifier: Claude (subagent)*
```

---

## Guidelines

**Status values:**
- `VALID` — All requirements are backed by direct evidence and no escalation remains
- `CONDITIONAL` — Partial evidence or unresolved escalation remains, but no requirement is `INVALID`
- `INVALID` — Any requirement is disproven or missing required direct evidence without an explicit conditional gap

**Evidence types:**
- commit hash
- file reference
- test command with output
- runtime output

**Rules:**
- Narrative is never evidence
- Summary documents may point to proof but cannot serve as proof by themselves
- Human observation only counts when it produces a captured artifact
- Verification artifacts remain evidentiary, not repair-planning documents

---
|----------|----------|--------|---------|
| `src/components/Chat.tsx` | Message list component | ✗ STUB | Returns `<div>Chat will be here</div>` |
| `src/components/ChatInput.tsx` | Message input | ✓ EXISTS + SUBSTANTIVE | Form with input, submit button, handlers |
| `src/app/api/chat/route.ts` | Message CRUD | ✗ STUB | GET returns [], POST returns { ok: true } |
| `prisma/schema.prisma` | Message model | ✓ EXISTS + SUBSTANTIVE | Message model with id, content, userId, createdAt |

**Artifacts:** 2/4 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Chat.tsx | /api/chat GET | fetch | ✗ NOT WIRED | No fetch call in component |
| ChatInput | /api/chat POST | onSubmit | ✗ NOT WIRED | Handler only logs, doesn't fetch |
| /api/chat GET | database | prisma.message.findMany | ✗ NOT WIRED | Returns hardcoded [] |
| /api/chat POST | database | prisma.message.create | ✗ NOT WIRED | Returns { ok: true }, no DB call |

**Wiring:** 0/4 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CHAT-01: User can send message | ✗ BLOCKED | API POST is stub |
| CHAT-02: User can view messages | ✗ BLOCKED | Component is placeholder |
| CHAT-03: Messages persist | ✗ BLOCKED | No database integration |

**Coverage:** 0/3 requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/components/Chat.tsx | 8 | `<div>Chat will be here</div>` | 🛑 Blocker | No actual content |
| src/app/api/chat/route.ts | 5 | `return Response.json([])` | 🛑 Blocker | Hardcoded empty |
| src/app/api/chat/route.ts | 12 | `// TODO: save to database` | ⚠️ Warning | Incomplete |

**Anti-patterns:** 3 found (2 blockers, 1 warning)

## Human Verification Required

None needed until automated gaps are fixed.

## Gaps Summary

### Critical Gaps (Block Progress)

1. **Chat component is placeholder**
   - Missing: Actual message list rendering
   - Impact: Users see "Chat will be here" instead of messages
   - Fix: Implement Chat.tsx to fetch and render messages

2. **API routes are stubs**
   - Missing: Database integration in GET and POST
   - Impact: No data persistence, no real functionality
   - Fix: Wire prisma calls in route handlers

3. **No wiring between frontend and backend**
   - Missing: fetch calls in components
   - Impact: Even if API worked, UI wouldn't call it
   - Fix: Add useEffect fetch in Chat, onSubmit fetch in ChatInput

## Recommended Fix Plans

### 03-04-PLAN.md: Implement Chat API

**Objective:** Wire API routes to database

**Tasks:**
1. Implement GET /api/chat with prisma.message.findMany
2. Implement POST /api/chat with prisma.message.create
3. Verify: API returns real data, POST creates records

**Estimated scope:** Small

---

### 03-05-PLAN.md: Implement Chat UI

**Objective:** Wire Chat component to API

**Tasks:**
1. Implement Chat.tsx with useEffect fetch and message rendering
2. Wire ChatInput onSubmit to POST /api/chat
3. Verify: Messages display, new messages appear after send

**Estimated scope:** Small

---

## Verification Metadata

**Verification approach:** Goal-backward (derived from phase goal)
**Must-haves source:** 03-01-PLAN.md frontmatter
**Automated checks:** 2 passed, 8 failed
**Human checks required:** 0 (blocked by automated failures)
**Total verification time:** 2 min

---
*Verified: 2025-01-15T14:30:00Z*
*Verifier: Claude (subagent)*
```

<!-- GSD-AUTHORITY: 72-01-1:e308a938aed8d09a0db1238585f3d571a1f32a58c3762e45dffe3a485db0f6c4 -->
