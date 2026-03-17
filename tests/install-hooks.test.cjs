process.env.GSD_TEST_MODE = '1';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  normalizeHookCommand,
  settingsHasHookCommand,
  addHookCommand,
} = require('../bin/install.js');

describe('installer hook command helpers', () => {
  test('normalizeHookCommand trims and collapses whitespace', () => {
    assert.strictEqual(
      normalizeHookCommand('  node   .claude/hooks/gsd-check-update.js  '),
      'node .claude/hooks/gsd-check-update.js'
    );
  });

  test('settingsHasHookCommand matches full normalized command', () => {
    const settings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: 'node .claude/hooks/gsd-check-update.js' },
            ],
          },
        ],
      },
    };

    assert.strictEqual(
      settingsHasHookCommand(settings, 'SessionStart', ' node   .claude/hooks/gsd-check-update.js '),
      true
    );
    assert.strictEqual(
      settingsHasHookCommand(settings, 'SessionStart', 'node .claude/hooks/gsd-context-monitor.js'),
      false
    );
  });

  test('addHookCommand adds distinct node hook commands to the same event', () => {
    const settings = {};

    assert.strictEqual(addHookCommand(settings, 'PostToolUse', 'node .claude/hooks/gsd-check-update.js'), true);
    assert.strictEqual(addHookCommand(settings, 'PostToolUse', 'node .claude/hooks/gsd-context-monitor.js'), true);
    assert.strictEqual(addHookCommand(settings, 'PostToolUse', 'node .claude/hooks/gsd-context-monitor.js'), false);
    assert.strictEqual(settings.hooks.PostToolUse.length, 2);
  });
});

test('addHookCommand preserves unrelated existing hooks on the same event', () => {
  const settings = {
    hooks: {
      PostToolUse: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node .claude/hooks/custom-user-hook.js',
            },
          ],
        },
      ],
    },
  };

  assert.strictEqual(addHookCommand(settings, 'PostToolUse', 'node .claude/hooks/gsd-context-monitor.js'), true);

  const postToolCommands = settings.hooks.PostToolUse.flatMap(entry =>
    Array.isArray(entry.hooks) ? entry.hooks.map(h => h.command) : []
  );

  assert.ok(postToolCommands.includes('node .claude/hooks/custom-user-hook.js'));
  assert.ok(postToolCommands.includes('node .claude/hooks/gsd-context-monitor.js'));
  assert.strictEqual(postToolCommands.length, 2);
});
