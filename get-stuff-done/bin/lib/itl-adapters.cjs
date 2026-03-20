/**
 * ITL Adapters — provider-agnostic adapter seam for canonical interpretation.
 */

const { extractIntentFromNarrative } = require('./itl-extract.cjs');
const { parseInterpretation, parseAdversarialChallenge } = require('./itl-schema.cjs');

const SUPPORTED_PROVIDERS = ['internal', 'claude', 'openai', 'gemini', 'kimi'];
const DEFAULT_PROVIDER = 'internal';

function buildCanonicalPrompt(input) {
  const initialized = input.project_initialized ? 'true' : 'false';
  return [
    'Interpret the following narrative into the canonical ITL schema. Return JSON only. No explanation, no markdown fences.',
    '',
    '=== FIELD DEFINITIONS ===',
    'goals: Things EXPLICITLY stated as desired outcomes. Verbatim or minimal paraphrase only.',
    'constraints: Things EXPLICITLY stated as hard limits or non-negotiable requirements.',
    'preferences: Things EXPLICITLY stated as preferred but not required.',
    'anti_requirements: Things EXPLICITLY stated as unwanted or out of scope.',
    'success_criteria: Things EXPLICITLY stated as how "done" will be recognized.',
    'risks: Things EXPLICITLY stated as concerns, dangers, or things that could go wrong.',
    'unknowns: Anything ambiguous, underspecified, or where the intent is unclear. Format each as: "Unclear: [what is ambiguous and why it matters to execution]"',
    'assumptions: Meta-level notes about the narrative itself. Do NOT use this for inferences.',
    '',
    '=== INFERENCE RULES — READ ALL BEFORE WRITING ANYTHING ===',
    'The inferences array is for things REASONABLY IMPLIED by the narrative but not directly stated.',
    'Every inference object MUST have:',
    '  text: the inferred statement (be specific but minimal)',
    '  evidence: an EXACT VERBATIM QUOTE from the narrative that implies this (must be a substring)',
    '  confidence: 0.0 to 1.0 (only include if >= 0.7; lower confidence belongs in unknowns)',
    '  field: one of goals | constraints | preferences | anti_requirements | success_criteria | risks',
    '',
    'Inference hard rules:',
    '  - NEVER infer specific technology (do not say "PostgreSQL" if the narrative says "database")',
    '  - NEVER infer specific numbers, names, or identifiers not present in the narrative',
    '  - NEVER expand scope beyond what is mentioned',
    '  - If you cannot find an exact verbatim quote as evidence, do not create the inference',
    '  - If confidence would be < 0.7, write an "Unclear:" entry in unknowns instead',
    '  - Empty inferences array is correct and honest when nothing is safely implied',
    '',
    '=== SELF-CHECK — MANDATORY BEFORE FINALIZING OUTPUT ===',
    'Before writing your final JSON:',
    '1. For each item in goals/constraints/preferences/anti_requirements/success_criteria/risks:',
    '   Verify it was EXPLICITLY stated in the narrative. If not, move it to inferences.',
    '2. For each item in inferences:',
    '   Locate the evidence quote as a verbatim substring of the narrative below.',
    '   If you cannot find it, delete the inference and add an "Unclear:" entry to unknowns.',
    '3. For each item in inferences with confidence < 0.7:',
    '   Move it to unknowns as an "Unclear:" entry.',
    '',
    `project_initialized=${initialized}`,
    '',
    'Required JSON keys: goals, constraints, preferences, anti_requirements, success_criteria, risks, unknowns, assumptions, inferences, route_hint, project_initialized',
    '',
    '=== NARRATIVE ===',
    input.narrative,
  ].join('\n');
}

function buildAdversarialPrompt(input) {
  return [
    'You are an adversarial reviewer of an existing ITL interpretation. Return JSON only. No explanation, no markdown fences.',
    '',
    'Your job is to CHALLENGE the interpretation, not rewrite it.',
    'Identify only evidence-backed problems such as unsupported claims, contradictions, overconfident inferences, or missing decision-critical unknowns.',
    'Do not suggest new technologies, scope, or requirements unless they are directly supported by the narrative.',
    '',
    'Required JSON keys: summary, findings, requires_escalation',
    'Each finding must include: type, severity, message, evidence',
    'Optional keys per finding: target_field, suggested_action',
    'severity must be one of low | medium | high',
    'suggested_action must be one of downgrade-to-unknown | remove-unsupported-claim | request-clarification | flag-contradiction',
    '',
    'When to use severity:',
    '- high: the interpretation contains unsupported or contradictory content that could misdirect execution',
    '- medium: the interpretation missed a decision-critical ambiguity or overstates confidence',
    '- low: worthwhile caution, but not blocking',
    '',
    'If the interpretation is acceptable, return findings as an empty array and requires_escalation=false.',
    '',
    '=== NARRATIVE ===',
    input.narrative,
    '',
    '=== INTERPRETATION TO CHALLENGE ===',
    JSON.stringify(input.interpretation, null, 2),
  ].join('\n');
}

function pickFirstStringContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstStringContent(item);
      if (picked) return picked;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  return pickFirstStringContent(
    value.text
      || value.content
      || value.output_text
      || value.arguments
      || value.result
      || value.message
      || value.data
      || value.parts
      || value.candidates
      || value.response
  );
}

function parseJsonPayload(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

function normalizeProviderInterpretation(raw, prepared, provider, source) {
  return parseInterpretation(raw, {
    narrative: prepared?.narrative,
    project_initialized: prepared?.project_initialized,
    provider,
    source,
  });
}

function normalizeProviderChallenge(raw) {
  return parseAdversarialChallenge(raw);
}

function parseOpenAiStyleResponse(response, prepared, provider) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object') {
    if (parsed.output_parsed) {
      payload = parsed.output_parsed;
    } else if (parsed.choices?.[0]?.message?.content) {
      payload = pickFirstStringContent(parsed.choices[0].message.content);
    } else if (parsed.output?.[0]?.content) {
      payload = pickFirstStringContent(parsed.output[0].content);
    }
  }

  return normalizeProviderInterpretation(parseJsonPayload(payload), prepared, provider, `${provider}-adapter`);
}

function parseGeminiResponse(response, prepared) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object' && parsed.candidates?.[0]?.content?.parts) {
    payload = pickFirstStringContent(parsed.candidates[0].content.parts);
  }

  return normalizeProviderInterpretation(parseJsonPayload(payload), prepared, 'gemini', 'gemini-adapter');
}

function parseClaudeResponse(response, prepared) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object' && parsed.content) {
    payload = pickFirstStringContent(parsed.content);
  }

  return normalizeProviderInterpretation(parseJsonPayload(payload), prepared, 'claude', 'claude-adapter');
}

function parseKimiResponse(response, prepared) {
  return parseOpenAiStyleResponse(response, prepared, 'kimi');
}

function parseOpenAiStyleChallengeResponse(response) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object') {
    if (parsed.output_parsed) {
      payload = parsed.output_parsed;
    } else if (parsed.choices?.[0]?.message?.content) {
      payload = pickFirstStringContent(parsed.choices[0].message.content);
    } else if (parsed.output?.[0]?.content) {
      payload = pickFirstStringContent(parsed.output[0].content);
    }
  }

  return normalizeProviderChallenge(parseJsonPayload(payload));
}

function parseGeminiChallengeResponse(response) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object' && parsed.candidates?.[0]?.content?.parts) {
    payload = pickFirstStringContent(parsed.candidates[0].content.parts);
  }

  return normalizeProviderChallenge(parseJsonPayload(payload));
}

function parseClaudeChallengeResponse(response) {
  const parsed = parseJsonPayload(response);
  let payload = parsed;

  if (parsed && typeof parsed === 'object' && parsed.content) {
    payload = pickFirstStringContent(parsed.content);
  }

  return normalizeProviderChallenge(parseJsonPayload(payload));
}

function parseKimiChallengeResponse(response) {
  return parseOpenAiStyleChallengeResponse(response);
}

function buildOpenAiRequest(prepared) {
  const prompt = buildCanonicalPrompt(prepared);
  return {
    provider: 'openai',
    model: 'gpt-4.1',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'itl_interpretation',
        schema: 'canonical-interpretation',
      },
    },
    messages: [
      { role: 'system', content: 'Return only JSON matching the canonical ITL schema.' },
      { role: 'user', content: prompt },
    ],
  };
}

function buildClaudeRequest(prepared) {
  return {
    provider: 'claude',
    model: 'claude-sonnet',
    system: 'Return only JSON matching the canonical ITL schema.',
    messages: [
      {
        role: 'user',
        content: buildCanonicalPrompt(prepared),
      },
    ],
  };
}

function buildGeminiRequest(prepared) {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    systemInstruction: {
      parts: [{ text: 'Return only JSON matching the canonical ITL schema.' }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildCanonicalPrompt(prepared) }],
      },
    ],
  };
}

function buildKimiRequest(prepared) {
  const prompt = buildCanonicalPrompt(prepared);
  return {
    provider: 'kimi',
    model: 'kimi-k2',
    messages: [
      { role: 'system', content: 'Return only JSON matching the canonical ITL schema.' },
      { role: 'user', content: prompt },
    ],
  };
}

function buildOpenAiChallengeRequest(prepared) {
  const prompt = buildAdversarialPrompt(prepared);
  return {
    provider: 'openai',
    model: 'gpt-4.1',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'itl_adversarial_challenge',
        schema: 'adversarial-challenge',
      },
    },
    messages: [
      { role: 'system', content: 'Return only JSON matching the adversarial ITL challenge schema.' },
      { role: 'user', content: prompt },
    ],
  };
}

function buildClaudeChallengeRequest(prepared) {
  return {
    provider: 'claude',
    model: 'claude-sonnet',
    system: 'Return only JSON matching the adversarial ITL challenge schema.',
    messages: [
      {
        role: 'user',
        content: buildAdversarialPrompt(prepared),
      },
    ],
  };
}

function buildGeminiChallengeRequest(prepared) {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    systemInstruction: {
      parts: [{ text: 'Return only JSON matching the adversarial ITL challenge schema.' }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildAdversarialPrompt(prepared) }],
      },
    ],
  };
}

function buildKimiChallengeRequest(prepared) {
  const prompt = buildAdversarialPrompt(prepared);
  return {
    provider: 'kimi',
    model: 'kimi-k2',
    messages: [
      { role: 'system', content: 'Return only JSON matching the adversarial ITL challenge schema.' },
      { role: 'user', content: prompt },
    ],
  };
}

function buildInternalRequest(prepared) {
  return {
    provider: 'internal',
    mode: 'deterministic',
    narrative: prepared.narrative,
    project_initialized: prepared.project_initialized,
  };
}

function buildPreparedInput(input) {
  return {
    narrative: String(input?.narrative || '').trim(),
    project_initialized: Boolean(input?.project_initialized),
    provider_response: input?.provider_response,
  };
}

function buildPreparedChallengeInput(input) {
  return {
    narrative: String(input?.narrative || '').trim(),
    project_initialized: Boolean(input?.project_initialized),
    interpretation: input?.interpretation,
    provider_response: input?.provider_response,
  };
}

function createProviderAdapter(provider) {
  if (provider === 'internal') {
    return {
      name: 'heuristic-extractor',
      provider,
      prepareInput: buildPreparedInput,
      prepareChallengeInput: buildPreparedChallengeInput,
      buildRequest: buildInternalRequest,
      buildChallengeRequest: buildInternalRequest,
      challenge() {
        return normalizeProviderChallenge({
          summary: 'No model adversarial challenge was supplied for the internal adapter.',
          findings: [],
          requires_escalation: false,
        });
      },
      interpret(input) {
        return extractIntentFromNarrative(input.narrative, {
          project_initialized: input.project_initialized,
        });
      },
    };
  }

  if (provider === 'openai') {
    return {
      name: 'openai-adapter',
      provider,
      prepareInput: buildPreparedInput,
      prepareChallengeInput: buildPreparedChallengeInput,
      buildRequest: buildOpenAiRequest,
      buildChallengeRequest: buildOpenAiChallengeRequest,
      challenge(input) {
        if (input.provider_response !== undefined) {
          return parseOpenAiStyleChallengeResponse(input.provider_response);
        }
        return normalizeProviderChallenge({
          summary: 'No model adversarial challenge response was supplied.',
          findings: [],
          requires_escalation: false,
        });
      },
      interpret(input) {
        if (input.provider_response !== undefined) {
          return parseOpenAiStyleResponse(input.provider_response, input, provider);
        }
        return normalizeProviderInterpretation(
          extractIntentFromNarrative(input.narrative, {
            project_initialized: input.project_initialized,
          }),
          input,
          provider,
          'openai-adapter'
        );
      },
    };
  }

  if (provider === 'claude') {
    return {
      name: 'claude-adapter',
      provider,
      prepareInput: buildPreparedInput,
      prepareChallengeInput: buildPreparedChallengeInput,
      buildRequest: buildClaudeRequest,
      buildChallengeRequest: buildClaudeChallengeRequest,
      challenge(input) {
        if (input.provider_response !== undefined) {
          return parseClaudeChallengeResponse(input.provider_response);
        }
        return normalizeProviderChallenge({
          summary: 'No model adversarial challenge response was supplied.',
          findings: [],
          requires_escalation: false,
        });
      },
      interpret(input) {
        if (input.provider_response !== undefined) {
          return parseClaudeResponse(input.provider_response, input);
        }
        return normalizeProviderInterpretation(
          extractIntentFromNarrative(input.narrative, {
            project_initialized: input.project_initialized,
          }),
          input,
          provider,
          'claude-adapter'
        );
      },
    };
  }

  if (provider === 'gemini') {
    return {
      name: 'gemini-adapter',
      provider,
      prepareInput: buildPreparedInput,
      prepareChallengeInput: buildPreparedChallengeInput,
      buildRequest: buildGeminiRequest,
      buildChallengeRequest: buildGeminiChallengeRequest,
      challenge(input) {
        if (input.provider_response !== undefined) {
          return parseGeminiChallengeResponse(input.provider_response);
        }
        return normalizeProviderChallenge({
          summary: 'No model adversarial challenge response was supplied.',
          findings: [],
          requires_escalation: false,
        });
      },
      interpret(input) {
        if (input.provider_response !== undefined) {
          return parseGeminiResponse(input.provider_response, input);
        }
        return normalizeProviderInterpretation(
          extractIntentFromNarrative(input.narrative, {
            project_initialized: input.project_initialized,
          }),
          input,
          provider,
          'gemini-adapter'
        );
      },
    };
  }

  if (provider === 'kimi') {
    return {
      name: 'kimi-adapter',
      provider,
      prepareInput: buildPreparedInput,
      prepareChallengeInput: buildPreparedChallengeInput,
      buildRequest: buildKimiRequest,
      buildChallengeRequest: buildKimiChallengeRequest,
      challenge(input) {
        if (input.provider_response !== undefined) {
          return parseKimiChallengeResponse(input.provider_response);
        }
        return normalizeProviderChallenge({
          summary: 'No model adversarial challenge response was supplied.',
          findings: [],
          requires_escalation: false,
        });
      },
      interpret(input) {
        if (input.provider_response !== undefined) {
          return parseKimiResponse(input.provider_response, input);
        }
        return normalizeProviderInterpretation(
          extractIntentFromNarrative(input.narrative, {
            project_initialized: input.project_initialized,
          }),
          input,
          provider,
          'kimi-adapter'
        );
      },
    };
  }

  throw new Error(`Unsupported ITL provider "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('ITL adapter must be an object.');
  }
  if (typeof adapter.name !== 'string' || !adapter.name.trim()) {
    throw new Error('ITL adapter must define a non-empty name.');
  }
  if (typeof adapter.interpret !== 'function') {
    throw new Error(`ITL adapter "${adapter.name}" must define an interpret() function.`);
  }
  return adapter;
}

function getSupportedProviders() {
  return [...SUPPORTED_PROVIDERS];
}

function getInterpretationAdapter(provider = DEFAULT_PROVIDER) {
  return createProviderAdapter(provider || DEFAULT_PROVIDER);
}

function getDefaultInterpretationAdapter() {
  return getInterpretationAdapter(DEFAULT_PROVIDER);
}

function buildProviderRequest(input, provider = DEFAULT_PROVIDER) {
  const adapter = validateAdapter(getInterpretationAdapter(provider));
  const prepared = typeof adapter.prepareInput === 'function'
    ? adapter.prepareInput(input)
    : input;

  return typeof adapter.buildRequest === 'function'
    ? adapter.buildRequest(prepared)
    : buildInternalRequest(prepared);
}

function buildAdversarialRequest(input, provider = DEFAULT_PROVIDER) {
  const adapter = validateAdapter(getInterpretationAdapter(provider));
  const prepared = typeof adapter.prepareChallengeInput === 'function'
    ? adapter.prepareChallengeInput(input)
    : input;

  return typeof adapter.buildChallengeRequest === 'function'
    ? adapter.buildChallengeRequest(prepared)
    : buildInternalRequest(prepared);
}

function interpretNarrativeWithAdapter(input, adapter = getDefaultInterpretationAdapter()) {
  const validAdapter = validateAdapter(adapter);
  const prepared = typeof validAdapter.prepareInput === 'function'
    ? validAdapter.prepareInput(input)
    : input;

  const rawInterpretation = validAdapter.interpret(prepared);
  return parseInterpretation(rawInterpretation, {
    narrative: prepared?.narrative,
    project_initialized: prepared?.project_initialized,
    provider: validAdapter.provider || DEFAULT_PROVIDER,
    source: validAdapter.name,
  });
}

function challengeInterpretationWithAdapter(input, adapter = getDefaultInterpretationAdapter()) {
  const validAdapter = validateAdapter(adapter);
  const prepared = typeof validAdapter.prepareChallengeInput === 'function'
    ? validAdapter.prepareChallengeInput(input)
    : input;

  if (typeof validAdapter.challenge !== 'function') {
    return parseAdversarialChallenge({
      summary: 'Selected adapter does not implement a model adversarial challenge path.',
      findings: [],
      requires_escalation: false,
    });
  }

  return parseAdversarialChallenge(validAdapter.challenge(prepared));
}

module.exports = {
  DEFAULT_PROVIDER,
  buildAdversarialPrompt,
  buildCanonicalPrompt,
  buildAdversarialRequest,
  buildProviderRequest,
  getDefaultInterpretationAdapter,
  getInterpretationAdapter,
  getSupportedProviders,
  interpretNarrativeWithAdapter,
  challengeInterpretationWithAdapter,
  validateAdapter,
};
