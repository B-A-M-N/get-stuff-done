/**
 * ITL Extract — heuristic narrative extraction for Phase 2.
 */

const { normalizeInterpretation } = require('./itl-schema.cjs');

function splitNarrative(narrative) {
  return String(narrative || '')
    .split(/\r?\n+/)
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(line => line.trim())
    .filter(Boolean);
}

function pushUnique(target, value) {
  if (!value) return;
  if (!target.some(item => item.toLowerCase() === value.toLowerCase())) {
    target.push(value);
  }
}

function inferRouteHint(narrative, projectInitialized) {
  const text = String(narrative || '').toLowerCase();
  if (!projectInitialized) return 'new-project';
  if (/\b(start|new project|from scratch|build an app|build a product|launch)\b/.test(text)) {
    return 'new-project';
  }
  return 'quick';
}

function extractIntentFromNarrative(narrative, options = {}) {
  const sentences = splitNarrative(narrative);
  const interpretation = {
    narrative: String(narrative || '').trim(),
    goals: [],
    constraints: [],
    preferences: [],
    anti_requirements: [],
    success_criteria: [],
    risks: [],
    unknowns: [],
    assumptions: [],
    route_hint: inferRouteHint(narrative, options.project_initialized),
    project_initialized: Boolean(options.project_initialized),
    metadata: {
      source: 'heuristic-extractor',
      generated_at: new Date().toISOString(),
    },
  };

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    if (/\b(want|need|build|create|make|add|implement|ship|launch)\b/.test(lower)) {
      pushUnique(interpretation.goals, sentence);
    }

    if (/\b(must|cannot|can't|without|within|only|at least|no more than|avoid)\b/.test(lower)) {
      pushUnique(interpretation.constraints, sentence);
    }

    if (/\b(prefer|ideally|would rather|like to)\b/.test(lower)) {
      pushUnique(interpretation.preferences, sentence);
    }

    if (/\b(don't want|do not want|should not|must not|avoid|not include|without)\b/.test(lower)) {
      pushUnique(interpretation.anti_requirements, sentence);
    }

    if (/\b(should|success|done when|able to|user can|users can|needs to be able to)\b/.test(lower)) {
      pushUnique(interpretation.success_criteria, sentence);
    }

    if (/\b(risk|concern|worried|afraid|regression|latency|security|breaking)\b/.test(lower)) {
      pushUnique(interpretation.risks, sentence);
    }

    if (/\b(not sure|unsure|unknown|maybe|probably|somehow|something|stuff|whatever)\b/.test(lower)) {
      pushUnique(interpretation.unknowns, sentence);
    }
  }

  if (interpretation.goals.length === 0 && interpretation.narrative) {
    pushUnique(interpretation.assumptions, 'Primary goal inferred from the full narrative because no explicit goal sentence was detected.');
  }

  if (interpretation.success_criteria.length === 0) {
    pushUnique(interpretation.assumptions, 'Success criteria are incomplete and may need clarification before execution.');
  }

  return normalizeInterpretation(interpretation, {
    narrative,
    project_initialized: options.project_initialized,
    route_hint: interpretation.route_hint,
    source: 'heuristic-extractor',
  });
}

module.exports = {
  extractIntentFromNarrative,
  inferRouteHint,
  splitNarrative,
};
