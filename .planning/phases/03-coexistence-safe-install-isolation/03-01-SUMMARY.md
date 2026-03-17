---
phase: "03"
plan: "01"
status: "Complete"
completed: "2026-03-16"
requirements:
  - "FR-16"
---

# SUMMARY: 03-01 - Isolate installed namespace and engine paths from upstream GSD

## Outcome
Phase 3 install surfaces now land in fork-owned locations instead of upstream GSD locations.

## Implemented
- `bin/install.js` now installs commands under the `dostuff` namespace across supported runtimes instead of writing into installed `gsd` command surfaces.
- Engine assets now install under `<runtime-config>/dostuff/get-stuff-done` rather than the shared upstream engine root.
- Installed command content rewrites now target the fork engine root and fork-owned command names.
- Hook files are installed as `dostuff-*` assets instead of `gsd-*` assets.

## Verification
- `node --check bin/install.js`
- `node bin/install.js --copilot --local`
- `node bin/install.js --antigravity --local`
- Direct hook inspection after local Claude install confirmed `dostuff`-scoped cache, bridge, update, and pause-work references.

## Notes
- Copilot E2E assertions that shell out via `execFileSync` remain sandbox-sensitive under `node:test`, so lifecycle verification was also performed directly via shell installs.
