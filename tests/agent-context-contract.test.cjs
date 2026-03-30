const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENT_FILES = [
  'agents/gsd-planner.md',
  'agents/gsd-phase-researcher.md',
  'agents/gsd-project-researcher.md',
  'agents/gsd-ui-researcher.md',
];

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

for (const relPath of AGENT_FILES) {
  test(`${relPath} uses unified Firecrawl context instructions`, () => {
    const content = read(relPath);

    assert.match(content, /context\/crawl/);
    assert.match(content, /crawl\(spec\)/);
    assert.match(content, /Do NOT use direct filesystem reads/);
    assert.doesNotMatch(content, /^tools:.*WebSearch/m);
    assert.doesNotMatch(content, /^tools:.*WebFetch/m);
    assert.doesNotMatch(content, /Read\([^)]+\.planning/);
  });
}
