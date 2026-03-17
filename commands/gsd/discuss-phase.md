---
name: gsd:discuss-phase
description: Gather phase context through adaptive questioning before planning. Use --auto to skip interactive questions (Claude picks recommended defaults).
argument-hint: "<phase> [--auto]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Task
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
---

<objective>
Extract implementation decisions that downstream agents need — researcher and planner will use CONTEXT.md to know what to investigate and what choices are locked.

**How it works:**
1. Load prior context (PROJECT.md, REQUIREMENTS.md, STATE.md, prior CONTEXT.md files)
2. Scout codebase for reusable assets and patterns
3. Capture a short freeform phase narrative and run ITL interpretation
4. Analyze phase — skip gray areas already decided in prior phases
5. Present remaining gray areas — user selects which to discuss
6. Deep-dive each selected area until satisfied
7. Create CONTEXT.md with decisions that guide research and planning

**Output:** `{phase_num}-CONTEXT.md` — decisions clear enough that downstream agents can act without asking the user again
</objective>

<execution_context>
@~/.claude/get-stuff-done/workflows/discuss-phase.md
@~/.claude/get-stuff-done/templates/context.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)

Context files are resolved in-workflow using `init phase-op` and roadmap/state tool calls.
</context>

<process>
1. Validate phase number (error if missing or not in roadmap)
2. Check if CONTEXT.md exists (offer update/view/skip if yes)
3. **Load prior context** — Read PROJECT.md, REQUIREMENTS.md, STATE.md, and all prior CONTEXT.md files
4. **Scout codebase** — Find reusable assets, patterns, and integration points
5. **Interpret phase narrative** — Capture how the user imagines the phase working, show an interpretation summary, and ask bounded clarification only when ambiguity is high
6. **Analyze phase** — Check prior decisions, skip already-decided areas, generate remaining gray areas using the interpreted intent
7. **Present gray areas** — Multi-select: which to discuss? Annotate with prior decisions + code context
8. **Deep-dive each area** — 4 questions per area, code-informed options, Context7 for library choices
9. **Write CONTEXT.md** — Sections match areas discussed + code_context section
9. Offer next steps (research or plan)

**CRITICAL: Scope guardrail**
- Phase boundary from ROADMAP.md is FIXED
- Discussion clarifies HOW to implement, not WHETHER to add more
- If user suggests new capabilities: "That's its own phase. I'll note it for later."
- Capture deferred ideas — don't lose them, don't act on them

**Domain-aware gray areas:**
Gray areas depend on what's being built. Analyze the phase goal:
- Something users SEE → layout, density, interactions, states
- Something users CALL → responses, errors, auth, versioning
- Something users RUN → output format, flags, modes, error handling
- Something users READ → structure, tone, depth, flow
- Something being ORGANIZED → criteria, grouping, naming, exceptions

Generate 3-4 **phase-specific** gray areas, not generic categories.

**Probing depth:**
- Ask 4 questions per area before checking
- "More questions about [area], or move to next? (Remaining: [list unvisited areas])"
- Show remaining unvisited areas so user knows what's still ahead
- If more → ask 4 more, check again
- After all areas → "Ready to create context?"

**Do NOT ask about (Claude handles these):**
- Technical implementation
- Architecture choices
- Performance concerns
- Scope expansion

**Installed surface:** when this fork is installed, this flow is exposed to users as `/dostuff:discuss-phase`.
</process>

<success_criteria>
- Prior context loaded and applied (no re-asking decided questions)
- Gray areas identified through intelligent analysis
- User chose which areas to discuss
- Each selected area explored until satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures decisions, not vague vision
- User knows next steps
</success_criteria>
