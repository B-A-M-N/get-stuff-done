# Feature Landscape: Narrative-First Interaction & Intent Extraction

**Domain:** LLM User Interaction & Workflow Automation
**Researched:** 2024-05-21
**Overall Confidence:** HIGH

## Table Stakes

Features users expect in modern AI agent interactions. Missing these makes the product feel like a legacy chatbot.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Natural Language Intent** | Users don't want to learn a DSL or specific command syntax. | Med | Requires robust extraction from conversational "narrative." |
| **Multi-Step Verification** | Trust but verify. Users need to see what the agent *thinks* it should do. | Low | Simple confirmation gates before destructive actions. |
| **Progress Transparency** | Visibility into the agent's "thinking" or "reasoning" process. | Low | Streaming updates or "thought" blocks. |
| **Standardized Tooling** | Support for common function calling patterns (OpenAI-style). | Med | Ensuring cross-model compatibility for tools. |

## Differentiators

Features that set the product apart by enhancing the user experience without altering core agent logic.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Narrative-First Extraction** | Automatically turns "I want to do X but make sure Y" into structured goals and constraints. | High | Uses provider-specific patterns (XML, SoT, etc.) for high fidelity. |
| **Risk-Aware Friction** | Dynamically scales verification based on action impact (e.g., read vs. delete). | Med | Implementation of a "Risk Matrix" for UX. |
| **Semantic Confirmation** | Summarizes intent back to the user in human terms, highlighting key constraints found. | Med | "I've extracted 3 goals and 2 constraints. Ready to proceed?" |
| **Plugin "Hooks" API** | Allows developers to inject behavior at specific interaction points without modifying GSD core. | High | Middleware/Interceptor pattern for user-side enhancements. |

## Anti-Features

Features to explicitly NOT build to preserve GSD core integrity.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Hardcoded Agent Logic** | Modifying GSD's internal decision-making breaks standard behavior and updates. | Use **Interceptors** or **Pre-processors** to refine user intent *before* GSD sees it. |
| **Provider Locking** | Relying on model-specific features (like Gemini's 1M window) limits portability. | Build **Adapter** layers for narrative extraction patterns. |
| **Auto-Execution of High-Risk Tasks** | Removing human-in-the-loop for destructive actions leads to "agentic accidents." | Implement **Mandatory Verification Gates** based on the Risk Matrix. |

## Feature Dependencies

```mermaid
Narrative Input → Intent Extraction → Semantic Confirmation → Verification Gate → Core Agent Execution
Plugin Hooks → (Wraps) All Stages
```

## Provider-Specific Narrative Patterns

| Provider | Recommended Pattern | Implementation Detail |
|----------|---------------------|-----------------------|
| **Claude** | XML Scaffolding | Wrap intent analysis in `<thought>`, `<intent>`, and `<constraints>` tags for precision. |
| **Gemini** | Event-Stream Trajectory | Leverage large context for "trajectory-based" extraction across long conversations. |
| **OpenAI** | Story of Thought (SoT) | Use high reasoning dials to construct a narrative before extraction. |
| **Kimi** | Agentic Parallelism | Extract sub-intents and spawn parallel verification sub-agents for complex tasks. |

## Intent Extraction Strategies

1.  **Decomposition (Reasoning-First):** Ask the model to explain the user's intent in plain text before outputting structured JSON/XML.
2.  **Atomic Fact Extraction:** Break requests into the smallest verifiable units (e.g., "Goal: Create file", "Constraint: Name must be 'index.js'").
3.  **Chain of Verification (CoVe):** A secondary pass where the model verifies its own extracted constraints against the original user text.

## Reusable Plugin Interface Design

To enhance the user experience while keeping GSD core intact, the plugin interface should follow a **Middleware/Interceptor** pattern:

### API Design (Conceptual)
```typescript
interface GSDPlugin {
  name: string;
  // Pre-process user input to refine intent
  onUserMessage?: (text: string) => Promise<string | IntentDescriptor>;
  
  // Intercept tool calls to apply custom verification or logging
  onToolCall?: (call: ToolCall) => Promise<ActionResolution>;
  
  // Post-process agent output for human-friendly formatting
  onAgentResponse?: (response: AgentResponse) => Promise<string>;
}
```

### Hooks & Config
- **Registration Hook:** `registerPlugin(plugin)` to add to the interaction pipeline.
- **Manifest Config:** `plugin.yaml` to define model-specific prompts for the extraction layer.

## MVP Recommendation

1.  **Core Intent Extractor:** Implementation of "Decomposition" strategy to extract Goals and Constraints into a structured summary.
2.  **Semantic Confirmation UI:** A simple "Here is what I'm about to do" summary with an Approve/Cancel button.
3.  **Risk Matrix Middleware:** A basic interceptor that forces verification on any `write_file` or `run_shell_command` actions.

## Sources

- [Google Research: Gemini Event-Stream Patterns](https://research.google) (HIGH Confidence)
- [Anthropic: Claude XML Tagging Documentation](https://docs.anthropic.com) (HIGH Confidence)
- [OpenAI: Structured Outputs & Reasoning Guide](https://platform.openai.com) (HIGH Confidence)
- [HCI Principles: Matching Friction to Risk](https://shapeof.ai) (MEDIUM Confidence)
