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

describe('verify research-contract command', () => {
  test('passes when research carries ambiguity forward as open questions', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      const researchPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-RESEARCH.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));
      fs.writeFileSync(researchPath, [
        '## Open Questions',
        '- Whether pagination should be automatic.',
        '',
        '## Assumptions',
        '- Existing API auth can be reused.',
      ].join('\n'));

      
      withMockedVerify((verify, calls) => {
        verify.cmdVerifyResearchContract(
          tmpDir,
          '.planning/phases/01-test/01-CONTEXT.md',
          '.planning/phases/01-test/01-RESEARCH.md',
          false
        );
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, true);
        assert.ok(calls[0].result.domain_contract);
        assert.ok(calls[0].result.domain_contract.open_questions.includes('Whether pagination should be automatic.'));
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  test('fails when research hardens unresolved items into settled findings', () => {
    const tmpDir = createTempProject();

    try {
      const contextPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-CONTEXT.md');
      const researchPath = path.join(tmpDir, '.planning', 'phases', '01-test', '01-RESEARCH.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, [
        '# Phase 1: Test - Context',
        '',
        '<research_cues>',
        '## Research Cues',
        '### Unresolved Ambiguities',
        '- Whether pagination should be automatic.',
        '### Interpreted Assumptions',
        '- Existing API auth can be reused.',
        '</research_cues>',
      ].join('\n'));
      fs.writeFileSync(researchPath, [
        '## Findings',
        '- Whether pagination should be automatic.',
        '- Existing API auth can be reused.',
      ].join('\n'));

      
      withMockedVerify((verify, calls) => {
        verify.cmdVerifyResearchContract(
          tmpDir,
          '.planning/phases/01-test/01-CONTEXT.md',
          '.planning/phases/01-test/01-RESEARCH.md',
          false
        );
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].result.valid, false);
        assert.ok(calls[0].result.errors.some(error => error.includes('Unresolved ambiguity appears in the plan') || error.includes('Unresolved ambiguity')));
        assert.ok(calls[0].result.errors.some(error => error.includes('Interpreted assumption')));
      });
    } finally {
      cleanup(tmpDir);
    }
  });
});
