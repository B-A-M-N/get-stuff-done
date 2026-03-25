#!/usr/bin/env node

/**
 * GSD Tools — CLI utility for GSD workflow operations
 *
 * Replaces repetitive inline bash patterns across ~50 GSD command/workflow/agent files.
 * Centralizes: config parsing, model resolution, phase lookup, git commits, summary verification.
 *
 * Usage: node gsd-tools.cjs <command> [args] [--raw]
 *
 * Atomic Commands:
 *   state load                         Load project config + state
 *   state json                         Output STATE.md frontmatter as JSON
 *   state update <field> <value>       Update a STATE.md field
 *   state get [section]                Get STATE.md content or section
 *   state patch --field val ...        Batch update STATE.md fields
 *   state begin-phase --phase N --name S --plans C  Update STATE.md for new phase start
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   find-phase <phase>                 Find phase directory by number
 *   commit <message> [--files f1 f2]   Commit planning docs
 *   commit-task <message> --scope <phase-plan> --files f1 [f2 ...]
 *     [--phase <phase>] [--plan <plan>] [--task <N>]
 *     [--prev-hash <hash>]             Verify <hash> is still HEAD before staging — catches
 *                                      out-of-band commits between tasks automatically
 *                                      Commit task source files, verify atomically, and
 *                                      optionally persist hash to per-plan TASK-LOG.jsonl
 *   complete-task <message> --scope <phase-plan> --files f1 [f2 ...]
 *     --phase <phase> --plan <plan> --task <N>
 *     [--prev-hash <hash>]             Stricter wrapper around commit-task:
 *                                      --phase/--plan/--task are REQUIRED (not optional),
 *                                      auto-injects --prev-hash from last task log entry,
 *                                      enforces sequential task numbering (N = last+1).
 *                                      Prefer over commit-task for agent-driven execution.
 *   task-log read --phase <phase> --plan <plan>
 *                                      Read TASK-LOG.jsonl for a plan (context-reset recovery)
 *   task-log reconstruct --phase <phase> --plan <plan>
 *                                      Output "Task N: hash" lines ready for readarray (--raw)
 *                                      or { found, lines, count } JSON
 *   verify-summary <path>              Verify a SUMMARY.md file
 *   generate-slug <text>               Convert text to URL-safe slug
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   list-todos [area]                  Count and enumerate pending todos
 *   verify-path-exists <path>          Check file/directory existence
 *   policy should-prompt <key>         Resolve effective prompt policy for gates.* / safety.*
 *   policy check-access --url <u>      Check if a resource access is granted by policies
 *   gate enforce --key <key>           Exit 1 (write pending artifact) when gate should prompt;
 *                                      exit 0 when clear. Use in `if !` bash blocks.
 *   gate release --key <key>           Acknowledge gate after human response; write released artifact
 *   gate check --key <key>             Report gate state (clear/pending/released) without modifying
 *   checkpoint write --phase N         Atomic checkpoint primitive: write CHECKPOINT.md + commit
 *     --type <type>                    Type: human-verify | decision | human-action
 *     --why-blocked "..."              Why the executor cannot continue
 *     --what-is-uncertain "..."        Unresolved ambiguity or decision gap
 *     [--task N] [--task-name "..."]   Task number and name for the blocked task
 *     [--choices "..."]                Decision options (for type=decision)
 *     [--resume-condition "..."]       What user response allows continuation
 *     [--no-allow-freeform]            Restrict user to listed choices only
 *   firecrawl check                    Check if local Firecrawl instance is reachable.
 *   firecrawl scrape --url <url>      Scrape a URL and return markdown
 *   firecrawl search --query <q>      Search for structured results
 *   firecrawl extract --url <u>       Extract structured data using a schema
 *     --schema '{json}'
 *   firecrawl map --url <u>           Map all URLs under a domain
 *   firecrawl audit [options]         Show StrongDM-style Firecrawl request audit log
 *     --limit N                         Limit results (default 20)
 *     --from <ISO>                      Filter by start timestamp
 *     --to <ISO>                        Filter by end timestamp
 *     --domain <pattern>                Filter by URL domain pattern
 *     --status <status>                 Filter by status (success/error/denied/blocked)
 *     --action <action>                 Filter by action (scrape/extract/search/map)
 *   firecrawl audit cleanup [--days N]  Delete audit records older than N days (default 90)
 *   firecrawl health                   Display Firecrawl health metrics
 *   firecrawl sync --phase N          Sync external context for a phase (scans URLs)
 *   firecrawl list                    List all ingested context (Internal & External)
 *   firecrawl grants                  List active access grants
 *   firecrawl grant --url <p>         Authorize access to a URL pattern
 *     [--type internal|external] [--ttl N]
 *   firecrawl revoke --url <p>        Revoke access to a URL pattern
 *   firecrawl schemas register --pattern <p> --schema-file <path> [--version <v>] [--approved-by <who>]
 *                                    Register a domain schema for extraction
 *   firecrawl schemas list [--pattern <p>]
 *                                    List registered schemas
 *   firecrawl schemas stale [--days <N>]
 *                                    List schemas not used in N days (default 30)
 *   firecrawl schemas approve --pattern <p>
 *                                    Mark a schema as approved (updates approved_by)
 *   searxng check                      Check if local SearXNG instance is reachable
 *   searxng search --query <q>         Perform an audit-logged web search
 *   brain health                       Check health of Postgres, RabbitMQ, and Planning Server.
 *   verify-agent-connectivity          Verify if agents can connect to Local Planning Server.
 *   context build --workflow <name>    Build Zod-validated execution snapshot for a workflow
 *     [--phase N] [--plan M]           Workflows: execute-plan | verify-work | plan-phase
 *                                      Exits 1 on schema validation failure with diagnostics
 *   context read <ID> [ID...]          Read one or more artifacts as a markdown bundle
 *   context normalize --source <uri>   Normalize a file into a context artifact
 *     --file <path> [--type internal|external]
 *   health degraded-mode               Check if running on fallback assumptions
 *                                      (bad config, missing files, pending gates)
 *   config-ensure-section              Initialize .planning/config.json
 *   history-digest                     Aggregate all SUMMARY.md data
 *   summary-extract <path> [--fields]  Extract structured data from SUMMARY.md
 *   state-snapshot                     Structured parse of STATE.md
 *   phase-plan-index <phase>           Index plans with waves and status
 *
 * Phase Operations:
 *   phase next-decimal <phase>         Calculate next decimal phase number
 *   phase add <description>            Append new phase to roadmap + create dir
 *   phase insert <after> <description> Insert decimal phase after existing
 *   phase remove <phase> [--force]     Remove phase, renumber all subsequent
 *   phase complete <phase>             Mark phase done, update state + roadmap
 *
 * Roadmap Operations:
 *   roadmap get-phase <phase>          Extract phase section from ROADMAP.md
 *   roadmap analyze                    Full roadmap parse with disk status
 *   roadmap update-plan-progress <N>   Update progress table row from disk (PLAN vs SUMMARY counts)
 *
 * Requirements Operations:
 *   requirements mark-complete <ids>   Mark requirement IDs as complete in REQUIREMENTS.md
 *                                      Accepts: REQ-01,REQ-02 or REQ-01 REQ-02 or [REQ-01, REQ-02]
 *
 * Milestone Operations:
 *   milestone complete <version>       Archive milestone, create MILESTONES.md
 *     [--name <name>]
 *     [--archive-phases]               Move phase dirs to milestones/vX.Y-phases/
 *
 * Validation:
 *   validate consistency               Check phase numbering, disk/roadmap sync
 *   validate health [--repair]         Check .planning/ integrity, optionally repair
 *
 * Progress:
 *   progress [json|table|bar]          Render progress in various formats
 *
 * Todos:
 *   todo complete <filename>           Move todo from pending to completed
 *
 * Scaffolding:
 *   scaffold context --phase <N>       Create CONTEXT.md template
 *   scaffold uat --phase <N>           Create UAT.md template
 *   scaffold verification --phase <N>  Create VERIFICATION.md template
 *   scaffold phase-dir --phase <N>     Create phase directory
 *     --name <name>
 *
 * Frontmatter CRUD:
 *   frontmatter get <file> [--field k] Extract frontmatter as JSON
 *   frontmatter set <file> --field k   Update single frontmatter field
 *     --value jsonVal
 *   frontmatter merge <file>           Merge JSON into frontmatter
 *     --data '{json}'
 *   frontmatter validate <file>        Validate required fields
 *     --schema plan|summary|verification
 *
 * Verification Suite:
 *   verify plan-structure <file>       Check PLAN.md structure + tasks
 *   verify phase-completeness <phase>  Check all plans have summaries
 *   verify references <file>           Check @-refs + paths resolve
 *   verify commits <h1> [h2] ...      Batch verify commit hashes
 *   verify task-commit <hash>         Validate immediate task commit invariants
 *     [--scope <phase-plan>]
 *   verify artifacts <plan-file>       Check must_haves.artifacts
 *   verify key-links <plan-file>       Check must_haves.key_links
 *   verify context-contract <context-file> [--plan <plan-file>]
 *                                      Check unresolved ambiguity / guidance-only carry-forward rules
 *   verify research-contract <context-file> --research <research-file>
 *                                      Check unresolved ambiguity / guidance-only carry-forward rules in research output
 *   verify checkpoint-response <file>
 *                                      Validate checkpoint return structure for orchestrator handoff
 *   verify checkpoint-coverage <plan-file> [--phase <phase>]
 *                                      Detect checkpoint bypass: plan has checkpoint tasks but no
 *                                      CHECKPOINT.md was written by the subagent
 *   verify integrity [--phase N] [--plan M]
 *                                      Coherence audit: HEAD matches last task log, no stale pending
 *                                      gates, checkpoint coverage, all task hashes exist in git
 *   verify orphaned-state <phase>
 *                                      Detect interrupted execution (plans with summary but later plans without)
 *   verify workflow-readiness <workflow> --phase <N>
 *                                      Evaluate workflow entry readiness with blocking vs degradable gates
 *   verify plan-quality <phase>        Score plan quality and require revision when quality proxies fail
 *   verify verify-work-cold-start <phase>
 *                                      Detect whether verify-work must prepend the cold-start smoke test
 *
 * Template Fill:
 *   template fill summary --phase N    Create pre-filled SUMMARY.md
 *     [--plan M] [--name "..."]
 *     [--fields '{json}']
 *   template fill plan --phase N       Create pre-filled PLAN.md
 *     [--plan M] [--type execute|tdd]
 *     [--wave N] [--fields '{json}']
 *   template fill verification         Create pre-filled VERIFICATION.md
 *     --phase N [--fields '{json}']
 *
 * State Progression:
 *   state advance-plan                 Increment plan counter
 *   state record-metric --phase N      Record execution metrics
 *     --plan M --duration Xmin
 *     [--tasks N] [--files N]
 *   state update-progress              Recalculate progress bar
 *   state add-decision --summary "..."  Add decision to STATE.md
 *     [--phase N] [--rationale "..."]
 *     [--summary-file path] [--rationale-file path]
 *   state add-blocker --text "..."     Add blocker
 *     [--text-file path]
 *   state resolve-blocker --text "..." Remove blocker
 *   state record-session               Update session continuity
 *     --stopped-at "..."
 *     [--resume-file path]
 *
 * Compound Commands (workflow-specific initialization):
 *   init execute-phase <phase>         All context for execute-phase workflow
 *   init plan-phase <phase>            All context for plan-phase workflow
 *   init new-project                   All context for new-project workflow
 *   init new-milestone                 All context for new-milestone workflow
 *   init quick <description>           All context for quick workflow
 *   init resume                        All context for resume-project workflow
 *   init verify-work <phase>           All context for verify-work workflow
 *   init phase-op <phase>              Generic phase operation context
 *   init todos [area]                  All context for todo workflows
 *   init milestone-op                  All context for milestone operations
 *   init map-codebase                  All context for map-codebase workflow
 *   init progress                      All context for progress workflow
 */

const fs = require('fs');
const path = require('path');
const { error, output, safeFs } = require('./lib/core.cjs');
const state = require('./lib/state.cjs');
const phase = require('./lib/phase.cjs');
const roadmap = require('./lib/roadmap.cjs');
const verify = require('./lib/verify.cjs');
const config = require('./lib/config.cjs');
const template = require('./lib/template.cjs');
const milestone = require('./lib/milestone.cjs');
const commands = require('./lib/commands.cjs');
const init = require('./lib/init.cjs');
const frontmatter = require('./lib/frontmatter.cjs');
const itl = require('./lib/itl.cjs');
const audit = require('./lib/audit.cjs');
const openboxPolicy = require('./lib/openbox-policy.cjs');
const integrityLog = require('./lib/integrity-log.cjs');
const profilePipeline = require('./lib/profile-pipeline.cjs');
const profileOutput = require('./lib/profile-output.cjs');
const nextStep = require('./lib/next-step.cjs');
const policy = require('./lib/policy.cjs');
const gate = require('./lib/gate.cjs');
const context = require('./lib/context.cjs');
const firecrawlClient = require('./lib/firecrawl-client.cjs');
const searxngClient = require('./lib/searxng-client.cjs');
const schemaRegistry = require('./lib/schema-registry.cjs');

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Internal tools are trusted to access .planning/
  process.env.GSD_INTERNAL_BYPASS = 'true';
  process.env.GSD_MEMORY_MODE = 'sqlite';

  // 1. Initialize High-Fidelity Infrastructure
  try {
    const astParser = require('./lib/ast-parser.cjs');
    // We don't await here to keep boot time fast, 
    // but command handlers that need it should check status.
    astParser.init().catch(e => {
      if (process.env.GSD_DEBUG === 'true') {
        process.stderr.write(`[AST] High-fidelity parser initialization failed: ${e.message}\n`);
      }
    });
  } catch (e) {
    // Fail-safe to regex fallback
  }

  // Optional cwd override for sandboxed subagents running outside project root.
  let cwd = process.cwd();
  const cwdEqArg = args.find(arg => arg.startsWith('--cwd='));
  const cwdIdx = args.indexOf('--cwd');
  if (cwdEqArg) {
    const value = cwdEqArg.slice('--cwd='.length).trim();
    if (!value) error('Missing value for --cwd');
    args.splice(args.indexOf(cwdEqArg), 1);
    cwd = path.resolve(value);
  } else if (cwdIdx !== -1) {
    const value = args[cwdIdx + 1];
    if (!value || value.startsWith('--')) error('Missing value for --cwd');
    args.splice(cwdIdx, 2);
    cwd = path.resolve(value);
  }

  if (!safeFs.existsSync(cwd) || !safeFs.statSync(cwd).isDirectory()) {
    error(`Invalid --cwd: ${cwd}`);
  }

  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];

  if (!command) {
    error('Usage: gsd-tools <command> [args] [--raw] [--cwd <path>]\nCommands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, policy, config-ensure-section, init, itl');
  }

  switch (command) {
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'json') {
        state.cmdStateJson(cwd, raw);
      } else if (subcommand === 'update') {
        state.cmdStateUpdate(cwd, args[2], args[3]);
      } else if (subcommand === 'get') {
        state.cmdStateGet(cwd, args[2], raw);
      } else if (subcommand === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) {
            patches[key] = value;
          }
        }
        state.cmdStatePatch(cwd, patches, raw);
      } else if (subcommand === 'advance-plan') {
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const taskIdx = args.indexOf('--task');
        state.cmdStateAdvancePlan(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: taskIdx !== -1 ? args[taskIdx + 1] : '1',
        }, raw);
} else if (subcommand === 'record-metric') {
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const durationIdx = args.indexOf('--duration');
        const tasksIdx = args.indexOf('--tasks');
        const filesIdx = args.indexOf('--files');
        state.cmdStateRecordMetric(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          duration: durationIdx !== -1 ? args[durationIdx + 1] : null,
          tasks: tasksIdx !== -1 ? args[tasksIdx + 1] : null,
          files: filesIdx !== -1 ? args[filesIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'update-progress') {
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const taskIdx = args.indexOf('--task');
        state.cmdStateUpdateProgress(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: taskIdx !== -1 ? args[taskIdx + 1] : '1',
        }, raw);
} else if (subcommand === 'add-decision') {
        const phaseIdx = args.indexOf('--phase');
        const summaryIdx = args.indexOf('--summary');
        const summaryFileIdx = args.indexOf('--summary-file');
        const rationaleIdx = args.indexOf('--rationale');
        const rationaleFileIdx = args.indexOf('--rationale-file');
        state.cmdStateAddDecision(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          summary: summaryIdx !== -1 ? args[summaryIdx + 1] : null,
          summary_file: summaryFileIdx !== -1 ? args[summaryFileIdx + 1] : null,
          rationale: rationaleIdx !== -1 ? args[rationaleIdx + 1] : '',
          rationale_file: rationaleFileIdx !== -1 ? args[rationaleFileIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'add-blocker') {
        const textIdx = args.indexOf('--text');
        const textFileIdx = args.indexOf('--text-file');
        state.cmdStateAddBlocker(cwd, {
          text: textIdx !== -1 ? args[textIdx + 1] : null,
          text_file: textFileIdx !== -1 ? args[textFileIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'resolve-blocker') {
        const textIdx = args.indexOf('--text');
        state.cmdStateResolveBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
      } else if (subcommand === 'record-session') {
        const stoppedIdx = args.indexOf('--stopped-at');
        const resumeIdx = args.indexOf('--resume-file');
        const clarificationStatusIdx = args.indexOf('--clarification-status');
        const clarificationRoundsIdx = args.indexOf('--clarification-rounds');
        const clarificationReasonIdx = args.indexOf('--clarification-reason');
        const resumeRequiresInputIdx = args.indexOf('--resume-requires-user-input');
        state.cmdStateRecordSession(cwd, {
          stopped_at: stoppedIdx !== -1 ? args[stoppedIdx + 1] : null,
          resume_file: resumeIdx !== -1 ? args[resumeIdx + 1] : 'None',
          clarification_status: clarificationStatusIdx !== -1 ? args[clarificationStatusIdx + 1] : null,
          clarification_rounds: clarificationRoundsIdx !== -1 ? args[clarificationRoundsIdx + 1] : null,
          last_clarification_reason: clarificationReasonIdx !== -1 ? args[clarificationReasonIdx + 1] : null,
          resume_requires_user_input: resumeRequiresInputIdx !== -1 ? args[resumeRequiresInputIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'checkpoint') {
        const statusIdx = args.indexOf('--status');
        const pathIdx = args.indexOf('--checkpoint-path');
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const taskIdx = args.indexOf('--task');
        state.cmdStateCheckpoint(cwd, {
          status: statusIdx !== -1 ? args[statusIdx + 1] : null,
          checkpointPath: pathIdx !== -1 ? args[pathIdx + 1] : null,
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          task: taskIdx !== -1 ? args[taskIdx + 1] : null,
        }, raw);
} else if (subcommand === 'begin-phase') {
        const phaseIdx = args.indexOf('--phase');
        const nameIdx = args.indexOf('--name');
        const plansIdx = args.indexOf('--plans');
        state.cmdStateBeginPhase(
          cwd,
          phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          nameIdx !== -1 ? args[nameIdx + 1] : null,
          plansIdx !== -1 ? parseInt(args[plansIdx + 1], 10) : null,
          raw
        );
      } else if (subcommand === 'harvest-context') {
        const phaseIdx = args.indexOf('--phase');
        state.cmdStateHarvestContext(cwd, phaseIdx !== -1 ? args[phaseIdx + 1] : null, raw);
      } else if (subcommand === 'baseline-characterize') {
        state.cmdStateSnapshotManifest(cwd, raw);
      } else {
        state.cmdStateLoad(cwd, raw);
      }
      break;
    }

    case 'resolve-model': {
      commands.cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'find-phase': {
      phase.cmdFindPhase(cwd, args[1], raw);
      break;
    }

    case 'commit': {
      const amend = args.includes('--amend');
      const filesIndex = args.indexOf('--files');
      // Collect all positional args between command name and first flag,
      // then join them — handles both quoted ("multi word msg") and
      // unquoted (multi word msg) invocations from different shells
      const endIndex = filesIndex !== -1 ? filesIndex : args.length;
      const messageArgs = args.slice(1, endIndex).filter(a => !a.startsWith('--'));
      const message = messageArgs.join(' ') || undefined;
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      commands.cmdCommit(cwd, message, files, raw, amend);
      break;
    }

    case 'commit-task': {
      // collect message: positional args before first flag
      const ctMessageParts = [];
      let ctI = 1;
      while (ctI < args.length && !args[ctI].startsWith('--')) {
        ctMessageParts.push(args[ctI++]);
      }
      const ctMessage = ctMessageParts.join(' ') || undefined;
      // parse --scope, --phase, --plan, --task, --files
      const ctScopeIdx = args.indexOf('--scope');
      const ctScope = ctScopeIdx !== -1 ? args[ctScopeIdx + 1] : null;
      const ctPhaseIdx = args.indexOf('--phase');
      const ctPhase = ctPhaseIdx !== -1 ? args[ctPhaseIdx + 1] : null;
      const ctPlanIdx = args.indexOf('--plan');
      const ctPlan = ctPlanIdx !== -1 ? args[ctPlanIdx + 1] : null;
      const ctTaskIdx = args.indexOf('--task');
      const ctTask = ctTaskIdx !== -1 ? args[ctTaskIdx + 1] : null;
      const ctWaveIdx = args.indexOf('--wave');
      const ctWave = ctWaveIdx !== -1 ? args[ctWaveIdx + 1] : null;
      const ctFilesIdx = args.indexOf('--files');
      const ctFiles = [];
      if (ctFilesIdx !== -1) {
        for (let j = ctFilesIdx + 1; j < args.length; j++) {
          if (args[j].startsWith('--')) break;
          ctFiles.push(args[j]);
        }
      }
      const ctPrevHashIdx = args.indexOf('--prev-hash');
      const ctPrevHash = ctPrevHashIdx !== -1 ? args[ctPrevHashIdx + 1] : null;
      commands.cmdCommitTask(cwd, ctMessage, ctFiles, ctScope, { phase: ctPhase, plan: ctPlan, task: ctTask, wave: ctWave, prev_hash: ctPrevHash }, raw);
      break;
    }

    case 'complete-task': {
      // Stricter than commit-task: --phase/--plan/--task required, auto prev-hash, sequential enforcement.
      const cptMessageParts = [];
      let cptI = 1;
      while (cptI < args.length && !args[cptI].startsWith('--')) {
        cptMessageParts.push(args[cptI++]);
      }
      const cptMessage = cptMessageParts.join(' ') || undefined;
      const cptScopeIdx = args.indexOf('--scope');
      const cptScope = cptScopeIdx !== -1 ? args[cptScopeIdx + 1] : null;
      const cptPhaseIdx = args.indexOf('--phase');
      const cptPhase = cptPhaseIdx !== -1 ? args[cptPhaseIdx + 1] : null;
      const cptPlanIdx = args.indexOf('--plan');
      const cptPlan = cptPlanIdx !== -1 ? args[cptPlanIdx + 1] : null;
      const cptTaskIdx = args.indexOf('--task');
      const cptTask = cptTaskIdx !== -1 ? args[cptTaskIdx + 1] : null;
      const cptWaveIdx = args.indexOf('--wave');
      const cptWave = cptWaveIdx !== -1 ? args[cptWaveIdx + 1] : null;
      const cptForceScope = args.includes('--force-scope');
      const cptFilesIdx = args.indexOf('--files');
      const cptFiles = [];
      if (cptFilesIdx !== -1) {
        for (let j = cptFilesIdx + 1; j < args.length; j++) {
          if (args[j].startsWith('--')) break;
          cptFiles.push(args[j]);
        }
      }
      const cptPrevHashIdx = args.indexOf('--prev-hash');
      const cptPrevHash = cptPrevHashIdx !== -1 ? args[cptPrevHashIdx + 1] : null;
      commands.cmdCompleteTask(cwd, cptMessage, cptFiles, cptScope, { phase: cptPhase, plan: cptPlan, task: cptTask, wave: cptWave, prev_hash: cptPrevHash, force_scope: cptForceScope }, raw);
      break;
    }

    case 'task-log': {
      const subcommand = args[1];
      const tlPhaseIdx = args.indexOf('--phase');
      const tlPlanIdx = args.indexOf('--plan');
      const tlPhase = tlPhaseIdx !== -1 ? args[tlPhaseIdx + 1] : null;
      const tlPlan = tlPlanIdx !== -1 ? args[tlPlanIdx + 1] : null;
      if (subcommand === 'read') {
        commands.cmdTaskLogRead(cwd, tlPhase, tlPlan, raw);
      } else if (subcommand === 'reconstruct') {
        commands.cmdTaskLogReconstruct(cwd, tlPhase, tlPlan, raw);
      } else {
        error('Unknown task-log subcommand. Available: read, reconstruct');
      }
      break;
    }

    case 'verify-summary': {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      verify.cmdVerifySummary(cwd, summaryPath, checkCount, raw);
      break;
    }

    case 'template': {
      const subcommand = args[1];
      if (subcommand === 'select') {
        template.cmdTemplateSelect(cwd, args[2], raw);
      } else if (subcommand === 'fill') {
        const templateType = args[2];
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const nameIdx = args.indexOf('--name');
        const typeIdx = args.indexOf('--type');
        const waveIdx = args.indexOf('--wave');
        const fieldsIdx = args.indexOf('--fields');
        template.cmdTemplateFill(cwd, templateType, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          name: nameIdx !== -1 ? args[nameIdx + 1] : null,
          type: typeIdx !== -1 ? args[typeIdx + 1] : 'execute',
          wave: waveIdx !== -1 ? args[waveIdx + 1] : '1',
          fields: fieldsIdx !== -1 ? (() => { try { return JSON.parse(args[fieldsIdx + 1]); } catch { error('Invalid JSON for --fields: ' + args[fieldsIdx + 1]); } })() : {},
        }, raw);
      } else {
        error('Unknown template subcommand. Available: select, fill');
      }
      break;
    }

    case 'frontmatter': {
      const subcommand = args[1];
      const file = args[2];
      if (subcommand === 'get') {
        const fieldIdx = args.indexOf('--field');
        frontmatter.cmdFrontmatterGet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, raw);
      } else if (subcommand === 'set') {
        const fieldIdx = args.indexOf('--field');
        const valueIdx = args.indexOf('--value');
        frontmatter.cmdFrontmatterSet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, valueIdx !== -1 ? args[valueIdx + 1] : undefined, raw);
      } else if (subcommand === 'merge') {
        const dataIdx = args.indexOf('--data');
        frontmatter.cmdFrontmatterMerge(cwd, file, dataIdx !== -1 ? args[dataIdx + 1] : null, raw);
      } else if (subcommand === 'validate') {
        const schemaIdx = args.indexOf('--schema');
        frontmatter.cmdFrontmatterValidate(cwd, file, schemaIdx !== -1 ? args[schemaIdx + 1] : null, raw);
      } else {
        error('Unknown frontmatter subcommand. Available: get, set, merge, validate');
      }
      break;
    }

    case 'verify': {
      const subcommand = args[1];
      if (subcommand === 'plan-structure') {
        verify.cmdVerifyPlanStructure(cwd, args[2], raw);
      } else if (subcommand === 'phase-completeness') {
        verify.cmdVerifyPhaseCompleteness(cwd, args[2], raw);
      } else if (subcommand === 'references') {
        verify.cmdVerifyReferences(cwd, args[2], raw);
      } else if (subcommand === 'commits') {
        verify.cmdVerifyCommits(cwd, args.slice(2), raw);
      } else if (subcommand === 'task-commit') {
        const scopeIdx = args.indexOf('--scope');
        verify.cmdVerifyTaskCommit(cwd, args[2], {
          scope: scopeIdx !== -1 ? args[scopeIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'artifacts') {
        verify.cmdVerifyArtifacts(cwd, args[2], raw);
      } else if (subcommand === 'key-links') {
        verify.cmdVerifyKeyLinks(cwd, args[2], raw);
      } else if (subcommand === 'context-contract') {
        const planIdx = args.indexOf('--plan');
        verify.cmdVerifyContextContract(cwd, args[2], planIdx !== -1 ? args[planIdx + 1] : null, raw);
      } else if (subcommand === 'research-contract') {
        const researchIdx = args.indexOf('--research');
        verify.cmdVerifyResearchContract(cwd, args[2], researchIdx !== -1 ? args[researchIdx + 1] : null, raw);
      } else if (subcommand === 'checkpoint-response') {
        verify.cmdVerifyCheckpointResponse(cwd, args[2], raw);
      } else if (subcommand === 'cross-plan-data-contracts') {
        verify.cmdVerifyCrossPlanDataContracts(cwd, args[2], raw);
      } else if (subcommand === 'requirement-coverage') {
        verify.cmdVerifyRequirementCoverage(cwd, args[2], raw);
      } else if (subcommand === 'dead-exports') {
        verify.cmdVerifyDeadExports(cwd, args[2], raw);
      } else if (subcommand === 'orphaned-state') {
        verify.cmdVerifyOrphanedState(cwd, args[2], raw);
      } else if (subcommand === 'workflow-readiness') {
        const phaseIdx = args.indexOf('--phase');
        verify.cmdVerifyWorkflowReadiness(cwd, args[2], {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          skip_research: args.includes('--skip-research'),
          research: args.includes('--research'),
          auto: args.includes('--auto'),
          gaps: args.includes('--gaps'),
        }, raw);
      } else if (subcommand === 'plan-quality') {
        verify.cmdVerifyPlanQuality(cwd, args[2], raw);
      } else if (subcommand === 'verify-work-cold-start') {
        verify.cmdVerifyWorkColdStart(cwd, args[2], raw);
      } else if (subcommand === 'verify-bypass') {
        verify.cmdVerifyBypass(cwd, args[2], raw);
      } else if (subcommand === 'checkpoint-coverage') {
        const cpPhaseIdx = args.indexOf('--phase');
        verify.cmdVerifyCheckpointCoverage(cwd, args[2], cpPhaseIdx !== -1 ? args[cpPhaseIdx + 1] : null, raw);
      } else if (subcommand === 'integrity') {
        const intPhaseIdx = args.indexOf('--phase');
        const intPlanIdx = args.indexOf('--plan');
        verify.cmdVerifyIntegrity(cwd, {
          phase: intPhaseIdx !== -1 ? args[intPhaseIdx + 1] : null,
          plan: intPlanIdx !== -1 ? args[intPlanIdx + 1] : null,
        }, raw);
      } else {
        error('Unknown verify subcommand. Available: plan-structure, phase-completeness, references, commits, task-commit, artifacts, key-links, context-contract, research-contract, checkpoint-response, checkpoint-coverage, integrity, cross-plan-data-contracts, requirement-coverage, dead-exports, orphaned-state, workflow-readiness, plan-quality, verify-work-cold-start');
      }
      break;
    }

    case 'next-step': {
      const subcommand = args[1];
      if (subcommand === 'set') {
        const hintIdx = args.indexOf('--hint');
        const hint = hintIdx !== -1 ? args[hintIdx + 1] : null;
        // command is everything between 'set' and first -- flag
        const cmdParts = [];
        for (let i = 2; i < args.length; i++) {
          if (args[i].startsWith('--')) break;
          cmdParts.push(args[i]);
        }
        nextStep.cmdSet(cwd, cmdParts.join(' '), hint, raw);
      } else if (subcommand === 'get') {
        nextStep.cmdGet(cwd, raw);
      } else if (subcommand === 'consume') {
        nextStep.cmdConsume(cwd, raw);
      } else if (subcommand === 'clear') {
        nextStep.cmdClear(cwd, raw);
      } else {
        error('Unknown next-step subcommand. Available: set, get, consume, clear');
      }
      break;
    }

    case 'policy': {
      const subcommand = args[1];
      if (subcommand === 'should-prompt') {
        policy.cmdPolicyShouldPrompt(cwd, args[2], raw);
      } else if (subcommand === 'check-access') {
        const urlIdx = args.indexOf('--url');
        if (urlIdx === -1) error('--url is required for check-access');
        const allowed = await policy.checkAccessGrant(args[urlIdx + 1]);
        output({ allowed }, raw, allowed ? 'Access granted' : 'Access denied');
      } else {
        error('Unknown policy subcommand. Available: should-prompt, check-access');
      }
      break;
    }

    case 'gate': {
      const subcommand = args[1];
      const keyIdx = args.indexOf('--key');
      const keyArg = keyIdx !== -1 ? args[keyIdx + 1] : null;
      const pathIdx = args.indexOf('--path');
      const pathArg = pathIdx !== -1 ? args[pathIdx + 1] : (args[2] && !args[2].startsWith('--') ? args[2] : null);
      const phaseIdx = args.indexOf('--phase');
      const planIdx = args.indexOf('--plan');
      const waveIdx = args.indexOf('--wave');
      const gateOptions = {
        phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
        plan: planIdx !== -1 ? args[planIdx + 1] : null,
        wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
      };

      if (subcommand === 'enforce') {
        gate.cmdGateEnforce(cwd, keyArg, gateOptions, raw);
      } else if (subcommand === 'release') {
        gate.cmdGateRelease(cwd, keyArg, gateOptions, raw);
      } else if (subcommand === 'check') {
        gate.cmdGateCheck(cwd, keyArg, raw);
      } else if (subcommand === 'check-path') {
        gate.cmdGateCheckPath(cwd, pathArg, raw);
      } else {
        error('Unknown gate subcommand. Available: enforce, release, check, check-path');
      }
      break;
    }

    case 'checkpoint': {
      const subcommand = args[1];
      if (subcommand === 'write') {
        const cpPhaseIdx = args.indexOf('--phase');
        const cpPhase = cpPhaseIdx !== -1 ? args[cpPhaseIdx + 1] : null;
        const cpPlanIdx = args.indexOf('--plan');
        const cpPlan = cpPlanIdx !== -1 ? args[cpPlanIdx + 1] : null;
        const cpTypeIdx = args.indexOf('--type');
        const cpWhyIdx = args.indexOf('--why-blocked');
        const cpUncertainIdx = args.indexOf('--what-is-uncertain');
        const cpTaskIdx = args.indexOf('--task');
        const cpTaskNameIdx = args.indexOf('--task-name');
        const cpChoicesIdx = args.indexOf('--choices');
        const cpResumeIdx = args.indexOf('--resume-condition');
        commands.cmdCheckpointWrite(cwd, cpPhase, {
          plan: cpPlan,
          type: cpTypeIdx !== -1 ? args[cpTypeIdx + 1] : null,
          why_blocked: cpWhyIdx !== -1 ? args[cpWhyIdx + 1] : null,
          what_is_uncertain: cpUncertainIdx !== -1 ? args[cpUncertainIdx + 1] : null,
          task: cpTaskIdx !== -1 ? args[cpTaskIdx + 1] : null,
          task_name: cpTaskNameIdx !== -1 ? args[cpTaskNameIdx + 1] : null,
          choices: cpChoicesIdx !== -1 ? args[cpChoicesIdx + 1] : '',
          resume_condition: cpResumeIdx !== -1 ? args[cpResumeIdx + 1] : null,
          allow_freeform: !args.includes('--no-allow-freeform'),
        }, raw);
      } else {
        error('Unknown checkpoint subcommand. Available: write');
      }
      break;
    }

    case 'health': {
      const subcommand = args[1];
      if (subcommand === 'degraded-mode') {
        commands.cmdHealthDegradedMode(cwd, raw);
      } else {
        error('Unknown health subcommand. Available: degraded-mode');
      }
      break;
    }

    case 'brain': {
      const brainManager = require('./lib/brain-manager.cjs');
      const subcommand = args[1];
      if (subcommand === 'health') {
        const status = await brainManager.checkHealth();
        process.stdout.write(JSON.stringify(status, null, 2) + '\n');
        process.exit(status.allOk ? 0 : 1);
      } else {
        error('Unknown brain subcommand. Available: health');
      }
      break;
    }

    case 'verify-agent-connectivity': {
      const brainManager = require('./lib/brain-manager.cjs');
      const status = await brainManager.checkHealth();
      if (status.planningServer === 'ok') {
        process.stdout.write(JSON.stringify({ connected: true, server: 'http://localhost:3011' }, null, 2) + '\n');
        process.exit(0);
      } else {
        process.stdout.write(JSON.stringify({ connected: false, error: status.planningServer }, null, 2) + '\n');
        process.exit(1);
      }
      break;
    }

    case 'debug': {
      const subcommand = args[1];
      if (subcommand === 'log') {
        const followIdx = args.indexOf('--follow');
        const levelIdx = args.indexOf('--level');
        const sinceIdx = args.indexOf('--since');
        const limitIdx = args.indexOf('--limit');
        const options = {
          follow: followIdx !== -1,
          level: levelIdx !== -1 ? args[levelIdx + 1] : undefined,
          since: sinceIdx !== -1 ? args[sinceIdx + 1] : undefined,
          limit: limitIdx !== -1 ? args[limitIdx + 1] : undefined,
        };
        const audit = require('./lib/audit.cjs');
        audit.cmdDebugLog(cwd, options, raw);
      } else if (subcommand === 'recent') {
        const audit = require('./lib/audit.cjs');
        audit.cmdErrorsRecent(cwd, raw);
      } else {
        error('Unknown debug subcommand: ' + subcommand);
      }
      break;
    }

    case 'firecrawl': {
      const subcommand = args[1];
      if (subcommand === 'check') {
        const result = await firecrawlClient.check();
        output(result, raw, result.available ? 'ok' : 'down');
      } else if (subcommand === 'scrape') {
        const urlIdx = args.indexOf('--url');
        if (urlIdx === -1) error('--url is required for scrape');
        const result = await firecrawlClient.scrape(args[urlIdx + 1]);
        output(result, raw);
      } else if (subcommand === 'search') {
        const queryIdx = args.indexOf('--query');
        if (queryIdx === -1) error('--query is required for search');
        const result = await firecrawlClient.search(args[queryIdx + 1]);
        output(result, raw);
      } else if (subcommand === 'extract') {
        const urlIdx = args.indexOf('--url');
        const schemaIdx = args.indexOf('--schema');
        if (urlIdx === -1) error('--url is required for extract');
        if (schemaIdx === -1) error('--schema is required for extract');
        let schema;
        try {
          schema = JSON.parse(args[schemaIdx + 1]);
        } catch {
          error('Invalid JSON for --schema');
        }
        const result = await firecrawlClient.extract(args[urlIdx + 1], schema);
        output(result, raw);
      } else if (subcommand === 'map') {
        const urlIdx = args.indexOf('--url');
        if (urlIdx === -1) error('--url is required for map');
        const result = await firecrawlClient.map(args[urlIdx + 1]);
        output(result, raw);
      } else if (subcommand === 'audit') {
        // Check if subcommand is 'audit cleanup'
        const nextArg = args[2];
        if (nextArg === 'cleanup') {
          const daysIdx = args.indexOf('--days');
          const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 90;
          const secondBrain = require('./lib/second-brain.cjs');
          const deleted = await secondBrain.cleanupOldAudits(days);
          if (deleted > 0) {
            output({ deleted }, raw, `Deleted ${deleted} old audit record(s)`);
          } else {
            output({ deleted }, raw, 'No records to delete');
          }
          break;
        }

        // Regular audit listing with filters
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20;

        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        const domainIdx = args.indexOf('--domain');
        const statusIdx = args.indexOf('--status');
        const actionIdx = args.indexOf('--action');

        const filters = {
          from: fromIdx !== -1 ? args[fromIdx + 1] : undefined,
          to: toIdx !== -1 ? args[toIdx + 1] : undefined,
          domain: domainIdx !== -1 ? args[domainIdx + 1] : undefined,
          status: statusIdx !== -1 ? args[statusIdx + 1] : undefined,
          action: actionIdx !== -1 ? args[actionIdx + 1] : undefined,
        };

        const logs = await require('./lib/second-brain.cjs').getFirecrawlAudit(limit, filters);
        output(logs, raw);
      } else if (subcommand === 'health') {
        const secondBrain = require('./lib/second-brain.cjs');
        const health = await secondBrain.getFirecrawlHealthSummary();
        output(health, raw);
      } else if (subcommand === 'sync') {
        const phaseIdx = args.indexOf('--phase');
        if (phaseIdx === -1) error('--phase is required for sync');
        const phaseNum = args[phaseIdx + 1];
        const { ensureExternalParity } = require('./lib/context.cjs');
        const synced = await ensureExternalParity(cwd, phaseNum);
        output({ synced }, raw, synced ? 'Context synced via Firecrawl' : 'No new URLs found');
      } else if (subcommand === 'list') {
        const logs = await require('./lib/second-brain.cjs').listContext();
        output(logs, raw);
      } else if (subcommand === 'grants') {
        const grants = await policy.listAccessPolicies();
        output(grants, raw);
      } else if (subcommand === 'grant') {
        const urlIdx = args.indexOf('--url');
        if (urlIdx === -1) error('--url pattern is required for grant');
        const pattern = args[urlIdx + 1];
        const typeIdx = args.indexOf('--type');
        const type = typeIdx !== -1 ? args[typeIdx + 1] : 'external';
        const ttlIdx = args.indexOf('--ttl');
        const ttl = ttlIdx !== -1 ? parseInt(args[ttlIdx + 1], 10) : null;
        await policy.grantAccess(pattern, type, ttl);
        output({ granted: pattern }, raw, `Access granted to: ${pattern}`);
      } else if (subcommand === 'revoke') {
        const urlIdx = args.indexOf('--url');
        if (urlIdx === -1) error('--url pattern is required for revoke');
        const pattern = args[urlIdx + 1];
        await policy.revokeAccess(pattern);
        output({ revoked: pattern }, raw, `Access revoked for: ${pattern}`);
      } else if (subcommand === 'schemas') {
        const schemaSubCmd = args[2];
        if (!schemaSubCmd) error('Missing schemas subcommand. Available: register, list, stale, approve');
        if (schemaSubCmd === 'register') {
          const patternIdx = args.indexOf('--pattern');
          const schemaFileIdx = args.indexOf('--schema-file');
          const versionIdx = args.indexOf('--version');
          const approvedByIdx = args.indexOf('--approved-by');
          if (patternIdx === -1) error('--pattern is required for register');
          if (schemaFileIdx === -1) error('--schema-file is required for register');
          const pattern = args[patternIdx + 1];
          const schemaPath = args[schemaFileIdx + 1];
          const version = versionIdx !== -1 ? args[versionIdx + 1] : '1.0.0';
          const approvedBy = approvedByIdx !== -1 ? args[approvedByIdx + 1] : null;
          const schemaContent = safeReadFile(schemaPath);
          if (!schemaContent) error(`Schema file not found: ${schemaPath}`);
          let schema;
          try {
            schema = JSON.parse(schemaContent);
          } catch (e) {
            error(`Invalid JSON in schema file: ${e.message}`);
          }
          await schemaRegistry.register(pattern, schema, version, approvedBy);
          output({ registered: pattern }, raw, `Schema registered for pattern: ${pattern}`);
        } else if (schemaSubCmd === 'list') {
          const patternIdx = args.indexOf('--pattern');
          const filter = patternIdx !== -1 ? args[patternIdx + 1] : null;
          const schemas = await schemaRegistry.list(filter);
          output(schemas, raw);
        } else if (schemaSubCmd === 'stale') {
          const daysIdx = args.indexOf('--days');
          const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 30;
          const stale = await schemaRegistry.findStale(days);
          output(stale, raw);
        } else if (schemaSubCmd === 'approve') {
          const patternIdx = args.indexOf('--pattern');
          if (patternIdx === -1) error('--pattern is required for approve');
          const pattern = args[patternIdx + 1];
          const existing = await schemaRegistry.list(pattern);
          if (!existing || existing.length === 0) {
            error(`No schema found for pattern: ${pattern}`);
          }
          const schemaEntry = existing[0];
          await schemaRegistry.register(
            pattern,
            schemaEntry.schema_json,
            schemaEntry.version,
            process.env.USER || 'unknown'
          );
          output({ approved: pattern }, raw, `Schema approved for pattern: ${pattern}`);
        } else {
          error('Unknown schemas subcommand. Available: register, list, stale, approve');
        }
      } else {
        error('Unknown firecrawl subcommand. Available: check, scrape, search, extract, map, audit, audit cleanup, health, sync, list, grants, grant, revoke, schemas');
      }
      break;
    }

    case 'searxng': {
      const subcommand = args[1];
      if (subcommand === 'check') {
        const result = await searxngClient.check();
        output(result, raw, result.available ? 'ok' : 'down');
      } else if (subcommand === 'search') {
        const queryIdx = args.indexOf('--query');
        if (queryIdx === -1) error('--query is required for search');
        const result = await searxngClient.search(args[queryIdx + 1]);
        output(result, raw);
      } else {
        error('Unknown searxng subcommand. Available: check, search');
      }
      break;
    }

    case 'generate-slug': {
      commands.cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      commands.cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      commands.cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'verify-path-exists': {
      commands.cmdVerifyPathExists(cwd, args[1], raw);
      break;
    }

    case 'config-ensure-section': {
      config.cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'config-set': {
      config.cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    }

    case "config-set-model-profile": {
      config.cmdConfigSetModelProfile(cwd, args[1], raw);
      break;
    }

    case 'config-get': {
      config.cmdConfigGet(cwd, args[1], raw);
      break;
    }

    case 'history-digest': {
      commands.cmdHistoryDigest(cwd, raw);
      break;
    }

    case 'phases': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        const typeIndex = args.indexOf('--type');
        const phaseIndex = args.indexOf('--phase');
        const options = {
          type: typeIndex !== -1 ? args[typeIndex + 1] : null,
          phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
          includeArchived: args.includes('--include-archived'),
        };
        phase.cmdPhasesList(cwd, options, raw);
      } else {
        error('Unknown phases subcommand. Available: list');
      }
      break;
    }

    case 'roadmap': {
      const subcommand = args[1];
      if (subcommand === 'get-phase') {
        roadmap.cmdRoadmapGetPhase(cwd, args[2], raw);
      } else if (subcommand === 'analyze') {
        roadmap.cmdRoadmapAnalyze(cwd, raw);
      } else if (subcommand === 'update-plan-progress') {
        const planIdx = args.indexOf('--plan');
        const waveIdx = args.indexOf('--wave');
        const options = {
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: waveIdx !== -1 ? args[waveIdx + 1] : '1'
        };
        roadmap.cmdRoadmapUpdatePlanProgress(cwd, args[2], options, raw);
      } else if (subcommand === 'sync') {
        const options = {
          dryRun: args.includes('--dry-run'),
          force: args.includes('--force')
        };
        roadmap.cmdRoadmapSync(cwd, options, raw);
      } else {
        error('Unknown roadmap subcommand. Available: get-phase, analyze, update-plan-progress, sync');
      }
      break;
    }

    case 'requirements': {
      const subcommand = args[1];
      if (subcommand === 'mark-complete') {
        milestone.cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
      } else {
        error('Unknown requirements subcommand. Available: mark-complete');
      }
      break;
    }

    case 'phase': {
      const subcommand = args[1];
      if (subcommand === 'next-decimal') {
        phase.cmdPhaseNextDecimal(cwd, args[2], raw);
      } else if (subcommand === 'add') {
        const planIdx = args.indexOf('--plan');
        const waveIdx = args.indexOf('--wave');
        const phaseOptions = {
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
        };
        phase.cmdPhaseAdd(cwd, args.slice(2).join(' '), phaseOptions, raw);
      } else if (subcommand === 'insert') {
        const planIdx = args.indexOf('--plan');
        const waveIdx = args.indexOf('--wave');
        const phaseOptions = {
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
        };
        phase.cmdPhaseInsert(cwd, args[2], args.slice(3).join(' '), phaseOptions, raw);
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        phase.cmdPhaseRemove(cwd, args[2], { force: forceFlag }, raw);
      } else if (subcommand === 'complete') {
        const planIdx = args.indexOf('--plan');
        const waveIdx = args.indexOf('--wave');
        const phaseOptions = {
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
        };
        phase.cmdPhaseComplete(cwd, args[2], phaseOptions, raw);
      } else {
        error('Unknown phase subcommand. Available: next-decimal, add, insert, remove, complete');
      }
      break;
    }

    case 'milestone': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        const nameIndex = args.indexOf('--name');
        const archivePhases = args.includes('--archive-phases');
        // Collect --name value (everything after --name until next flag or end)
        let milestoneName = null;
        if (nameIndex !== -1) {
          const nameArgs = [];
          for (let i = nameIndex + 1; i < args.length; i++) {
            if (args[i].startsWith('--')) break;
            nameArgs.push(args[i]);
          }
          milestoneName = nameArgs.join(' ') || null;
        }
        milestone.cmdMilestoneComplete(cwd, args[2], { name: milestoneName, archivePhases }, raw);
      } else {
        error('Unknown milestone subcommand. Available: complete');
      }
      break;
    }

    case 'validate': {
      const subcommand = args[1];
      if (subcommand === 'consistency') {
        verify.cmdValidateConsistency(cwd, raw);
      } else if (subcommand === 'health') {
        const repairFlag = args.includes('--repair');
        verify.cmdValidateHealth(cwd, { repair: repairFlag }, raw);
      } else {
        error('Unknown validate subcommand. Available: consistency, health');
      }
      break;
    }

    case 'progress': {
      const subcommand = args[1] || 'json';
      commands.cmdProgressRender(cwd, subcommand, raw);
      break;
    }

    case 'stats': {
      const subcommand = args[1] || 'json';
      commands.cmdStats(cwd, subcommand, raw);
      break;
    }

    case 'todo': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const waveIdx = args.indexOf('--wave');
        const todoOptions = {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
        };
        commands.cmdTodoComplete(cwd, args[2], todoOptions, raw);
      } else {
        error('Unknown todo subcommand. Available: complete');
      }
      break;
    }

    case 'scaffold': {
      const scaffoldType = args[1];
      const phaseIndex = args.indexOf('--phase');
      const nameIndex = args.indexOf('--name');
      const planIdx = args.indexOf('--plan');
      const waveIdx = args.indexOf('--wave');
      const scaffoldOptions = {
        phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
        name: nameIndex !== -1 ? args.slice(nameIndex + 1).join(' ') : null,
        plan: planIdx !== -1 ? args[planIdx + 1] : null,
        wave: waveIdx !== -1 ? args[waveIdx + 1] : null,
      };
      commands.cmdScaffold(cwd, scaffoldType, scaffoldOptions, raw);
      break;
    }

    case 'init': {
      const workflow = args[1];
      switch (workflow) {
        case 'execute-phase':
          init.cmdInitExecutePhase(cwd, args[2], raw);
          break;
        case 'plan-phase':
          init.cmdInitPlanPhase(cwd, args[2], raw);
          break;
        case 'new-project':
          init.cmdInitNewProject(cwd, raw);
          break;
        case 'new-milestone':
          init.cmdInitNewMilestone(cwd, raw);
          break;
        case 'quick':
          init.cmdInitQuick(cwd, args.slice(2).join(' '), raw);
          break;
        case 'resume':
          init.cmdInitResume(cwd, raw);
          break;
        case 'verify-work':
          init.cmdInitVerifyWork(cwd, args[2], raw);
          break;
        case 'phase-op':
          init.cmdInitPhaseOp(cwd, args[2], raw);
          break;
        case 'todos':
          init.cmdInitTodos(cwd, args[2], raw);
          break;
        case 'milestone-op':
          init.cmdInitMilestoneOp(cwd, raw);
          break;
        case 'map-codebase':
          init.cmdInitMapCodebase(cwd, raw);
          break;
        case 'progress':
          init.cmdInitProgress(cwd, raw);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: execute-phase, plan-phase, new-project, new-milestone, quick, resume, verify-work, phase-op, todos, milestone-op, map-codebase, progress`);
      }
      break;
    }

    case 'phase-plan-index': {
      phase.cmdPhasePlanIndex(cwd, args[1], raw);
      break;
    }

    case 'state-snapshot': {
      state.cmdStateSnapshot(cwd, raw);
      break;
    }

    case 'summary-extract': {
      const summaryPath = args[1];
      const fieldsIndex = args.indexOf('--fields');
      const fields = fieldsIndex !== -1 ? args[fieldsIndex + 1].split(',') : null;
      commands.cmdSummaryExtract(cwd, summaryPath, fields, raw);
      break;
    }

    case 'itl': {
      const subcommand = args[1];
      const providerIndex = args.indexOf('--provider');
      const responseJsonIndex = args.indexOf('--provider-response-json');
      const responseFileIndex = args.indexOf('--provider-response-file');
      const ambientContextIndex = args.indexOf('--ambient-context');
      const phaseIndex = args.indexOf('--phase');

      const provider = providerIndex !== -1 ? args[providerIndex + 1] : null;
      let providerResponse;
      if (responseJsonIndex !== -1) {
        try { providerResponse = JSON.parse(args[responseJsonIndex + 1]); }
        catch { error('Invalid JSON for --provider-response-json'); }
      } else if (responseFileIndex !== -1) {
        try { providerResponse = JSON.parse(safeFs.readFileSync(args[responseFileIndex + 1], 'utf8')); }
        catch (e) { error('Could not read/parse --provider-response-file: ' + e.message); }
      }

      let ambientContext = null;
      if (ambientContextIndex !== -1) {
        try { ambientContext = JSON.parse(args[ambientContextIndex + 1]); }
        catch { error('Invalid JSON for --ambient-context'); }
      }
      const phase = phaseIndex !== -1 ? args[phaseIndex + 1] : null;

      if (subcommand === 'interpret') {
        const textIndex = args.indexOf('--text');
        const projectInitializedIndex = args.indexOf('--project-initialized');
        const text = textIndex !== -1
          ? args[textIndex + 1]
          : args.slice(2).filter(arg => !arg.startsWith('--')).join(' ');
        itl.cmdItlInterpret(cwd, {
          text,
          provider,
          provider_response: providerResponse,
          project_initialized: projectInitializedIndex !== -1 ? args[projectInitializedIndex + 1] : null,
          ambient_context: ambientContext,
          phase: phase,
        }, raw);
      } else if (subcommand === 'init-seed') {
        const textIndex = args.indexOf('--text');
        const text = textIndex !== -1
          ? args[textIndex + 1]
          : args.slice(2).filter(arg => !arg.startsWith('--')).join(' ');
        itl.cmdItlInitSeed(cwd, {
          text,
          provider,
          provider_response: providerResponse,
          ambient_context: ambientContext,
          phase: phase,
        }, raw);
      } else if (subcommand === 'discuss-seed') {
        const textIndex = args.indexOf('--text');
        const text = textIndex !== -1
          ? args[textIndex + 1]
          : args.slice(2).filter(arg => !arg.startsWith('--')).join(' ');
        itl.cmdItlDiscussSeed(cwd, {
          text,
          provider,
          provider_response: providerResponse,
          ambient_context: ambientContext,
          phase: phase,
        }, raw);
      } else if (subcommand === 'verify-seed') {
        const textIndex = args.indexOf('--text');
        const text = textIndex !== -1
          ? args[textIndex + 1]
          : args.slice(2).filter(arg => !arg.startsWith('--')).join(' ');
        itl.cmdItlVerifySeed(cwd, {
          text,
          provider,
          provider_response: providerResponse,
          ambient_context: ambientContext,
          phase: phase,
        }, raw);
      } else if (subcommand === 'latest') {
        itl.cmdItlLatest(cwd, raw);
      } else {
        error('Unknown itl subcommand. Available: interpret, init-seed, discuss-seed, verify-seed, latest');
      }
      break;
    }

    case 'audit': {
      const subcommand = args[1];
      if (subcommand === 'log') {
        const phaseIdx = args.indexOf('--phase');
        const planIdx = args.indexOf('--plan');
        const taskIdx = args.indexOf('--task');
        const narrativeRefIdx = args.indexOf('--narrative-ref');
        const justificationIdx = args.indexOf('--justification');
        const filesIdx = args.indexOf('--files');
        const commitIdx = args.indexOf('--commit-hash');
        const authIdx = args.indexOf('--authority-hash');

        audit.cmdAuditLog(cwd, {
          phase: phaseIdx !== -1 ? args[phaseIdx + 1] : null,
          plan: planIdx !== -1 ? args[planIdx + 1] : null,
          task: taskIdx !== -1 ? args[taskIdx + 1] : null,
          narrative_ref: narrativeRefIdx !== -1 ? args[narrativeRefIdx + 1] : null,
          justification: justificationIdx !== -1 ? args[justificationIdx + 1] : null,
          files: filesIdx !== -1 ? args[filesIdx + 1] : null,
          commit_hash: commitIdx !== -1 ? args[commitIdx + 1] : null,
          authority_hash: authIdx !== -1 ? args[authIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'read') {
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;
        audit.cmdAuditRead(cwd, limit, raw);
      } else if (subcommand === 'analyze-impact') {
        const filesIdx = args.indexOf('--files');
        const idIdx = args.indexOf('--id');
        openboxPolicy.cmdAnalyzeImpact(cwd, filesIdx !== -1 ? args[filesIdx + 1] : '', idIdx !== -1 ? args[idIdx + 1] : null, raw);
      } else if (subcommand === 'integrity') {
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20;
        integrityLog.cmdIntegrityRead(cwd, limit, raw);
      } else {
        error('Unknown audit subcommand. Available: log, read, analyze-impact, integrity');
      }
      break;
    }

    case 'serve': {
      const { startServer } = require('./lib/planning-server.cjs');
      const port = process.env.GSD_PLANNING_PORT || 3011;
      startServer(cwd, port);
      break;
    }

    // ─── Profiling Pipeline ────────────────────────────────────────────────

    case 'scan-sessions': {
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const verboseFlag = args.includes('--verbose');
      const jsonFlag = args.includes('--json');
      await profilePipeline.cmdScanSessions(sessionsPath, { verbose: verboseFlag, json: jsonFlag }, raw);
      break;
    }

    case 'extract-messages': {
      const sessionIdx = args.indexOf('--session');
      const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : null;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const projectArg = args[1];
      if (!projectArg || projectArg.startsWith('--')) {
        error('Usage: gsd-tools extract-messages <project> [--session <id>] [--limit N] [--path <dir>]\nRun scan-sessions first to see available projects.');
      }
      await profilePipeline.cmdExtractMessages(projectArg, { sessionId, limit }, raw, sessionsPath);
      break;
    }

    case 'profile-sample': {
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 150;
      const maxPerIdx = args.indexOf('--max-per-project');
      const maxPerProject = maxPerIdx !== -1 ? parseInt(args[maxPerIdx + 1], 10) : null;
      const maxCharsIdx = args.indexOf('--max-chars');
      const maxChars = maxCharsIdx !== -1 ? parseInt(args[maxCharsIdx + 1], 10) : 500;
      await profilePipeline.cmdProfileSample(sessionsPath, { limit, maxPerProject, maxChars }, raw);
      break;
    }

    // ─── Profile Output ──────────────────────────────────────────────────

    case 'write-profile': {
      const inputIdx = args.indexOf('--input');
      const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : null;
      if (!inputPath) error('--input <analysis-json-path> is required');
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      profileOutput.cmdWriteProfile(cwd, { input: inputPath, output: outputPath }, raw);
      break;
    }

    case 'profile-questionnaire': {
      const answersIdx = args.indexOf('--answers');
      const answers = answersIdx !== -1 ? args[answersIdx + 1] : null;
      profileOutput.cmdProfileQuestionnaire({ answers }, raw);
      break;
    }

    case 'generate-dev-preferences': {
      const analysisIdx = args.indexOf('--analysis');
      const analysisPath = analysisIdx !== -1 ? args[analysisIdx + 1] : null;
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const stackIdx = args.indexOf('--stack');
      const stack = stackIdx !== -1 ? args[stackIdx + 1] : null;
      profileOutput.cmdGenerateDevPreferences(cwd, { analysis: analysisPath, output: outputPath, stack }, raw);
      break;
    }

    case 'generate-claude-profile': {
      const analysisIdx = args.indexOf('--analysis');
      const analysisPath = analysisIdx !== -1 ? args[analysisIdx + 1] : null;
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const globalFlag = args.includes('--global');
      profileOutput.cmdGenerateClaudeProfile(cwd, { analysis: analysisPath, output: outputPath, global: globalFlag }, raw);
      break;
    }

    case 'generate-claude-md': {
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const autoFlag = args.includes('--auto');
      const forceFlag = args.includes('--force');
      profileOutput.cmdGenerateClaudeMd(cwd, { output: outputPath, auto: autoFlag, force: forceFlag }, raw);
      break;
    }

    case 'context': {
      const sub = args[1];
      if (sub === 'build') {
        const workflowIdx = args.indexOf('--workflow');
        const workflow = workflowIdx !== -1 ? args[workflowIdx + 1] : null;
        const phaseIdx = args.indexOf('--phase');
        const phaseVal = phaseIdx !== -1 ? args[phaseIdx + 1] : null;
        const planIdx = args.indexOf('--plan');
        const planVal = planIdx !== -1 ? args[planIdx + 1] : null;
        await context.cmdContextBuild(cwd, workflow, { phase: phaseVal, plan: planVal }, raw);
      } else if (sub === 'read') {
        const ids = args.slice(2).filter(a => !a.startsWith('--'));
        context.cmdContextRead(cwd, ids, { raw });
      } else if (sub === 'normalize') {
        const sourceIdx = args.indexOf('--source');
        const fileIdx = args.indexOf('--file');
        const typeIdx = args.indexOf('--type');
        const producerIdx = args.indexOf('--producer');
        context.cmdContextNormalize(cwd, sourceIdx !== -1 ? args[sourceIdx + 1] : null, fileIdx !== -1 ? args[fileIdx + 1] : null, {
          raw,
          type: typeIdx !== -1 ? args[typeIdx + 1] : null,
          producer: producerIdx !== -1 ? args[producerIdx + 1] : null,
        });
      } else {
        error(`Unknown context subcommand: ${sub || '(none)'}. Use: context build, context read, or context normalize`);
      }
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
