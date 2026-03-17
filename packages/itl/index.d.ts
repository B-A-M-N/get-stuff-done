export type Provider = 'internal' | 'claude' | 'openai' | 'gemini' | 'kimi';
export type RouteHint = 'new-project' | 'quick';

export interface InterpretationMetadata {
  source: string;
  provider?: Provider;
  generated_at: string;
  narrative_length: number;
}

export interface Interpretation {
  narrative: string;
  goals: string[];
  constraints: string[];
  preferences: string[];
  anti_requirements: string[];
  success_criteria: string[];
  risks: string[];
  unknowns: string[];
  assumptions: string[];
  route_hint: RouteHint;
  project_initialized: boolean;
  metadata: InterpretationMetadata;
}

export interface AmbiguityFinding {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  evidence: unknown | null;
}

export interface Ambiguity {
  is_ambiguous: boolean;
  severity: 'low' | 'medium' | 'high';
  score: number;
  confidence: number;
  findings: AmbiguityFinding[];
}

export interface LockabilityFinding {
  type: string;
  severity: 'blocker';
  message: string;
  evidence?: unknown | null;
}

export interface Lockability {
  lockable: boolean;
  status: 'lockable' | 'guidance-only';
  findings: LockabilityFinding[];
  summary: string;
}

export interface InterpretationResult {
  narrative: string;
  interpretation: Interpretation;
  ambiguity: Ambiguity;
  lockability: Lockability;
  summary: string;
  provider_request: Record<string, unknown>;
}

export interface ContextData {
  project_initialized?: boolean;
  provider?: Provider;
  provider_response?: unknown;
}

export function interpret_narrative(input_text: string, context_data?: ContextData): InterpretationResult;
export function interpretNarrative(inputText: string, contextData?: ContextData): InterpretationResult;
export function build_provider_request(input_text: string, context_data?: ContextData): Record<string, unknown>;
export function buildProviderRequest(inputText: string, contextData?: ContextData): Record<string, unknown>;
export function get_supported_providers(): Provider[];
export function getSupportedProviders(): Provider[];

export const schemas: {
  interpretation: unknown;
  ambiguity: unknown;
  lockability: unknown;
  result: unknown;
};
