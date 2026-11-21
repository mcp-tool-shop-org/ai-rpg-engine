# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| < 3.0   | No        |

Security fixes ship only in the latest 3.x release. The last 2.x release was 2.9.0 (2026-07-22).

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

The **core engine and simulation packages** are local-only. Two parts are
scoped separately below: the simulation sidecar's opt-in TCP listener, and the
optional `@ai-rpg-engine/ollama` package.

### Core engine (`@ai-rpg-engine/core`, `modules`, `cli`, starters, content)

- **Data touched:** in-memory game state (entities, zones, events, RNG state). Save files written to `.ai-rpg-engine/` when the CLI save command is used.
- **Data NOT touched:** no filesystem access beyond save files, no network access (except the sidecar's opt-in `--listen` mode, below), no environment variables, no system resources
- **No network egress** — the core engine has zero network dependencies at runtime
- **No secrets handling** — does not read, store, or transmit credentials
- **No telemetry** is collected or sent

### Simulation sidecar (`ai-rpg-engine sidecar`, `@ai-rpg-engine/sidecar`) — local TCP only when asked

The sidecar runs the simulation for a client such as a Godot host.

- **Default: stdio.** The host starts the process and talks to it over its pipes. Nothing listens on the network.
- **`--listen <port>` opens a TCP listener** that a client attaches to. It binds `127.0.0.1` unless `--host` names another interface.
- **There is no authentication.** Any process that can reach the port can send simulation commands. By default one client is served at a time, and a second connection is refused.
- **A non-loopback `--host` accepts simulation commands from other machines.** Use one only on a network you trust.
- **Files:** the sidecar reads only what its own command line names: a starter id or module path, and the `--content` pack with its `--manifest`. Nothing a client sends makes it read or write a file.

### Optional AI layer (`@ai-rpg-engine/ollama`) — network-capable

This package is not required to run the engine and is not part of the core
threat model above. When an integrator installs and uses it, it **does** make
network calls:

- **Local Ollama daemon** — HTTP requests to a user-configured Ollama endpoint (default `http://127.0.0.1:11434`) for text generation.
- **Opt-in webfetch** — a `webfetch` tool (default **disabled**, `webfetchEnabled: false`) that fetches user-supplied URLs to add context to a chat. It is guarded by an SSRF blocklist that rejects loopback, private, link-local, CGNAT, and cloud-metadata ranges. As of this release the guard resolves each hostname and re-checks every resolved IP against that blocklist before fetching, and **re-validates every redirect hop** (each `Location`) through the same gate under a bounded redirect limit (5) — so a public URL that redirects to an internal address is rejected, not followed. Residual, disclosed honestly: this is not immune to a DNS-rebinding TOCTOU (an attacker who controls DNS and re-points the record between the validation lookup and the socket connect), because native `fetch()` does not expose pinning the validated IP to the connection; treat `webfetchEnabled: true` as trusted-URL-only in hostile-DNS environments.

No secrets are read or transmitted by this layer, and it collects no telemetry;
its only egress is the Ollama endpoint and, when explicitly enabled, the URLs a
user passes to `webfetch`.
