/**
 * Provenance Chain — Unit tests with mocked Postgres
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const provenanceChain = require('../get-stuff-done/bin/lib/provenance-chain.cjs');
const synthesisStore = require('../get-stuff-done/bin/lib/synthesis-store.cjs');
const secondBrain = require('../get-stuff-done/bin/lib/second-brain.cjs');

describe('Provenance Chain (Phase 12-02)', () => {
  let mockPool;
  let originalPool;

  function setupMock(data) {
    mockPool = {
      query: async (sql, params) => {
        // Simple mock: if data contains matching row, return it
        // For this test, we'll manually configure mock in each test
        return { rows: [], rowCount: 0, command: '' };
      }
    };
    originalPool = secondBrain.pool;
    secondBrain.pool = mockPool;
  }

  function restorePool() {
    if (originalPool) {
      secondBrain.pool = originalPool;
    }
  }

  beforeEach(() => {
    // Default: mock getArtifactWithSections via synthesisStore
    // We'll override per test
  });

  afterEach(() => {
    restorePool();
  });

  describe('buildProvenanceGraph', () => {
    test('builds correct graph for artifact with atoms and citations (Phase 52 pattern)', async () => {
      // Mock artifact with 4 atoms, 5 citations, 0 sections
      const mockArtifact = {
        id: 'syn_7aa51411a4c1de59',
        mission_id: '52',
        artifact_type: 'phase-truth',
        content: 'yaml content',
        atom_ids_used: [
          '.planning/phases/52-truth-enforcement-hardening/52-01-SUMMARY.md',
          '.planning/phases/52-truth-enforcement-hardening/52-02-SUMMARY.md',
          '.planning/phases/52-truth-enforcement-hardening/52-03-SUMMARY.md',
          '.planning/phases/52-truth-enforcement-hardening/52-04-SUMMARY.md'
        ],
        synthesis_citations: [
          { type: 'file', ref: '.planning/phases/52-truth-enforcement-hardening/52-01-SUMMARY.md' },
          { type: 'file', ref: '.planning/phases/52-truth-enforcement-hardening/52-02-SUMMARY.md' },
          { type: 'file', ref: '.planning/phases/52-truth-enforcement-hardening/52-03-SUMMARY.md' },
          { type: 'file', ref: '.planning/phases/52-truth-enforcement-hardening/52-04-SUMMARY.md' },
          { type: 'command', ref: 'phase-truth generate 52' }
        ]
      };

      // Mock getArtifactWithSections
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return { rows: [mockArtifact], rowCount: 1, command: 'SELECT' };
        }
        if (sql.includes('SELECT * FROM authority.synthesis_sections WHERE artifact_id')) {
          return { rows: [], rowCount: 0, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const result = await provenanceChain.buildProvenanceGraph('syn_7aa51411a4c1de59');

      assert.ok(!result.error, `Should not have error: ${result.error}`);
      assert.strictEqual(result.nodes.length, 10, 'Expected 10 nodes: 1 artifact + 4 atoms + 5 citations');
      assert.strictEqual(result.edges.length, 9, 'Expected 9 edges: 4 cites-atom + 5 includes_citation');

      // Verify node types
      const artifactNode = result.nodes.find(n => n.type === 'artifact');
      assert.ok(artifactNode, 'Should have artifact node');

      const atomNodes = result.nodes.filter(n => n.type === 'atom');
      assert.strictEqual(atomNodes.length, 4, 'Should have 4 atom nodes');

      const citationNodes = result.nodes.filter(n => n.type === 'citation');
      assert.strictEqual(citationNodes.length, 5, 'Should have 5 citation nodes');

      // Verify edges
      const citesEdges = result.edges.filter(e => e.predicate === 'cites');
      const includesCitationEdges = result.edges.filter(e => e.predicate === 'includes_citation');
      assert.strictEqual(citesEdges.length, 4);
      assert.strictEqual(includesCitationEdges.length, 5);
    });

    test('includes sections and section atoms (depth 2)', async () => {
      const mockArtifact = {
        id: 'syn_123',
        mission_id: '52',
        artifact_type: 'phase-truth',
        content: 'content',
        atom_ids_used: ['atom0'],
        synthesis_citations: [],
        sections: [
          {
            id: 'sec_1',
            mission_id: '52',
            artifact_id: 'syn_123',
            section_key: 'goals',
            section_content: 'Goal 1',
            atom_ids_used: ['atom1', 'atom2'],
            synthesis_citations: [{ type: 'file', ref: 'summary.md' }]
          }
        ]
      };

      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return { rows: [mockArtifact], rowCount: 1, command: 'SELECT' };
        }
        if (sql.includes('SELECT * FROM authority.synthesis_sections WHERE artifact_id')) {
          return { rows: mockArtifact.sections, rowCount: mockArtifact.sections.length, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const result = await provenanceChain.buildProvenanceGraph('syn_123');

      assert.ok(!result.error);
      // nodes: artifact(1) + artifact atoms(1) + section(1) + section atoms(2) + section citation(1) = 6
      assert.strictEqual(result.nodes.length, 6);
      assert.strictEqual(result.edges.length, 5); // artifact-cites-atom(1) + artifact-contains-section(1) + section-cites-atoms(2) + section-includes-citation(1)

      const sectionNodes = result.nodes.filter(n => n.type === 'section');
      assert.strictEqual(sectionNodes.length, 1);
    });

    test('rejects missing artifact', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return { rows: [], rowCount: 0, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const result = await provenanceChain.buildProvenanceGraph('nonexistent');
      assert.strictEqual(result.nodes.length, 0);
      assert.ok(result.error.includes('not found'));
    });

    test('enforces node cap', async () => {
      const manyAtoms = Array.from({ length: 2000 }, (_, i) => `atom${i}`);
      const mockArtifact = {
        id: 'syn_big',
        mission_id: '52',
        artifact_type: 'phase-truth',
        content: 'content',
        atom_ids_used: manyAtoms,
        synthesis_citations: [],
        sections: []
      };

      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return { rows: [mockArtifact], rowCount: 1, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const result = await provenanceChain.buildProvenanceGraph('syn_big', { max_nodes: 1000 });
      assert.ok(result.error.includes('exceeds node limit'));
    });

    test('detects cycles (DAG check)', async () => {
      // This is a synthetic test to verify cycle detection works
      // We'll create a graph manually by calling the internal detector
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'a' } // cycle
      ];

      const hasCycle = provenanceChain.detectCycle(nodes, edges);
      assert.strictEqual(hasCycle, true);
    });

    test('no cycle in DAG', async () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' }
      ];

      const hasCycle = provenanceChain.detectCycle(nodes, edges);
      assert.strictEqual(hasCycle, false);
    });
  });

  describe('getMissionProvenanceSummary', () => {
    test('computes correct stats for Phase 52', async () => {
      // Mock findArtifacts to return Phase 52 pattern
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE mission_id')) {
          return {
            rows: [{
              id: 'syn_7aa51411a4c1de59',
              mission_id: '52',
              atom_ids_used: ['a.md', 'b.md', 'c.md', 'd.md'],
              synthesis_citations: [
                { type: 'file', ref: 'a.md' },
                { type: 'file', ref: 'b.md' },
                { type: 'file', ref: 'c.md' },
                { type: 'file', ref: 'd.md' },
                { type: 'command', ref: 'cmd' }
              ]
            }],
            rowCount: 1,
            command: 'SELECT'
          };
        }
        if (sql.includes('SELECT * FROM authority.synthesis_sections WHERE artifact_id')) {
          return { rows: [], rowCount: 0, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const summary = await provenanceChain.getMissionProvenanceSummary('52');

      assert.strictEqual(summary.artifact_count, 1);
      assert.strictEqual(summary.total_atom_refs, 4);
      assert.strictEqual(summary.unique_atoms, 4);
      assert.strictEqual(summary.avg_atoms_per_artifact, 4);
      assert.strictEqual(summary.citation_distribution.file, 4);
      assert.strictEqual(summary.citation_distribution.command, 1);
    });

    test('handles empty mission gracefully', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE mission_id')) {
          return { rows: [], rowCount: 0, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const summary = await provenanceChain.getMissionProvenanceSummary('99');
      assert.strictEqual(summary.artifact_count, 0);
      assert.strictEqual(summary.total_atom_refs, 0);
    });
  });

  describe('getDirectAtoms', () => {
    test('returns atoms for artifact', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return {
            rows: [{
              id: 'syn_123',
              atom_ids_used: ['a.md', 'b.md']
            }],
            rowCount: 1,
            command: 'SELECT'
          };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const atoms = await provenanceChain.getDirectAtoms('syn_123', 'artifact');
      assert.deepStrictEqual(atoms, ['a.md', 'b.md']);
    });

    test('returns atoms for section', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT atom_ids_used FROM authority.synthesis_sections WHERE id')) {
          return {
            rows: [{ atom_ids_used: ['sec_atom1', 'sec_atom2'] }],
            rowCount: 1,
            command: 'SELECT'
          };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const atoms = await provenanceChain.getDirectAtoms('sec_1', 'section');
      assert.deepStrictEqual(atoms, ['sec_atom1', 'sec_atom2']);
    });

    test('returns empty array for missing artifact', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('SELECT * FROM authority.synthesis_artifacts WHERE id')) {
          return { rows: [], rowCount: 0, command: 'SELECT' };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const atoms = await provenanceChain.getDirectAtoms('nonexistent', 'artifact');
      assert.strictEqual(atoms.length, 0);
    });

    test('throws on invalid entityType', async () => {
      await assert.rejects(
        async () => {
          await provenanceChain.getDirectAtoms('id', 'invalid');
        },
        /Invalid entityType/
      );
    });
  });

  describe('findAtomsUsage', () => {
    test('returns artifacts and sections citing atom', async () => {
      secondBrain.pool.query = async (sql, params) => {
        if (sql.includes('authority.synthesis_artifacts WHERE atom_ids_used @>')) {
          return {
            rows: [{ id: 'syn_1', artifact_type: 'type', mission_id: '52', created_at: new Date() }],
            rowCount: 1,
            command: 'SELECT'
          };
        }
        if (sql.includes('authority.synthesis_sections WHERE atom_ids_used @>')) {
          return {
            rows: [{ id: 'sec_1', artifact_id: 'syn_1', section_key: 'sec1' }],
            rowCount: 1,
            command: 'SELECT'
          };
        }
        return { rows: [], rowCount: 0, command: '' };
      };

      const result = await provenanceChain.findAtomsUsage('file.md');
      assert.ok(result.artifacts);
      assert.ok(result.sections);
      assert.strictEqual(result.artifacts.length, 1);
      assert.strictEqual(result.sections.length, 1);
    });

    test('handles errors gracefully', async () => {
      secondBrain.pool.query = async () => {
        throw new Error('DB error');
      };

      const result = await provenanceChain.findAtomsUsage('file.md');
      assert.strictEqual(result.artifacts.length, 0);
      assert.strictEqual(result.sections.length, 0);
    });
  });
});
