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

Every package that is not in the table below makes no network calls, reads and writes no files, and handles no
secrets. That includes the simulation itself (`@ai-rpg-engine/core`, `modules` and the starter packs), which runs in
memory. No package starts a child process, and none collects telemetry.

| Package | Network | Files |
|---------|---------|-------|
| `cli` | None, except `sidecar --listen` (below) | Reads the packs, manifests and profiles you name, and its own package metadata. Writes saves and checkpoints under `.ai-rpg-engine/`, its command history, profiles, and the scaffolds that `create-starter` and `scaffold` produce. |
| `sidecar` | stdio by default; a TCP listener with `--listen`; a client helper that connects to an address you give (below) | None of its own. The CLI command reads what its command line names. |
| `content-schema` | None | Reads the content packs you load, and its bundled JSON Schema. |
| `asset-registry` | None | Its file store reads, writes and deletes asset data and metadata under the store directory you give it. |
| `soundpack-core` | None | Reads the sound and authoring files you name. |
| `image-gen` | HTTP to a ComfyUI server (default `http://localhost:8188`) | None. |
| `ollama` | HTTP to an Ollama endpoint (default `http://localhost:11434`); `webfetch` only when enabled (below) | Reads project files for chat context; writes transcripts, sessions, packs and scaffolds (below). |
| `ledger-adapter` | WebSocket to XRPL Testnet or Devnet only (below) | Reads and writes XRPL wallet seeds at `<gameDir>/.secrets/ledger-secrets.json` (below). |

**Environment variables.** The CLI and `@ai-rpg-engine/terminal-ui` read display settings (`NO_COLOR`, `ASCII_ONLY`),
and the CLI reads `AI_RPG_DEBUG`, which adds debug actions to its menu. The AI layer reads `AI_RPG_ENGINE_OLLAMA_URL`,
`AI_RPG_ENGINE_OLLAMA_MODEL` and `AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS`. No package reads a secret from the environment.

### Simulation sidecar (`ai-rpg-engine sidecar`, `@ai-rpg-engine/sidecar`) — a TCP listener only when asked

The sidecar runs the simulation for a client such as a Godot host.

- **Default: stdio.** The host starts the process and talks to it over its pipes. Nothing listens on the network.
- **`--listen <port>` opens a TCP listener** that a client attaches to. It binds `127.0.0.1` unless `--host` names another interface; the CLI treats an empty `--host` as unset. A program that calls `startSocketServer` directly with an empty `host` binds every interface.
- **There is no authentication.** Any process that can reach the port can send simulation commands, `SHUTDOWN` included. On a shared machine, another local process can also take the only client slot.
- **One client at a time by default.** A second connection is accepted and then closed with a message saying why. A program that raises `maxConnections` lets each client choose the observer or writer role for itself: the roles order writes, and they are not access control.
- **A non-loopback `--host` accepts simulation commands from other machines.** Use one only on a network you trust.
- **Code and files.** A module path on the command line is code the sidecar loads and runs, so give it only code you trust. `--content` and `--manifest` are data, read from the paths given. Nothing a client sends makes the sidecar read or write a file.
- **Client helper.** `connectSocketClient` opens a TCP connection to the host and port its caller gives (default `127.0.0.1`).

### Optional AI layer (`@ai-rpg-engine/ollama`) — network-capable

This package is not required to run the engine. When an integrator installs and uses it, it **does** make network
calls and touch files:

- **Local Ollama daemon** — HTTP requests to a user-configured Ollama endpoint (default `http://localhost:11434`, or `AI_RPG_ENGINE_OLLAMA_URL`) for text generation.
- **Opt-in webfetch** — a `webfetch` tool (default **disabled**, `webfetchEnabled: false`) that fetches user-supplied URLs to add context to a chat. It is guarded by an SSRF blocklist that rejects loopback, private, link-local, CGNAT, and cloud-metadata ranges. As of this release the guard resolves each hostname and re-checks every resolved IP against that blocklist before fetching, and **re-validates every redirect hop** (each `Location`) through the same gate under a bounded redirect limit (5) — so a public URL that redirects to an internal address is rejected, not followed. Residual, disclosed honestly: this is not immune to a DNS-rebinding TOCTOU (an attacker who controls DNS and re-points the record between the validation lookup and the socket connect), because native `fetch()` does not expose pinning the validated IP to the connection; treat `webfetchEnabled: true` as trusted-URL-only in hostile-DNS environments.
- **Chat context from project files** — chat retrieval reads `.yaml`, `.yml`, `.md` and `.txt` files under the project root (up to three folders deep, skipping dot-folders other than `.ai-transcripts`, `node_modules`, `dist` and `coverage`, and files over 100 KB), along with the session file and earlier transcripts, and puts excerpts into the prompts it sends to the Ollama endpoint. If that endpoint is not on your machine, those excerpts leave it.
- **Files it writes** — transcripts, sessions under the project root, packs and scaffolds, where you ask. A previewed edit is written only with an explicit `--confirm`: a `.bak` of the file it replaces is saved first, and undoing an edit that created a file deletes that file.

It reads no credentials of its own and collects no telemetry. Its network traffic goes only to the Ollama endpoint
and, when explicitly enabled, to the URLs a user passes to `webfetch`.

### Ledger adapter (`@ai-rpg-engine/ledger-adapter`) — XRPL Testnet, with seeds on disk

- **Network:** its testnet transport submits signed transactions to XRPL Testnet (default `wss://s.altnet.rippletest.net:51233`) or Devnet. Only allow-listed Testnet and Devnet hosts are accepted, and the ledger's network id is checked, so mainnet is refused in code, with no override. Its dry-run transport makes no network calls.
- **Secrets:** wallet seeds are kept out of the save file. They are stored as plaintext JSON at `<gameDir>/.secrets/ledger-secrets.json`, written with your system's default file permissions. Keep that file out of version control and shared backups. Testnet seeds carry no real value, but treat the file as a credential.
