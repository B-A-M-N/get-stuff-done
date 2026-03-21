const { normalizeInternal } = require('./get-stuff-done/bin/lib/internal-normalizer.cjs');
const artifacts = normalizeInternal(process.cwd());
const projectMd = artifacts.find(a => a.source_uri === '.planning/PROJECT.md');
console.log(JSON.stringify(projectMd, null, 2));
