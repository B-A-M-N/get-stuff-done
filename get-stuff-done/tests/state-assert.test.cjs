const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const coreModulePath = path.resolve(__dirname, '..', 'bin', 'lib', 'core.cjs');
const stateModulePath = path.resolve(__dirname, '..', 'bin', 'lib', 'state.cjs');

function createProject(baseDir, files = {}) {
  const planningDir = path.join(baseDir, '.planning');
  const phasesDir = path.join(planningDir, 'phases');

  // Ensure base files
  if (files.PROJECT !== false) {
    fs.writeFileSync(path.join(baseDir, 'PROJECT.md'), files.PROJECT || '# Project\n');
  }
  if (files.STATE !== false) {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), files.STATE || '---\nstatus: active\n---\n');
  }
  if (files.config !== false) {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), files.config || '{}');
  }
  if (files.ROADMAP !== false) {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), files.ROADMAP || '# Roadmap\n');
  }
  if (files.phases !== false) {
    fs.mkdirSync(phasesDir, { recursive: true });
  }
  if (files.checkpoint) {
    const phaseDirName = files.phaseDir || '99-test';
    const phaseDir = path.join(phasesDir, phaseDirName);
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'CHECKPOINT.md'), files.checkpoint);
    return { phaseDir };
  }
  return {};
}

test('state assert passes when all preconditions met', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  try {
    createProject(tempDir);

    const statePath = path.join(tempDir, '.planning', 'STATE.md');
    const stubMap = {
      [statePath]: fs.readFileSync(statePath, 'utf-8')
    };

    delete require.cache[require.resolve(coreModulePath)];
    const core = require(coreModulePath);
    const originalSafeReadFile = core.safeReadFile;
    core.safeReadFile = (filePath) => stubMap[filePath] || (originalSafeReadFile ? originalSafeReadFile(filePath) : null);

    delete require.cache[require.resolve(stateModulePath)];
    const state = require(stateModulePath);

    let exitCode = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };

    try {
      state.cmdStateAssert(tempDir, false);
      assert.fail('Should have called exit');
    } catch (e) {
      if (e.message === 'EXIT') {
        assert.strictEqual(exitCode, 0, 'Exit code should be 0 on success');
      } else {
        throw e;
      }
    } finally {
      process.exit = originalExit;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('state assert fails when PROJECT.md missing', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  try {
    createProject(tempDir, { PROJECT: false });

    const statePath = path.join(tempDir, '.planning', 'STATE.md');
    const stubMap = {
      [statePath]: fs.readFileSync(statePath, 'utf-8')
    };

    delete require.cache[require.resolve(coreModulePath)];
    const core = require(coreModulePath);
    const originalSafeReadFile = core.safeReadFile;
    core.safeReadFile = (filePath) => stubMap[filePath] || (originalSafeReadFile ? originalSafeReadFile(filePath) : null);

    delete require.cache[require.resolve(stateModulePath)];
    const state = require(stateModulePath);

    let exitCode = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };

    try {
      state.cmdStateAssert(tempDir, false);
      assert.fail('Should have called exit');
    } catch (e) {
      if (e.message === 'EXIT') {
        assert.strictEqual(exitCode, 1, 'Exit code should be 1');
      } else {
        throw e;
      }
    } finally {
      process.exit = originalExit;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('state assert fails when clarification_status is blocked', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  try {
    createProject(tempDir, {
      STATE: '---\nstatus: active\nclarification_status: blocked\n---\n'
    });

    const statePath = path.join(tempDir, '.planning', 'STATE.md');
    const stubMap = {
      [statePath]: fs.readFileSync(statePath, 'utf-8')
    };

    delete require.cache[require.resolve(coreModulePath)];
    const core = require(coreModulePath);
    const originalSafeReadFile = core.safeReadFile;
    core.safeReadFile = (filePath) => stubMap[filePath] || (originalSafeReadFile ? originalSafeReadFile(filePath) : null);

    delete require.cache[require.resolve(stateModulePath)];
    const state = require(stateModulePath);

    let exitCode = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };

    try {
      state.cmdStateAssert(tempDir, false);
      assert.fail('Should have called exit');
    } catch (e) {
      if (e.message === 'EXIT') {
        assert.strictEqual(exitCode, 1, 'Exit code should be 1');
      } else {
        throw e;
      }
    } finally {
      process.exit = originalExit;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('state assert fails when phase checkpoint awaiting response exists', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  try {
    createProject(tempDir, {
      STATE: '---\nstatus: active\n---\n',
      checkpoint: '---\nstatus: awaiting-response\n---\n',
      phaseDir: '99-test-phase' // ensure consistent name
    });

    const statePath = path.join(tempDir, '.planning', 'STATE.md');
    const checkpointPath = path.join(tempDir, '.planning', 'phases', '99-test-phase', 'CHECKPOINT.md');
    const stubMap = {
      [statePath]: fs.readFileSync(statePath, 'utf-8'),
      [checkpointPath]: fs.readFileSync(checkpointPath, 'utf-8')
    };

    delete require.cache[require.resolve(coreModulePath)];
    const core = require(coreModulePath);
    const originalSafeReadFile = core.safeReadFile;
    core.safeReadFile = (filePath) => stubMap[filePath] || (originalSafeReadFile ? originalSafeReadFile(filePath) : null);

    delete require.cache[require.resolve(stateModulePath)];
    const state = require(stateModulePath);

    let exitCode = null;
    const originalExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('EXIT'); };

    try {
      state.cmdStateAssert(tempDir, false);
      assert.fail('Should have called exit');
    } catch (e) {
      if (e.message === 'EXIT') {
        assert.strictEqual(exitCode, 1, 'Exit code should be 1');
      } else {
        throw e;
      }
    } finally {
      process.exit = originalExit;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
