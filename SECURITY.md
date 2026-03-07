# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

AI RPG Engine is a **local-only simulation library**.

- **Data touched:** in-memory game state (entities, zones, events, RNG state). Save files written to `.ai-rpg-engine/` when CLI save command is used.
- **Data NOT touched:** no filesystem access beyond save files, no network access, no environment variables, no system resources
- **No network egress** — the engine has zero network dependencies at runtime
- **No secrets handling** — does not read, store, or transmit credentials
- **No telemetry** is collected or sent
