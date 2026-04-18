/**
 * Public re-export of the condition-evaluation primitives so that downstream
 * consumers (e.g. the composition engine) can flatten conditional
 * {@link TextContent} trees without constructing a full
 * {@link RuleEvaluationContext}.
 *
 * These are the same primitives used internally by the engine's rule
 * pipeline, surfaced here without promoting the rest of `internal/` to the
 * public API.
 */
export { conditionMatches } from './internal/conditions.js';
export type { ConditionEvalContext } from './internal/conditions.js';
