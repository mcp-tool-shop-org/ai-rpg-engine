# Ship Gate

> No repo is "done" until every applicable line is checked.

**Tags:** `[all]` every repo · `[npm]` published artifacts

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-03-06)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-03-06)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-03-06)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-03-06)

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: library/engine, not a standalone CLI/MCP/desktop app
- [ ] `[cli|mcp|desktop]` SKIP: library/engine, not a standalone CLI/MCP/desktop app
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape — engine emits `action.rejected` events with structured `verb` + `reason` fields; all validation failures produce queryable events (2026-03-06)
- [ ] `[cli]` SKIP: library, not a standalone CLI tool
- [ ] `[cli]` SKIP: library, not a standalone CLI tool
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-03-06)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-03-06)
- [x] `[all]` LICENSE file present and repo states support status (2026-03-06)
- [ ] `[cli]` SKIP: library, not a standalone CLI tool
- [ ] `[cli|mcp|desktop]` SKIP: library, no logging levels
- [ ] `[mcp]` SKIP: not an MCP server
- [x] `[complex]` HANDBOOK.md: comprehensive handbook at docs/handbook/ with 25 chapters + 4 appendices (2026-03-06)

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build in one command) (2026-03-06)
- [x] `[all]` Version in manifest matches git tag — v1.0.0 (2026-03-06)
- [x] `[all]` Dependency scanning runs in CI (npm audit in ci.yml) (2026-03-06)
- [ ] `[all]` SKIP: no dependabot per GitHub Actions cost rules — manual updates only
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-03-06)
- [x] `[npm]` `engines.node` set to `>=20` (2026-03-06)
- [x] `[npm]` Lockfile committed (2026-03-06)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-03-06)
- [x] `[all]` Translations (polyglot-mcp, 7 languages) (2026-03-06)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-03-06)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-03-06)

---

## Gate Rules

**Hard gate (A-D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."
