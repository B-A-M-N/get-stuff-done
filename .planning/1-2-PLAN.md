# PLAN: 1-2 - Fix Claude Hooks installation bug

## Goal
Resolve the issue where installing GSD with Claude corrupts or breaks the hooks system in `bin/install.js`.

## Tasks
<task type="auto">
  <name>Diagnose Hooks Logic</name>
  <files>bin/install.js, hooks/*.js</files>
  <action>
    Analyze `bin/install.js` to understand how Claude hooks (BeforeTool, AfterTool, etc.) are currently injected into `settings.json`.
    Identify the point of corruption or logic failure.
  </action>
  <verify>Identified root cause of hook corruption.</verify>
</task>

<task type="auto">
  <name>Implement Hook Fix</name>
  <files>bin/install.js</files>
  <action>
    Modify `bin/install.js` to ensure that hook injection is idempotent and does not corrupt existing `settings.json` content.
    Ensure that the ITL event handlers can be injected as standardized, provider-agnostic handlers.
  </action>
  <verify>Hook installation completes successfully without corruption.</verify>
</task>

<task type="auto">
  <name>Verify Installation</name>
  <files>bin/install.js</files>
  <action>
    Test the installation on a clean mock environment to verify that hooks are correctly created and function as intended.
  </action>
  <verify>Mock Claude environment has functional hooks after installation.</verify>
</task>

## Verification
- Hooks installation completes without error or file corruption.
- ITL event handlers correctly trigger during mock tool use.

---
*Status: Ready*
