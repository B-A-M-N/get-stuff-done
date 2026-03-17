process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { install, uninstall, finishInstall } = require('../bin/install.js');

describe('coexistence-safe install isolation', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dostuff-isolation-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('copilot install/uninstall preserves existing gsd assets', () => {
    const githubDir = path.join(tmpDir, '.github');
    const legacySkillDir = path.join(githubDir, 'skills', 'gsd-existing');
    const legacyAgentPath = path.join(githubDir, 'agents', 'gsd-executor.agent.md');
    const legacyEnginePath = path.join(githubDir, 'get-stuff-done', 'VERSION');

    fs.mkdirSync(legacySkillDir, { recursive: true });
    fs.writeFileSync(path.join(legacySkillDir, 'SKILL.md'), '# upstream skill\n');
    fs.mkdirSync(path.dirname(legacyAgentPath), { recursive: true });
    fs.writeFileSync(legacyAgentPath, '# upstream agent\n');
    fs.mkdirSync(path.dirname(legacyEnginePath), { recursive: true });
    fs.writeFileSync(legacyEnginePath, 'upstream\n');

    install(false, 'copilot');

    assert.ok(fs.existsSync(path.join(githubDir, 'skills', 'gsd-existing', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(githubDir, 'agents', 'gsd-executor.agent.md')));
    assert.ok(fs.existsSync(path.join(githubDir, 'get-stuff-done', 'VERSION')));
    assert.ok(fs.existsSync(path.join(githubDir, 'dostuff', 'get-stuff-done', 'VERSION')));
    assert.ok(fs.existsSync(path.join(githubDir, 'skills', 'dostuff-new-project', 'SKILL.md')));

    uninstall(false, 'copilot');

    assert.ok(fs.existsSync(path.join(githubDir, 'skills', 'gsd-existing', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(githubDir, 'agents', 'gsd-executor.agent.md')));
    assert.ok(fs.existsSync(path.join(githubDir, 'get-stuff-done', 'VERSION')));
    assert.ok(!fs.existsSync(path.join(githubDir, 'dostuff')));
    assert.ok(!fs.existsSync(path.join(githubDir, 'skills', 'dostuff-new-project')));
  });

  test('claude install keeps existing gsd settings and hooks intact', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const legacyHookPath = path.join(claudeDir, 'hooks', 'gsd-statusline.js');
    const legacyCommandPath = path.join(claudeDir, 'commands', 'gsd', 'help.md');

    fs.mkdirSync(path.dirname(legacyHookPath), { recursive: true });
    fs.writeFileSync(legacyHookPath, '// upstream hook\n');
    fs.mkdirSync(path.dirname(legacyCommandPath), { recursive: true });
    fs.writeFileSync(legacyCommandPath, '# upstream command\n');
    fs.writeFileSync(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: 'node .claude/hooks/gsd-statusline.js' },
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/gsd-check-update.js' },
            ],
          },
        ],
      },
    }, null, 2));

    const result = install(false, 'claude');
    finishInstall(result.settingsPath, result.settings, result.statuslineCommand, false, 'claude', false);

    const installedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const sessionStartCommands = installedSettings.hooks.SessionStart.flatMap(entry =>
      Array.isArray(entry.hooks) ? entry.hooks.map(hook => hook.command) : []
    );

    assert.ok(fs.existsSync(legacyHookPath));
    assert.ok(fs.existsSync(legacyCommandPath));
    assert.ok(fs.existsSync(path.join(claudeDir, 'hooks', 'dostuff-statusline.js')));
    assert.ok(fs.existsSync(path.join(claudeDir, 'commands', 'dostuff', 'new-project.md')));
    assert.ok(sessionStartCommands.includes('node .claude/hooks/gsd-check-update.js'));
    assert.ok(sessionStartCommands.some(command => command.includes('dostuff-check-update.js')));
    assert.strictEqual(installedSettings.statusLine.command, 'node .claude/hooks/gsd-statusline.js');

    uninstall(false, 'claude');

    const afterUninstallSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const remainingSessionStartCommands = afterUninstallSettings.hooks.SessionStart.flatMap(entry =>
      Array.isArray(entry.hooks) ? entry.hooks.map(hook => hook.command) : []
    );

    assert.ok(fs.existsSync(legacyHookPath));
    assert.ok(fs.existsSync(legacyCommandPath));
    assert.ok(!fs.existsSync(path.join(claudeDir, 'hooks', 'dostuff-statusline.js')));
    assert.ok(!fs.existsSync(path.join(claudeDir, 'commands', 'dostuff')));
    assert.ok(remainingSessionStartCommands.includes('node .claude/hooks/gsd-check-update.js'));
    assert.strictEqual(afterUninstallSettings.statusLine.command, 'node .claude/hooks/gsd-statusline.js');
  });
});
