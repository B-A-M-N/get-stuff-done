const assert = require('assert');
const { parsePerformanceMetrics } = require('../get-stuff-done/bin/lib/state.cjs');

const sampleState = `
## Performance Metrics

**Velocity:**

- Total plans completed: 27
- Average duration: 15min
- Total execution time: 405min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 23 | 2 | 20min | 10min |
| 24 | 3 | 45min | 15min |

*Updated after each plan completion*
| Phase 39 P01 | 15min | 3 tasks | 2 files |
| Phase 39 P02 | ~20min | 3 tasks | 2 files |
`;

const metrics = parsePerformanceMetrics(sampleState);

// Test by_phase parsing
assert.strictEqual(metrics.by_phase.length, 2, 'Expected 2 by_phase entries');
assert.strictEqual(metrics.by_phase[0].phase, 23);
assert.strictEqual(metrics.by_phase[0].plans, 2);
assert.strictEqual(metrics.by_phase[0].total, '20min');
assert.strictEqual(metrics.by_phase[0].avg, '10min');
assert.strictEqual(metrics.by_phase[1].phase, 24);
assert.strictEqual(metrics.by_phase[1].plans, 3);

// Test plan_entries parsing
assert.strictEqual(metrics.plan_entries.length, 2, 'Expected 2 plan entries');
assert.strictEqual(metrics.plan_entries[0].phase_plan, 'Phase 39 P01');
assert.strictEqual(metrics.plan_entries[0].duration, '15min');
assert.strictEqual(metrics.plan_entries[0].tasks, 3);
assert.strictEqual(metrics.plan_entries[0].files, 2);
assert.strictEqual(metrics.plan_entries[1].phase_plan, 'Phase 39 P02');
assert.strictEqual(metrics.plan_entries[1].duration, '~20min');
assert.strictEqual(metrics.plan_entries[1].tasks, 3);
assert.strictEqual(metrics.plan_entries[1].files, 2);

console.log('parsePerformanceMetrics: All tests passed');
