// sidecar-command.ts — `ai-rpg-engine sidecar <pack-id>`: the sim as a server.
//
// This is the command that makes C4's diorama possible: one authoritative sim
// process, spoken to over JSON-RPC by a client that is not a terminal. C0
// measured that the sim's only presentation consumer was a terminal calling it
// IN-PROCESS; that is the thing this changes.
//
// The command is deliberately thin. @ai-rpg-engine/sidecar owns the protocol and
// knows nothing about packs; this file owns pack resolution and knows nothing
// about framing. The round driver is passed IN because the round loop lives
// above the engine — `runWorldTick` is a per-round function the CLI drives, not
// a verb, which v3.6 learned by shipping a probe that could never have seen it.

import * as fs from 'node:fs';
import { startStdioServer, startSocketServer, type PackIntakeSummary } from '@ai-rpg-engine/sidecar';
import { applyContentPack, loadContentFromFile, type GateContext } from '@ai-rpg-engine/content-schema';
import { createStandardChannels, modifyDistrictMetric } from '@ai-rpg-engine/modules';
import { allPacks } from './packs.js';
import { runHostileRound } from './bin.js';
import { ENGINE_VERSION } from './engine-version.js';
import { loadExternalPack, PackLoadError, type LoadedPack } from './external-pack.js';

/** One value-flag: space form (`--flag value`) or equals form (`--flag=value`). */
type FlagRead = {
  present: boolean;
  raw: string | undefined;
  /** Index of the following value token in space form; -1 for equals form or absent. */
  valueSlot: number;
};

function readFlag(args: string[], flag: string): FlagRead {
  const eq = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) return { present: true, raw: args[i + 1], valueSlot: i + 1 };
    if (arg.startsWith(eq)) return { present: true, raw: arg.slice(eq.length), valueSlot: -1 };
  }
  return { present: false, raw: undefined, valueSlot: -1 };
}

function isMissingValue(read: FlagRead): boolean {
  return read.present && (read.raw === undefined || read.raw === '');
}

export interface SidecarDeps {
  /** Diagnostics sink. NEVER stdout: stdout carries framed protocol only. */
  error: (msg: string) => void;
}

const defaultDeps: SidecarDeps = { error: (m) => process.stderr.write(`${m}\n`) };

/**
 * F-c6ff0f97 (cli-side half): a JSON-RPC client gets the same pack-intake
 * signal the stderr loop below already announces — mapped 1:1 from
 * `applied.dropped` / `applied.advisories` (content-schema's
 * `applyContentPack` result) — so a non-terminal renderer (the whole reason
 * this command exists — see the module doc comment) can show "3 fields
 * dropped" in its own UI instead of a stderr stream it may not even be
 * attached to.
 *
 * The shape is @ai-rpg-engine/sidecar's own `PackIntakeSummary`
 * (protocol.ts), imported above — this file briefly carried a field-for-field
 * local mirror while the sibling type landed in the same wave; the mirror was
 * swapped for the real import at the wave-2 stitch.
 */

/** True when the positional is a filesystem path, not a bundled pack id. */
function looksLikePath(token: string): boolean {
  return /[\\/]/.test(token) || token.startsWith('.') || /^[A-Za-z]:/.test(token);
}

function printSidecarHelp(error: (msg: string) => void): void {
  error(
    'Usage: ai-rpg-engine sidecar <pack-id|path> [--seed <n>] [--listen <port>] [--host <addr>]'
    + ' [--content <pack.json>] [--start <zone-id>] [--manifest <manifest.json>]',
  );
  error('');
  error('Runs the simulation as a JSON-RPC server. One authoritative sim, N rendering');
  error('clients: the client submits intents, the sim decides, and events arrive as');
  error('tick-stamped notifications carrying a per-tick state hash.');
  error('The positional is a bundled starter id OR a filesystem path to a scaffolded');
  error('module (same contract as `run [path]` / `replay --pack <path|id>`).');
  error('');
  error('TRANSPORTS');
  error('  (default)        LAUNCH — stdio. The host spawns this process and speaks over');
  error('                   its pipes. stdout carries framed protocol messages ONLY;');
  error('                   a stray write there desynchronises the client permanently.');
  error('  --listen <port>  ATTACH — TCP. The process listens and a client connects.');
  error('                   Use 0 for an ephemeral port; the chosen port is printed to');
  error('                   stderr as "[sidecar] listening <host>:<port>".');
  error('');
  error('  --host <addr>    Interface for --listen. Defaults to 127.0.0.1, and should');
  error('                   stay there: any other value accepts simulation commands');
  error('                   from another machine.');
  error('');
  error('CONTENT');
  error('  --content <pack.json>');
  error('                   Route an exported content pack into the booted world. The');
  error('                   pack-id argument still supplies the CODE — modules, ruleset,');
  error('                   closures, event wiring — and this supplies the declarative');
  error('                   content, which is the boot contract C1 settled.');
  error('');
  error('                   The four-check load gate runs BEFORE any mutation, so a bad');
  error('                   engine-version range, an unknown module id, an unknown');
  error('                   top-level key or a failed content hash is refused rather');
  error('                   than half-applied. Applied counts, dropped fields and');
  error('                   advisories are all reported to stderr — nothing is eaten.');
  error('                   --manifest is required: without it the version, module-id,');
  error('                   and content-hash checks cannot run.');
  error('');
  error('  --manifest <manifest.json>');
  error('                   The exporter\'s sibling manifest (engineVersion, modules,');
  error('                   contentHash). Same contract as `validate --manifest`.');
  error('');
  error('  --start <zone-id>');
  error('                   Stand the player in a zone after intake. Authored zones are');
  error('                   MERGED into the host pack\'s world and the two graphs are');
  error('                   not connected, so without this the player begins in the');
  error('                   host\'s opening zone with no path to the authored world.');
  error('                   Required when --content applied at least one zone.');
  error('');
  error('One client at a time under --listen. Two clients would interleave in socket');
  error('arrival order, which is not deterministic, and determinism through the wire is');
  error('the property this server exists to preserve. A second connection is refused');
  error('with that reason on the wire rather than dropped silently.');
  error('');
  error('Diagnostics go to stderr under BOTH transports. Under --listen stdout is not');
  error('the protocol and writing to it would be harmless, which is exactly how a rule');
  error('starts holding in one file and not its neighbour.');
  error('');
  error(`Packs: ${allPacks.map((p) => p.meta.id).join(', ')}`);
  error('A path to a create-starter / scaffolded module is also accepted: sidecar <path>.');
}

/**
 * Start the sidecar. Returns the process exit code, or `null` when the server
 * is running (the caller keeps the process alive on stdin). Async so a
 * filesystem path can load through `loadExternalPack` the same way `run [path]`
 * and `replay --pack` do (F-dda90fe8).
 */
export async function runSidecar(args: string[], deps: SidecarDeps = defaultDeps): Promise<number | null> {
  const { error } = deps;

  if (args.includes('--help') || args.includes('-h')) {
    printSidecarHelp(error);
    return 0;
  }

  // Every flag that takes a VALUE, so the positional scan can skip those values.
  // Space form (`--flag value`) AND equals form (`--flag=value`) — `run` already
  // accepts `--seed=<n>` and `replay` already accepts `--checkpoint=<selector>`.
  // `indexOf(flag)` alone dropped every equals-form sidecar flag with no error.
  const seed = readFlag(args, '--seed');
  const listen = readFlag(args, '--listen');
  const host = readFlag(args, '--host');
  const content = readFlag(args, '--content');
  const start = readFlag(args, '--start');
  const shock = readFlag(args, '--shock');
  const manifest = readFlag(args, '--manifest');
  const valueIndices = new Set<number>();
  for (const read of [seed, listen, host, content, start, shock, manifest]) {
    if (read.valueSlot >= 0) valueIndices.add(read.valueSlot);
  }

  const seedRaw = seed.raw;
  const listenRaw = listen.raw;
  const hostRaw = host.present && host.raw !== '' ? host.raw : undefined;
  const contentRaw = content.present && content.raw !== '' ? content.raw : undefined;
  const packId = args.find((a, i) => !a.startsWith('-') && !valueIndices.has(i));

  if (!packId) {
    error('✗ [SIDECAR_PACK_MISSING] Missing <pack-id|path>.');
    printSidecarHelp(error);
    return 1;
  }

  // Same seed gate as parseRunArgs (digit-only whole token, 0..MAX_SEED) so
  // `sidecar --seed=1e2` cannot pin a different stream than `run --seed=1e2`.
  const MAX_SEED = 2147483647;

  let seedValue: number | undefined;
  if (seed.present) {
    if (isMissingValue(seed) || seedRaw === undefined || !/^\d+$/.test(seedRaw) || Number(seedRaw) > MAX_SEED) {
      error(`✗ [SIDECAR_INVALID_SEED] --seed must be a whole-token decimal integer (0-${MAX_SEED}), got "${seedRaw ?? '(missing)'}".`);
      error(`  Hint: pass --seed <n> or --seed=<n>, matching run (e.g. --seed 482913 or --seed=482913).`);
      return 1;
    }
    seedValue = Number(seedRaw);
  }

  let port: number | undefined;
  if (listen.present) {
    if (isMissingValue(listen)) {
      error('✗ [SIDECAR_LISTEN_MISSING_PORT] --listen requires a port (use 0 for an ephemeral one).');
      error('  Hint: pass --listen <port> or --listen=<port>.');
      return 1;
    }
    // Whole-token digits only — Number('1e3') is 1000 and would silently bind
    // a different port than the spelling the operator typed (F-3d3c8eb5).
    if (listenRaw === undefined || !/^\d+$/.test(listenRaw) || Number(listenRaw) > 65535) {
      error(`✗ [SIDECAR_INVALID_PORT] --listen must be a whole-token decimal port in 0..65535, got "${listenRaw}".`);
      error('  Hint: pass --listen <port> or --listen=<port> (use 0 for an ephemeral port).');
      return 1;
    }
    port = Number(listenRaw);
  }

  if (hostRaw !== undefined && port === undefined) {
    error('✗ [SIDECAR_HOST_WITHOUT_LISTEN] --host only applies to --listen; the stdio transport has no address.');
    return 1;
  }

  // Bundled id first (replay --pack <path|id> contract). A token that is not
  // an allPacks meta.id is a filesystem path — loadExternalPack, not SIDECAR_PACK_UNKNOWN.
  let pack: LoadedPack | undefined = allPacks.find((p) => p.meta.id === packId);
  if (!pack) {
    try {
      pack = await loadExternalPack(packId);
    } catch (err) {
      if (err instanceof PackLoadError) {
        error(`✗ [SIDECAR_PACK_UNKNOWN] No pack "${packId}".`);
        if (looksLikePath(packId)) {
          error(`  Hint: sidecar <path> loads a scaffolded module the same way run [path] / replay --pack do.`);
          error(`  ${err.message}`);
          error(`  Hint: ${err.hint}`);
        } else {
          error(`  Available: ${allPacks.map((p) => p.meta.id).join(', ')}`);
          error('  Hint: pass a bundled id, or sidecar <path> for a scaffolded module.');
        }
        return 1;
      }
      throw err;
    }
  }

  if (content.present && isMissingValue(content)) {
    error('✗ [SIDECAR_CONTENT_MISSING_PATH] --content requires a path to an exported content pack.');
    return 1;
  }

  if (content.present && manifest.present && (isMissingValue(manifest) || (manifest.raw?.startsWith('-') ?? false))) {
    error('✗ [SIDECAR_MANIFEST_MISSING_PATH] --manifest needs a path.');
    error('  Hint: ai-rpg-engine sidecar <pack-id> --content ./content-pack.json --manifest ./manifest.json --start <zone-id>');
    return 1;
  }

  const engine = pack.createGame(seedValue);
  const loaded = { meta: pack.meta, createGame: pack.createGame };

  // ── Authored content into the booted world ──────────────────────────────────
  //
  // C1 settled the boot contract on evidence: a pack stays a FUNCTION, and
  // declarative content is routed INTO the world that code builds. It built
  // `applyContentPack` for exactly that and proved it in tests — and until now
  // nothing in production ever called it. C4 is the reason it exists: a diorama that
  // could only render a bundled starter would make the whole authoring layer
  // invisible, which is the gap C0 measured in the first place.
  //
  // `applyContentPack` runs the four-check load gate BEFORE any mutation, so a pack
  // claiming the wrong engine version, naming a module this engine never registered,
  // carrying an unknown top-level key, or failing its content hash is refused here
  // rather than half-applied. And `dropped` is reported rather than swallowed: C0's
  // headline failure was not that data was lost, it was that data was lost SILENTLY
  // while an instrument reported 100% lossless.
  //
  // F-c6ff0f97: declared outside the block (like `cue` below) so its value
  // survives to the serverOptions construction further down. Stays
  // undefined when --content is never passed, or when nothing was dropped
  // or advised — a JSON-RPC client sees no `packIntake` field at all rather
  // than an empty-but-present one (matches the pack keys' own byte-absent
  // convention elsewhere in this engine).
  let packIntakeSummary: PackIntakeSummary | undefined;
  if (contentRaw !== undefined) {
    const load = loadContentFromFile(contentRaw);
    if (!load.ok) {
      error(`✗ [SIDECAR_CONTENT_INVALID] ${load.summary}`);
      for (const e of load.errors) error(`  ${e.path}: ${e.message}`);
      return 1;
    }

    // ⚠ THE GATE IS OPT-IN, and forgetting to opt in is silent. `applyContentPack`
    // runs the four checks only `if (options.gate)` (intake.ts:403). The first version
    // of this command passed no gate while its own help text promised "the four-check
    // load gate runs BEFORE any mutation" — a documented gate that executed nothing,
    // measured by giving it a pack with a nonsense top-level key and watching it load
    // clean. That is the studio's named `gates_verify_reality_not_attestation` failure,
    // committed by the person who had just written the sentence.
    //
    // `registeredModuleIds` comes from the ENGINE, not from a catalog: resolution
    // against reality is what kills C0's phantom nine and what lets a pack ship its own
    // module without being wrongly refused.
    if (!manifest.present) {
      error('✗ [SIDECAR_MANIFEST_REQUIRED] --content requires --manifest <manifest.json>.');
      error('  Hint: the four-check load gate cannot verify engine-version, module-ids, or content-hash without the exporter\'s sibling manifest.');
      return 1;
    }

    let gateManifest: GateContext['manifest'];
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(manifest.raw!, 'utf-8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        error(`✗ [SIDECAR_MANIFEST_INVALID] "${manifest.raw}" is not a JSON object.`);
        return 1;
      }
      gateManifest = parsed as GateContext['manifest'];
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      error(`✗ [SIDECAR_MANIFEST_INVALID] could not read "${manifest.raw}": ${reason}`);
      error('  Hint: point --manifest at the manifest.json the exporter wrote next to the content pack.');
      return 1;
    }

    const applied = applyContentPack(engine, load.pack, {
      channels: createStandardChannels(),
      gate: {
        engineVersion: ENGINE_VERSION,
        registeredModuleIds: engine.moduleManager.getModules().map((m) => m.id),
        manifest: gateManifest,
      },
    });
    if (!applied.ok) {
      error('✗ [SIDECAR_CONTENT_REFUSED] the content pack was refused.');
      // The gate's `report` is the diff-style "expected / actual / what to do" C1
      // built, and it is where the offending KEY, VERSION or MODULE ID is actually
      // named. `errors[]` keeps only message+hint — the conversion drops `expected`
      // and `actual` — so a first version of this printed a refusal that never said
      // WHAT was wrong. Printing the report first is the difference between a
      // refusal and a usable one.
      if (applied.gate?.report) {
        for (const line of applied.gate.report.split('\n')) error(`  ${line}`);
      }
      for (const e of applied.errors) error(`  ${e.path}: ${e.message}`);
      return 1;
    }

    const counts = Object.entries(applied.applied)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    error(`[sidecar] applied ${contentRaw}${counts ? ` (${counts})` : ''}`);
    // Dropped fields are announced, every time, on a transport whose whole purpose is
    // that a renderer can be trusted about what it received.
    for (const d of applied.dropped) error(`[sidecar] dropped ${d.path}: ${d.reason} — ${d.detail}`);
    for (const a of applied.advisories) error(`[sidecar] advisory ${a.path}: ${a.message}`);

    // F-c6ff0f97: the same signal, structured, for a JSON-RPC client — 1:1
    // field mapping off applied.dropped / applied.advisories, the exact
    // arrays the stderr loop above just walked.
    if (applied.dropped.length > 0 || applied.advisories.length > 0) {
      packIntakeSummary = {
        dropped: applied.dropped.map((d) => ({ path: d.path, reason: d.reason, detail: d.detail })),
        advisories: applied.advisories.map((a) => ({ path: a.path, message: a.message })),
      };
    }

    // Authored zones merge into the host graph and the two are not connected.
    // Applying without --start leaves the player in the host opening zone.
    const authoredZoneIds = (Array.isArray(load.pack.zones) ? load.pack.zones : [])
      .map((z) => (z && typeof z === 'object' && typeof (z as { id?: unknown }).id === 'string'
        ? (z as { id: string }).id
        : null))
      .filter((id): id is string => id !== null);
    if ((applied.applied.zones ?? 0) > 0 && !start.present) {
      error('✗ [SIDECAR_START_REQUIRED] --content applied authored zones but --start was not given.');
      error(`  Zones: ${authoredZoneIds.join(', ')}`);
      error('  Hint: pass --start <zone-id> so the player stands in the authored world (the graphs are not connected).');
      return 1;
    }
  }

  // ── Where the session begins ────────────────────────────────────────────────
  //
  // Applying a world nobody can stand in is applying a world nobody plays.
  //
  // `applyContentPack` MERGES authored zones into the world the host pack built, and
  // the two graphs are not connected — measured on Salt Road: the player starts in
  // the host pack's opening zone with no path to any authored one, so a client would
  // render six harbour zones and a player who cannot reach them. The forge authors a
  // default `spawnPoint`, but spawn points are not a pack key and never cross.
  //
  // `setPlayerLocation` is the engine's own primitive — it moves `locationId` AND the
  // player entity's `zoneId` together, which is the bookkeeping a caller writing
  // `locationId` from outside would get half-right (a C3 ledger entry, learned by
  // doing exactly that).
  if (start.present) {
    const zoneId = start.raw;
    if (zoneId === undefined || zoneId === '') {
      error('✗ [SIDECAR_START_MISSING_ZONE] --start requires a zone id.');
      return 1;
    }
    // Checked against the world AFTER intake, so a typo names the zones that exist
    // rather than putting the player nowhere and letting the first move fail.
    if (engine.world.zones[zoneId] === undefined) {
      error(`✗ [SIDECAR_START_UNKNOWN_ZONE] no zone "${zoneId}" in the booted world.`);
      error(`  Zones: ${Object.keys(engine.world.zones).sort().join(', ')}`);
      return 1;
    }
    engine.store.setPlayerLocation(zoneId);
    error(`[sidecar] player starts in ${zoneId}`);
  }

  // ── The scenario cue ────────────────────────────────────────────────────────
  //
  // ⚠ THIS EXISTS BECAUSE OF A MEASURED GAP, and the gap is the finding, not the flag.
  //
  // `world.zone.state.changed` — the event that re-dresses a place when its district's
  // fortunes move — HAS NO REACHABLE PRODUCER FROM PLAY. Measured on Salt Road: 60 world
  // ticks move no district metric; eight rounds of real combat produce defeat fallout, a
  // chronicle entry, a rumour and a companion reaction, and zero zone-state changes. The
  // only caller of `modifyDistrictMetric` positioned to cross a threshold is a test. The
  // system is built, persisted, and carried on the wire, and nothing a player can do
  // triggers it — the v3.8 "declared and never produced" shape, in the system C4's own
  // sentence depends on.
  //
  // So a cue supplies the input an in-game event would have supplied. Two properties make
  // it honest rather than a cheat:
  //
  //   1. IT IS HOST-SIDE. The client cannot request it, and no protocol method exposes it.
  //      A client that could shock a district would be a client deciding what happens,
  //      which is the one thing the whole contract forbids.
  //   2. THE SIM STILL DECIDES THE OUTCOME. The cue moves one district metric. Which
  //      zones cross which thresholds, what condition each lands in, what cause is
  //      reported and which variant tags result are all computed by the simulation.
  //
  // Format: `<districtId>:<metric>:<delta>@<round>` — e.g. `dockward:stability:-25@2`.
  let cue: { districtId: string; metric: string; delta: number; round: number } | undefined;
  if (shock.present) {
    const spec = shock.raw;
    if (spec === undefined || spec === '') {
      error('✗ [SIDECAR_SHOCK_MISSING_SPEC] --shock requires <districtId>:<metric>:<delta>@<round>.');
      return 1;
    }
    const m = /^([\w-]+):([\w-]+):(-?\d+)@(\d+)$/.exec(spec);
    if (!m) {
      error(`✗ [SIDECAR_SHOCK_MALFORMED] could not parse "${spec}".`);
      error('  Expected <districtId>:<metric>:<delta>@<round>, e.g. dockward:stability:-25@2');
      return 1;
    }
    cue = { districtId: m[1], metric: m[2], delta: Number(m[3]), round: Number(m[4]) };
    if (cue.round < 1) {
      error('✗ [SIDECAR_SHOCK_BAD_ROUND] the round must be 1 or greater.');
      return 1;
    }
  }

  let roundsRun = 0;

  // Identical on both transports. That is the whole claim `stdio.ts` made about
  // attach: the server, the protocol and the serializer do not know which one they
  // are on, so a session cannot behave differently depending on how it arrived.
  const serverOptions = {
    engine,
    engineVersion: ENGINE_VERSION,
    serverName: `ai-rpg-engine sidecar (${pack.meta.id})`,
    // F-c6ff0f97: present only when --content actually dropped or advised
    // something (packIntakeSummary stays undefined otherwise) — a spread of
    // `{}` adds no key, matching every other conditional field in this
    // engine's byte-absent-when-quiet convention.
    ...(packIntakeSummary ? { packIntake: packIntakeSummary } : {}),
    // The round driver, injected. `advance` reports the capability unavailable
    // rather than pretending when a host does not supply one.
    advanceRound: (e: unknown) => {
      roundsRun += 1;
      // The cue fires BEFORE the round it names, so the world tick inside that round is
      // what observes the changed metric and derives the consequence. Firing after would
      // leave the shock unobserved until the following round — a one-round lag that reads
      // as a bug in the sim rather than as an ordering choice here.
      if (cue !== undefined && roundsRun === cue.round) {
        modifyDistrictMetric(
          (e as { world: unknown }).world as never,
          cue.districtId,
          cue.metric as never,
          cue.delta,
        );
        error(
          `[sidecar] cue: ${cue.districtId}.${cue.metric} ${cue.delta > 0 ? '+' : ''}${cue.delta}`
          + ` at round ${cue.round}`,
        );
      }
      runHostileRound(e as never, loaded as never, { log: () => {} });
    },
  };

  if (port !== undefined) {
    startSocketServer(
      { ...serverOptions, port, host: hostRaw },
      {
        // Machine-readable on purpose: a harness launching this with `--listen 0`
        // has no other way to learn the port, and parsing a prose sentence is how
        // a test starts depending on wording.
        onListening: (bound, host) => error(`[sidecar] listening ${host}:${bound}`),
        onConnection: (i) => error(`[sidecar] client ${i} attached`),
        onDisconnect: (i) => error(`[sidecar] client ${i} detached`),
        onRefused: (reason) => error(`[sidecar] ${reason}`),
        onFramingError: (d) => error(`[sidecar] framing error: ${d}`),
        onError: (err) => error(`[sidecar] transport error: ${err.message}`),
      },
    );
    error(`[sidecar] ${pack.meta.id} ready${seedValue !== undefined ? ` (seed ${seedValue})` : ''}`);
    return null; // keep the process alive; the socket drives it
  }

  startStdioServer(serverOptions);

  error(`[sidecar] ${pack.meta.id} ready${seedValue !== undefined ? ` (seed ${seedValue})` : ''}`);
  return null; // keep the process alive; stdin drives it
}
