/**
 * ITL Adapters — provider-agnostic adapter seam for canonical interpretation.
 */

const { extractIntentFromNarrative } = require('./itl-extract.cjs');
const { parseInterpretation } = require('./itl-schema.cjs');

const SUPPORTED_PROVIDERS = ['internal', 'claude', 'openai', 'gemini', 'kimi'];
const DEFAULT_PROVIDER = 'internal';

function buildCanonicalPrompt(input) {
  const initialized = input.project_initialized ? 'true' : 'false';
  return [
    'Interpret the narrative into the canonical ITL schema.',
    'Return JSON only.',
    'Required keys: goals, constraints, preferences, anti_requirements, success_criteria, risks, unknowns, assumptions, route_hint, project_initialized.',
    `project_initialized=${initialized}`,
    '',
    'Narrative:',
    input.narrative,
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

function createProviderAdapter(provider) {
  if (provider === 'internal') {
    return {
      name: 'heuristic-extractor',
      provider,
      prepareInput: buildPreparedInput,
      buildRequest: buildInternalRequest,
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
      buildRequest: buildOpenAiRequest,
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
      buildRequest: buildClaudeRequest,
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
      buildRequest: buildGeminiRequest,
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
      buildRequest: buildKimiRequest,
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

module.exports = {
  DEFAULT_PROVIDER,
  buildCanonicalPrompt,
  buildProviderRequest,
  getDefaultInterpretationAdapter,
  getInterpretationAdapter,
  getSupportedProviders,
  interpretNarrativeWithAdapter,
  validateAdapter,
};
