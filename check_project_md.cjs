const { normalizeInternal } = require('./get-stuff-done/bin/lib/internal-normalizer.cjs');

(async () => {
  try {
    const artifacts = await normalizeInternal(process.cwd());
    const projectMd = artifacts.find(a => a.source_uri === '.planning/PROJECT.md');
    console.log(JSON.stringify(projectMd, null, 2));
    // Since normalizeInternal calls secondBrain.ingestArtifact, which has a connection pool,
    // we might need to close it if we want the process to exit cleanly.
    // However, for this simple CLI tool, it might just be fine to let it exit.
    // Actually, Second Brain's pool might keep the process open.
    // Let's check if we can close it.
    const secondBrain = require('./get-stuff-done/bin/lib/second-brain.cjs');
    await secondBrain.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
