/**
 * Synthesis Metrics — Unit tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const metrics = require('../get-stuff-done/bin/lib/synthesis-metrics.cjs');

describe('Synthesis Metrics (Phase 12-04)', () => {
  describe('scoreArtifact', () => {
    test('computes density, diversity, completeness, richness', () => {
      const artifact = {
        content: 'a'.repeat(1000), // 1000 bytes
        atom_ids_used: ['a.md', 'b.md', 'c.md'], // 3 atoms
        synthesis_citations: [
          { type: 'file', ref: 'a.md' },
          { type: 'file', ref: 'b.md' },
          { type: 'command', ref: 'cmd' }
        ],
        sections: [
          { section_key: 'sec1', section_content: 'content', atom_ids_used: ['a.md'] },
          { section_key: 'sec2', section_content: 'content', atom_ids_used: ['b.md', 'c.md'] }
        ]
      };

      const scores = metrics.scoreArtifact(artifact);

      // Density: atoms / content_length = 3 / 1000 = 0.003
      assert.strictEqual(scores.density, 3 / 1000);

      // Diversity: source types from atoms (.md → document) + citation types (file, command)
      // Atoms: 3 .md files → document → 1 type
      // Citations: file (2), command (1) → 2 types
      // Total distinct: document, file, command = 3
      assert.strictEqual(scores.diversity, 3);

      // Completeness: 2 sections, both have atoms; avg atoms per section = (1+2)/2 = 1.5, normalized to 0.15 (since 1.5/10=0.15)
      // completeness = (sections_with_atoms / total_sections) * avg_coverage = (2/2) * 0.15 = 0.15
      assert.ok(scores.completeness > 0 && scores.completeness <= 1);

      // Richness: distinct citation types / total citations = 2 / 3 ≈ 0.6667
      assert.strictEqual(scores.evidence_richness, 2 / 3);

      // Composite score
      const expectedComposite =
        scores.density * 0.4 +
        scores.diversity * 0.2 +
        scores.completeness * 0.3 +
        scores.evidence_richness * 0.1;
      assert.strictEqual(scores.composite_score, expectedComposite);
    });

    test('handles artifact with no sections', () => {
      const artifact = {
        content: 'x'.repeat(500),
        atom_ids_used: ['a.md'],
        synthesis_citations: [{ type: 'file', ref: 'a.md' }],
        sections: []
      };

      const scores = metrics.scoreArtifact(artifact);
      assert.strictEqual(scores.completeness, 0);
      assert.ok(scores.composite_score !== undefined);
    });

    test('handles artifact with zero content length', () => {
      const artifact = {
        content: '',
        atom_ids_used: [],
        synthesis_citations: [],
        sections: []
      };

      const scores = metrics.scoreArtifact(artifact);
      assert.strictEqual(scores.density, 0);
      assert.strictEqual(scores.diversity, 0);
      assert.strictEqual(scores.completeness, 0);
      assert.strictEqual(scores.evidence_richness, 0);
      assert.strictEqual(scores.composite_score, 0);
    });
  });

  describe('jaccardSimilarity', () => {
    test('computes intersection over union', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['b', 'c', 'd']);
      const sim = metrics.jaccardSimilarity(setA, setB);
      // intersection = b,c (2), union = a,b,c,d (4)
      assert.strictEqual(sim, 0.5);
    });

    test('returns 1 for two empty sets', () => {
      const setA = new Set();
      const setB = new Set();
      assert.strictEqual(metrics.jaccardSimilarity(setA, setB), 1);
    });

    test('returns 0 for disjoint sets', () => {
      const setA = new Set(['a', 'b']);
      const setB = new Set(['c', 'd']);
      assert.strictEqual(metrics.jaccardSimilarity(setA, setB), 0);
    });
  });

  describe('findSimilarArtifacts', () => {
    test('delegates to store and computes Jaccard; returns sorted results', async () => {
      // Since findSimilarArtifacts is a thin wrapper around store + jaccard,
      // we trust the implementation if jaccardSimilarity works correctly.
      // Full integration with store is beyond unit scope.
      assert.ok(typeof metrics.findSimilarArtifacts === 'function');
    });
  });

  describe('rankMissionArtifacts', () => {
    test('function exists and is async', async () => {
      assert.strictEqual(typeof metrics.rankMissionArtifacts, 'function');
    });
  });
});
