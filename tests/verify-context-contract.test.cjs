const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup } = require('./helpers.cjs');

function withMockedVerify(run) {
  const corePath = require.resolve('../get-stuff-done/bin/lib/core.cjs');
  const verifyPath = require.resolve('../get-stuff-done/bin/lib/verify.cjs');
  const originalCore = require.cache[corePath];
  const originalVerify = require.cache[verifyPath];
  const calls = [];
  const baseCore = originalCore ? originalCore.exports : require(corePath);

  require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
      ...baseCore,
      output(result, raw, rawValue) {
        calls.push({ result, raw, rawValue });
      },
      error(message) {
        throw new Error(message);
      },
    },
  };

  delete require.cache[verifyPath];

  try {
    const verify = require(verifyPath);
    return run(verify, calls);
  } finally {
    delete require.cache[verifyPath];
    if (originalCore) {
      require.cache[corePath] = originalCore;
    } else {
      delete require.cache[corePath];
    }
    if (originalVerify) {
      require.cache[verifyPath] = originalVerify;
    }
  }
}

describe('verify context-contract command', () => {
  test('passes when guidance-only items stay out of locked decisions', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<decisions>',
        '## Implementation Decisions',
        '### Output',
        '- Use JSON output by default.',
        '</decisions>',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));

      withMockedVerify((verify, calls) => {
        verify.cmdVerifyContextContract(tmpDir, '.planning/phases/01-test/01-CONTEXT.md', null, false);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, true);
        assert.ok(calls[0].result.domain_contract);
        assert.ok(calls[0].result.domain_contract.unresolved_ambiguities.includes('Whether pagination should be automatic.'));
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  test('fails when guidance-only items are duplicated in implementation decisions', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<decisions>',
        '## Implementation Decisions',
        '### Output',
        '- Existing API auth can be reused.',
        '</decisions>',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));

      withMockedVerify((verify, calls) => {
        verify.cmdVerifyContextContract(tmpDir, '.planning/phases/01-test/01-CONTEXT.md', null, false);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, false);
        assert.ok(calls[0].result.errors.some(error => error.includes('Guidance-only item duplicated')));
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  test('fails when plan hardens unresolved items without safety markers', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<decisions>',
        '## Implementation Decisions',
        '### Output',
        '- Use JSON output by default.',
        '</decisions>',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));
      fs.writeFileSync(planPath, [
        'The implementation will assume Existing API auth can be reused.',
        'The task also decides Whether pagination should be automatic.',
      ].join('\n'));

      withMockedVerify((verify, calls) => {
        verify.cmdVerifyContextContract(
          tmpDir,
          '.planning/phases/01-test/01-CONTEXT.md',
          '.planning/phases/01-test/01-01-PLAN.md',
          false
        );
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, false);
        assert.ok(calls[0].result.errors.some(error => error.includes('Unresolved ambiguity appears in the research')));
        assert.ok(calls[0].result.errors.some(error => error.includes('Interpreted assumption appears in the research')));
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  test('passes when plan carries unresolved items forward as assumptions/open questions', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      const planPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<decisions>',
        '## Implementation Decisions',
        '### Output',
        '- Use JSON output by default.',
        '</decisions>',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));
      fs.writeFileSync(planPath, [
        'Open question: Whether pagination should be automatic.',
        'Assumption: Existing API auth can be reused.',
        'Deferred follow-up if those assumptions fail.',
      ].join('\n'));

      withMockedVerify((verify, calls) => {
        verify.cmdVerifyContextContract(
          tmpDir,
          '.planning/phases/01-test/01-CONTEXT.md',
          '.planning/phases/01-test/01-01-PLAN.md',
          false
        );
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, true);
      });
    } finally {
      cleanup(tmpDir);
    }
  });
});
