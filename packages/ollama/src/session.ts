// Session — file-based design session protocol
// Active copy lives in .ai-session.json; named slots live under .ai-sessions/<slug>.json.
// Commands read session state to enrich prompts but never require it.

import { readFile, writeFile, unlink, stat, mkdir, readdir, rename, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { CritiqueIssue } from './parsers.js';
import type { BuildState } from './chat-build-planner.js';
import type { TuningState } from './chat-balance-analyzer.js';

/** Drop oldest events once history exceeds this many entries (F-1582fb3d). */
export const MAX_SESSION_HISTORY_EVENTS = 1000;
/** Refuse loadSession before JSON.parse when the file exceeds this many bytes. */
export const MAX_SESSION_JSON_BYTES = 8 * 1024 * 1024;

// --- Types ---

/** Required on disk for older session files (pre-dialogue/entity verbs). */
export const REQUIRED_ARTIFACT_KINDS = [
  'districts', 'factions', 'quests', 'rooms', 'packs',
] as const;

/**
 * Optional buckets filled with [] when an older file omits them.
 * Extra chargen / placement / NPC-AI buckets stay optional on the type
 * (Wave 27 typecheck pin: older test literals and session JSON still typecheck).
 */
export const OPTIONAL_ARTIFACT_KINDS = [
  'entities', 'dialogues', 'abilities', 'statuses', 'items', 'hazards',
  'archetypes', 'backgrounds', 'catalogs', 'placements', 'entityAi',
  'anchors', 'trees', 'ruleProfiles', 'itemPlacements',
] as const;

export const ARTIFACT_KINDS = [
  ...REQUIRED_ARTIFACT_KINDS,
  ...OPTIONAL_ARTIFACT_KINDS,
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export type SessionArtifacts = {
  districts: string[];
  factions: string[];
  quests: string[];
  rooms: string[];
  packs: string[];
  entities: string[];
  dialogues: string[];
  abilities: string[];
  statuses: string[];
  items: string[];
  hazards: string[];
  /** Chargen class ids. Optional so pre-Wave-31 session JSON / literals typecheck. */
  archetypes?: string[];
  /** Chargen origin ids. */
  backgrounds?: string[];
  /** Build-catalog ids. */
  catalogs?: string[];
  /** Placement records (`entityId@zoneId`). */
  placements?: string[];
  /** Entity AI overlay ids (entity ids with a brain). */
  entityAi?: string[];
  /** EncounterAnchorRecord ids (spawn SETs). Load-tolerant: older session JSON omits this. */
  anchors?: string[];
  /** ProgressionTreeDefinition ids. Load-tolerant: older session JSON omits this. */
  trees?: string[];
  /** ContentPack.ruleProfiles registry keys. Load-tolerant: older session JSON omits this. */
  ruleProfiles?: string[];
  /** ItemPlacementRecord ids (`itemId@entityId`). Load-tolerant: older session JSON omits this. */
  itemPlacements?: string[];
};

const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  districts: 'districts',
  factions: 'factions',
  quests: 'quests',
  rooms: 'rooms',
  packs: 'packs',
  entities: 'entities',
  dialogues: 'dialogues',
  abilities: 'abilities',
  statuses: 'statuses',
  items: 'items',
  hazards: 'hazards',
  archetypes: 'archetypes',
  backgrounds: 'backgrounds',
  catalogs: 'catalogs',
  placements: 'placements',
  entityAi: 'entityAi',
  anchors: 'anchors',
  trees: 'trees',
  ruleProfiles: 'ruleProfiles',
  itemPlacements: 'itemPlacements',
};

export function countArtifacts(artifacts: SessionArtifacts): number {
  return ARTIFACT_KINDS.reduce((sum, kind) => sum + (artifacts[kind]?.length ?? 0), 0);
}

export function emptyArtifacts(): SessionArtifacts {
  return {
    districts: [],
    factions: [],
    quests: [],
    rooms: [],
    packs: [],
    entities: [],
    dialogues: [],
    abilities: [],
    statuses: [],
    items: [],
    hazards: [],
    archetypes: [],
    backgrounds: [],
    catalogs: [],
    placements: [],
    entityAi: [],
    anchors: [],
    trees: [],
    ruleProfiles: [],
    itemPlacements: [],
  };
}

/** Coerce a loaded artifacts object: required keys must be arrays; optional keys default to []. */
export function normalizeArtifacts(raw: unknown): SessionArtifacts {
  const src = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};
  const out = emptyArtifacts();
  for (const kind of ARTIFACT_KINDS) {
    const v = src[kind];
    if (Array.isArray(v)) {
      out[kind] = v.filter((id): id is string => typeof id === 'string');
    }
  }
  return out;
}

export type SessionIssue = {
  code: string;
  target: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'accepted';
  summary: string;
};

export type SessionEventKind =
  | 'session_start'
  | 'theme_added'
  | 'constraint_added'
  | 'artifact_created'
  | 'issue_opened'
  | 'issue_resolved'
  | 'suggestion_accepted'
  | 'suggestion_generated'
  | 'replay_compared'
  | 'plan_generated'
  | 'content_applied'
  | 'build_plan_created'
  | 'build_step_executed'
  | 'build_step_failed'
  | 'build_plan_completed'
  | 'balance_analyzed'
  | 'intent_compared'
  | 'window_analyzed'
  | 'fixes_suggested'
  | 'scenarios_compared'
  | 'tune_plan_created'
  | 'tune_step_executed'
  | 'tune_step_failed'
  | 'tune_plan_completed'
  | 'tuning_step_previewed'
  | 'tuning_step_applied'
  | 'tuning_bundle_created'
  | 'experiment_plan_created'
  | 'experiment_started'
  | 'experiment_run_completed'
  | 'experiment_sweep_completed'
  | 'experiment_compared'
  | 'experiment_findings_added'
  | 'studio_dashboard_viewed'
  | 'onboarding_started'
  | 'session_imported'
  | 'pack_emitted';

export type SessionEvent = {
  timestamp: string;
  kind: SessionEventKind;
  detail: string;
};

export type PendingWriteBatchOwner = 'build' | 'tuning';

export type DesignSession = {
  name: string;
  createdAt: string;
  updatedAt: string;
  themes: string[];
  constraints: string[];
  artifacts: SessionArtifacts;
  issues: SessionIssue[];
  acceptedSuggestions: string[];
  history: SessionEvent[];
  modelConfig?: {
    model?: string;
    baseUrl?: string;
  };
  /**
   * In-flight guided /build (F-3f17cbc3). Optional: older session JSON omits
   * it. Unconfirmed YAML lives here (stagedWrites), never in SessionArtifacts.
   */
  activeBuild?: BuildState | null;
  /** In-flight guided /tune. Same load-tolerate contract as activeBuild. */
  activeTuning?: TuningState | null;
  /** Which pool pendingWriteBatch was derived from, if any. */
  pendingWriteBatchOwner?: PendingWriteBatchOwner | null;
};

export type SessionSlot = {
  name: string;
  slug: string;
  path: string;
  active: boolean;
};

// --- File protocol ---

export const SESSION_FILENAME = '.ai-session.json';
export const SESSIONS_DIR = '.ai-sessions';

export function sessionSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'untitled';
}

function sessionPath(projectRoot: string): string {
  return resolve(projectRoot, SESSION_FILENAME);
}

export function sessionsDir(projectRoot: string): string {
  return resolve(projectRoot, SESSIONS_DIR);
}

export function namedSessionPath(projectRoot: string, name: string): string {
  return resolve(projectRoot, SESSIONS_DIR, `${sessionSlug(name)}.json`);
}

function archiveDir(projectRoot: string): string {
  return resolve(projectRoot, SESSIONS_DIR, 'archive');
}

function archiveStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Structured failure for an unusable session file (v2.5 audit PA-2).
 *
 * "No session" and "corrupt session" are different situations: the first is
 * the normal case (→ null), the second used to be silently swallowed — the
 * user's accumulated design context was ignored without a word and the next
 * `saveSession` clobbered the salvageable file. Carries the code/message/hint
 * shape the CLI renders.
 */
export class SessionLoadError extends Error {
  readonly code: string;
  /** Absolute path of the offending session file. */
  readonly path: string;
  readonly hint: string;
  constructor(path: string, detail: string, code = 'SESSION_CORRUPT') {
    const label = code === 'SESSION_BUDGET_EXCEEDED' ? 'too large'
      : code === 'SESSION_NOT_FOUND' ? 'missing'
      : 'corrupt';
    super(`Session file is ${label}: ${path} (${detail})`);
    this.name = 'SessionLoadError';
    this.code = code;
    this.path = path;
    this.hint = code === 'SESSION_BUDGET_EXCEEDED'
      ? 'The file was left untouched. Trim .ai-session.json history, restore it from git, '
        + 'or discard it with "ai session end" to start fresh.'
      : code === 'SESSION_NOT_FOUND'
        ? 'No named session with that slug. List slots with "ai session list".'
        : 'The file was left untouched. Fix the JSON by hand, restore it from git, '
          + 'or discard it with "ai session end" to start fresh.';
  }
}

/**
 * Describe the first structural problem that would make this object unusable
 * as a DesignSession, or null when it is safe to use. Guards exactly the
 * fields the CLI dereferences — a valid-JSON-wrong-shape file (`{}`, an array)
 * must become a structured error, not a downstream TypeError.
 *
 * Optional artifact buckets (entities/dialogues/abilities/statuses) may be
 * absent — older files only had the original five keys. Unknown extra keys
 * are tolerated.
 */
function sessionShapeProblem(v: unknown): string | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'not a JSON object';
  const s = v as Record<string, unknown>;
  if (typeof s['name'] !== 'string') return 'missing "name" (string)';
  for (const key of ['themes', 'constraints', 'issues', 'acceptedSuggestions'] as const) {
    if (!Array.isArray(s[key])) return `missing "${key}" (array)`;
  }
  const artifacts = s['artifacts'];
  if (typeof artifacts !== 'object' || artifacts === null || Array.isArray(artifacts)) {
    return 'missing "artifacts" (object)';
  }
  const bag = artifacts as Record<string, unknown>;
  for (const kind of REQUIRED_ARTIFACT_KINDS) {
    if (!Array.isArray(bag[kind])) {
      return `missing "artifacts.${kind}" (array)`;
    }
  }
  // history is tolerated when absent (older sessions); recordEvent re-initializes it.
  if (s['history'] !== undefined && !Array.isArray(s['history'])) return '"history" is not an array';
  // In-flight fields are optional and load-tolerant — malformed blobs are
  // dropped after parse (see normalizeInFlightFields), never a shape error.
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const PLAN_STATUSES = new Set(['planned', 'executing', 'completed', 'failed']);
const STEP_STATUSES = new Set(['pending', 'executed', 'failed', 'skipped']);

function warnDroppedInFlight(field: string, detail: string): void {
  console.error(`Warning: dropping malformed in-flight session field "${field}" (${detail}).`);
}

function normalizeStagedWrites(raw: unknown): Record<string, {
  content: string;
  suggestedPath: string;
  label: string;
  sourceStepId: number;
}> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, {
    content: string; suggestedPath: string; label: string; sourceStepId: number;
  }> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) return null;
    if (typeof value['content'] !== 'string'
      || typeof value['suggestedPath'] !== 'string'
      || typeof value['label'] !== 'string'
      || typeof value['sourceStepId'] !== 'number') {
      return null;
    }
    out[key] = {
      content: value['content'],
      suggestedPath: value['suggestedPath'],
      label: value['label'],
      sourceStepId: value['sourceStepId'],
    };
  }
  return out;
}

function normalizeBuildState(raw: unknown): BuildState | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return null;
  const plan = raw['plan'];
  if (!isRecord(plan) || typeof plan['goal'] !== 'string' || !Array.isArray(plan['steps'])) return null;
  if (typeof raw['startedAt'] !== 'string') return null;
  if (typeof raw['status'] !== 'string' || !PLAN_STATUSES.has(raw['status'])) return null;
  if (!Array.isArray(raw['generatedContent'])) return null;
  const staged = normalizeStagedWrites(raw['stagedWrites'] ?? {});
  if (!staged) return null;
  const steps: BuildState['plan']['steps'] = [];
  for (const step of plan['steps']) {
    if (!isRecord(step)) return null;
    if (typeof step['id'] !== 'number' || typeof step['description'] !== 'string'
      || typeof step['command'] !== 'string' || typeof step['intent'] !== 'string'
      || !isRecord(step['params']) || !Array.isArray(step['dependencies'])
      || !Array.isArray(step['artifactOutputs']) || typeof step['usePriorContent'] !== 'boolean'
      || typeof step['status'] !== 'string' || !STEP_STATUSES.has(step['status'])) {
      return null;
    }
    const normalized: BuildState['plan']['steps'][number] = {
      id: step['id'],
      description: step['description'],
      command: step['command'],
      intent: step['intent'] as BuildState['plan']['steps'][number]['intent'],
      params: Object.fromEntries(
        Object.entries(step['params']).filter((e): e is [string, string] => typeof e[1] === 'string'),
      ),
      dependencies: step['dependencies'].filter((d): d is number => typeof d === 'number'),
      artifactOutputs: step['artifactOutputs'].filter((a): a is string => typeof a === 'string'),
      usePriorContent: step['usePriorContent'],
      status: step['status'] as BuildState['plan']['steps'][number]['status'],
    };
    if (typeof step['result'] === 'string') normalized.result = step['result'];
    if (typeof step['error'] === 'string') normalized.error = step['error'];
    if (typeof step['outputContent'] === 'string') normalized.outputContent = step['outputContent'];
    steps.push(normalized);
  }
  const warnings = Array.isArray(plan['warnings'])
    ? plan['warnings'].filter((w): w is string => typeof w === 'string')
    : [];
  const estimatedSteps = typeof plan['estimatedSteps'] === 'number' ? plan['estimatedSteps'] : steps.length;
  const state: BuildState = {
    plan: { goal: plan['goal'], steps, estimatedSteps, warnings },
    startedAt: raw['startedAt'],
    status: raw['status'] as BuildState['status'],
    generatedContent: raw['generatedContent'].filter((c): c is string => typeof c === 'string'),
    stagedWrites: staged,
  };
  if (typeof raw['completedAt'] === 'string') state.completedAt = raw['completedAt'];
  return state;
}

function normalizeTuningState(raw: unknown): TuningState | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return null;
  const plan = raw['plan'];
  if (!isRecord(plan) || typeof plan['goal'] !== 'string' || !Array.isArray(plan['steps'])) return null;
  if (typeof raw['startedAt'] !== 'string') return null;
  if (typeof raw['status'] !== 'string' || !PLAN_STATUSES.has(raw['status'])) return null;
  const staged = normalizeStagedWrites(raw['stagedWrites'] ?? {});
  if (!staged) return null;
  const steps: TuningState['plan']['steps'] = [];
  for (const step of plan['steps']) {
    if (!isRecord(step)) return null;
    if (typeof step['id'] !== 'number' || typeof step['description'] !== 'string'
      || typeof step['command'] !== 'string' || typeof step['intent'] !== 'string'
      || !isRecord(step['params']) || !Array.isArray(step['dependencies'])
      || typeof step['expectedEffect'] !== 'string'
      || typeof step['status'] !== 'string' || !STEP_STATUSES.has(step['status'])) {
      return null;
    }
    const normalized: TuningState['plan']['steps'][number] = {
      id: step['id'],
      description: step['description'],
      command: step['command'],
      intent: step['intent'] as TuningState['plan']['steps'][number]['intent'],
      params: Object.fromEntries(
        Object.entries(step['params']).filter((e): e is [string, string] => typeof e[1] === 'string'),
      ),
      dependencies: step['dependencies'].filter((d): d is number => typeof d === 'number'),
      expectedEffect: step['expectedEffect'],
      status: step['status'] as TuningState['plan']['steps'][number]['status'],
    };
    if (typeof step['result'] === 'string') normalized.result = step['result'];
    if (typeof step['error'] === 'string') normalized.error = step['error'];
    steps.push(normalized);
  }
  const warnings = Array.isArray(plan['warnings'])
    ? plan['warnings'].filter((w): w is string => typeof w === 'string')
    : [];
  const state: TuningState = {
    plan: { goal: plan['goal'], steps, warnings },
    startedAt: raw['startedAt'],
    status: raw['status'] as TuningState['status'],
    stagedWrites: staged,
  };
  if (typeof raw['completedAt'] === 'string') state.completedAt = raw['completedAt'];
  return state;
}

function normalizePendingWriteBatchOwner(raw: unknown): PendingWriteBatchOwner | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (raw === 'build' || raw === 'tuning') return raw;
  return undefined;
}

/**
 * Drop malformed in-flight blobs with a stderr warning. Missing fields stay
 * null/absent. Never throws — a bad in-flight payload must not become
 * SessionLoadError (F-3f17cbc3).
 */
function normalizeInFlightFields(session: DesignSession): void {
  const raw = session as unknown as Record<string, unknown>;
  if (raw['activeBuild'] !== undefined && raw['activeBuild'] !== null) {
    const build = normalizeBuildState(raw['activeBuild']);
    if (build) {
      session.activeBuild = build;
    } else {
      warnDroppedInFlight('activeBuild', 'unusable BuildState shape');
      delete session.activeBuild;
    }
  } else {
    delete session.activeBuild;
  }
  if (raw['activeTuning'] !== undefined && raw['activeTuning'] !== null) {
    const tuning = normalizeTuningState(raw['activeTuning']);
    if (tuning) {
      session.activeTuning = tuning;
    } else {
      warnDroppedInFlight('activeTuning', 'unusable TuningState shape');
      delete session.activeTuning;
    }
  } else {
    delete session.activeTuning;
  }
  if (raw['pendingWriteBatchOwner'] !== undefined) {
    const owner = normalizePendingWriteBatchOwner(raw['pendingWriteBatchOwner']);
    if (owner === 'build' || owner === 'tuning') {
      session.pendingWriteBatchOwner = owner;
    } else if (raw['pendingWriteBatchOwner'] === null) {
      delete session.pendingWriteBatchOwner;
    } else {
      warnDroppedInFlight('pendingWriteBatchOwner', `expected "build"|"tuning"|null, got ${JSON.stringify(raw['pendingWriteBatchOwner'])}`);
      delete session.pendingWriteBatchOwner;
    }
  } else {
    delete session.pendingWriteBatchOwner;
  }
}

async function readSessionFile(file: string): Promise<DesignSession> {
  let fileSize: number;
  try {
    fileSize = (await stat(file)).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      throw new SessionLoadError(file, 'file does not exist', 'SESSION_NOT_FOUND');
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new SessionLoadError(file, `unreadable: ${message}`);
  }
  if (fileSize > MAX_SESSION_JSON_BYTES) {
    throw new SessionLoadError(
      file,
      `budget exceeded: session file is ${fileSize} bytes (cap ${MAX_SESSION_JSON_BYTES})`,
      'SESSION_BUDGET_EXCEEDED',
    );
  }
  let raw: string;
  try {
    raw = await readFile(file, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      throw new SessionLoadError(file, 'file does not exist', 'SESSION_NOT_FOUND');
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new SessionLoadError(file, `unreadable: ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SessionLoadError(file, `invalid JSON: ${message}`);
  }
  const problem = sessionShapeProblem(parsed);
  if (problem) throw new SessionLoadError(file, problem);
  const session = parsed as DesignSession;
  session.artifacts = normalizeArtifacts(session.artifacts);
  if (Array.isArray(session.history) && session.history.length > MAX_SESSION_HISTORY_EVENTS) {
    session.history = session.history.slice(-MAX_SESSION_HISTORY_EVENTS);
  }
  normalizeInFlightFields(session);
  return session;
}

/**
 * Load the design session for a project root.
 *
 * - No session file (ENOENT) → `null` — the normal, quiet case.
 * - Unreadable / invalid JSON / wrong shape → throws {@link SessionLoadError}
 *   so a corrupt session is surfaced instead of silently ignored-then-clobbered
 *   by the next save (PA-2). Callers on advisory surfaces that must never throw
 *   should use {@link tryLoadSession}.
 */
export async function loadSession(projectRoot: string): Promise<DesignSession | null> {
  const file = sessionPath(projectRoot);
  try {
    return await readSessionFile(file);
  } catch (err) {
    if (err instanceof SessionLoadError && err.code === 'SESSION_NOT_FOUND') return null;
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Lenient variant of {@link loadSession} for advisory surfaces (the chat
 * shell/engine): a corrupt session degrades to "no session" with a one-line
 * stderr warning instead of an exception — visible, but never fatal.
 */
export async function tryLoadSession(projectRoot: string): Promise<DesignSession | null> {
  try {
    return await loadSession(projectRoot);
  } catch (err) {
    if (err instanceof SessionLoadError) {
      console.error(`Warning: ${err.message}. Continuing without session context.`);
      return null;
    }
    throw err;
  }
}

/**
 * Write `contents` via sibling `.tmp` then rename so a crash mid-write cannot
 * replace a restorable session with truncated JSON (F-3f17cbc3). Mirrors
 * apply-preview's Windows-safe rename (copy+unlink when dest exists).
 */
async function atomicWriteFile(file: string, contents: string): Promise<void> {
  const tmpPath = `${file}.tmp`;
  await writeFile(tmpPath, contents, 'utf-8');
  try {
    await rename(tmpPath, file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'EACCES') {
      await copyFile(tmpPath, file);
      await unlink(tmpPath);
      return;
    }
    throw err;
  }
}

export async function saveSession(projectRoot: string, session: DesignSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  session.artifacts = normalizeArtifacts(session.artifacts);
  const json = JSON.stringify(session, null, 2) + '\n';
  await atomicWriteFile(sessionPath(projectRoot), json);
  await mkdir(sessionsDir(projectRoot), { recursive: true });
  await atomicWriteFile(namedSessionPath(projectRoot, session.name), json);
}

export type InFlightPersistInput = {
  activeBuild?: BuildState | null;
  activeTuning?: TuningState | null;
  pendingWriteBatchOwner?: PendingWriteBatchOwner | null;
};

export type PersistInFlightResult = {
  session: DesignSession;
  persisted: boolean;
};

function inFlightForPersist<T extends { status: string; stagedWrites: Record<string, unknown> }>(
  state: T | null | undefined,
): T | null {
  if (!state) return null;
  if ((state.status === 'completed' || state.status === 'failed')
    && Object.keys(state.stagedWrites).length === 0) {
    return null;
  }
  return state;
}

/**
 * Attach live BuildState/TuningState onto the session file (creating one if
 * needed) so a crash cannot destroy an unconfirmed /build or /tune batch.
 * Persist-on-mutate, not persist-on-exit (F-3f17cbc3).
 *
 * If stringify would exceed MAX_SESSION_JSON_BYTES, refuse the in-flight
 * attach, leave the previous session bytes untouched, and warn.
 */
export async function persistInFlight(
  projectRoot: string,
  session: DesignSession | null,
  inflight: InFlightPersistInput,
): Promise<PersistInFlightResult> {
  const target = session ?? createSession('untitled');
  const build = inFlightForPersist(inflight.activeBuild ?? null);
  const tuning = inFlightForPersist(inflight.activeTuning ?? null);
  const owner = inflight.pendingWriteBatchOwner ?? null;

  const candidate: DesignSession = {
    name: target.name,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    themes: target.themes,
    constraints: target.constraints,
    artifacts: normalizeArtifacts(target.artifacts),
    issues: target.issues,
    acceptedSuggestions: target.acceptedSuggestions,
    history: target.history,
    modelConfig: target.modelConfig,
  };
  if (build) candidate.activeBuild = build;
  if (tuning) candidate.activeTuning = tuning;
  if (owner) candidate.pendingWriteBatchOwner = owner;

  const json = JSON.stringify(candidate, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf-8') > MAX_SESSION_JSON_BYTES) {
    console.error(
      'Warning: in-flight build/tuning state exceeds the session file budget; not persisted. '
      + 'In-memory state remains and exiting still warns. Previous session file left untouched.',
    );
    return { session: target, persisted: false };
  }

  if (build) target.activeBuild = build;
  else delete target.activeBuild;
  if (tuning) target.activeTuning = tuning;
  else delete target.activeTuning;
  if (owner) target.pendingWriteBatchOwner = owner;
  else delete target.pendingWriteBatchOwner;

  try {
    await saveSession(projectRoot, target);
    return { session: target, persisted: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT') {
      return { session: target, persisted: false };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Warning: could not persist in-flight session: ${msg}`);
    return { session: target, persisted: false };
  }
}

export async function deleteSession(projectRoot: string): Promise<boolean> {
  try {
    await unlink(sessionPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}

/**
 * End the active session by renaming it into `.ai-sessions/archive/` instead
 * of unlinking. The named slot is left in place so `session switch` can
 * restore it. Returns whether an active file was archived.
 */
export async function endSession(
  projectRoot: string,
): Promise<{ archived: boolean; archivePath?: string; name?: string }> {
  const active = sessionPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(active, 'utf-8');
  } catch {
    return { archived: false };
  }
  let slug = 'session';
  let name: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === 'string' && parsed.name.length > 0) {
      name = parsed.name;
      slug = sessionSlug(parsed.name);
    }
  } catch {
    // corrupt — still archive the raw bytes
  }
  const dest = join(archiveDir(projectRoot), `${slug}-${archiveStamp()}.json`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, raw, 'utf-8');
  await unlink(active);
  return { archived: true, archivePath: dest, name };
}

export async function listSessions(projectRoot: string): Promise<SessionSlot[]> {
  const slots: SessionSlot[] = [];
  const seen = new Set<string>();
  let activeName: string | null = null;
  const active = await loadSession(projectRoot);
  if (active) activeName = active.name;

  let names: string[] = [];
  try {
    names = await readdir(sessionsDir(projectRoot));
  } catch {
    names = [];
  }
  for (const file of names) {
    if (!file.endsWith('.json')) continue;
    const path = resolve(sessionsDir(projectRoot), file);
    try {
      const s = await readSessionFile(path);
      const slug = sessionSlug(s.name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      slots.push({
        name: s.name,
        slug,
        path,
        active: activeName !== null && sessionSlug(activeName) === slug,
      });
    } catch {
      // skip unreadable named files
    }
  }

  if (active && !seen.has(sessionSlug(active.name))) {
    slots.unshift({
      name: active.name,
      slug: sessionSlug(active.name),
      path: sessionPath(projectRoot),
      active: true,
    });
  }

  slots.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return slots;
}

export function formatSessionList(slots: SessionSlot[]): string {
  if (slots.length === 0) {
    return 'No named sessions. Start one with: ai session start <name>';
  }
  const lines = ['Sessions:'];
  for (const s of slots) {
    const mark = s.active ? '* ' : '  ';
    lines.push(`${mark}${s.name}  (${s.slug})`);
  }
  return lines.join('\n');
}

/**
 * Make `name` the active session. Flushes the current active copy to its
 * named slot first so switching is not destructive.
 */
export async function switchSession(projectRoot: string, name: string): Promise<DesignSession> {
  const named = namedSessionPath(projectRoot, name);
  const target = await readSessionFile(named);
  const current = await loadSession(projectRoot);
  if (current && sessionSlug(current.name) !== sessionSlug(target.name)) {
    await saveSession(projectRoot, current);
  }
  const json = JSON.stringify(target, null, 2) + '\n';
  await writeFile(sessionPath(projectRoot), json, 'utf-8');
  return target;
}

/**
 * If a named slot exists and there is no active session, copy it to the
 * active path and return it. Otherwise null.
 */
export async function resumeNamedSession(
  projectRoot: string,
  name: string,
): Promise<DesignSession | null> {
  const named = namedSessionPath(projectRoot, name);
  try {
    const target = await readSessionFile(named);
    await writeFile(sessionPath(projectRoot), JSON.stringify(target, null, 2) + '\n', 'utf-8');
    return target;
  } catch (err) {
    if (err instanceof SessionLoadError && err.code === 'SESSION_NOT_FOUND') return null;
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null;
    throw err;
  }
}

export async function exportSession(
  projectRoot: string,
  destPath?: string,
): Promise<{ json: string; path?: string }> {
  const session = await loadSession(projectRoot);
  if (!session) {
    throw new SessionLoadError(
      sessionPath(projectRoot),
      'no active session',
      'SESSION_NOT_FOUND',
    );
  }
  const json = JSON.stringify(session, null, 2) + '\n';
  if (!destPath) return { json };
  const resolved = resolve(projectRoot, destPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, json, 'utf-8');
  return { json, path: resolved };
}

// --- Factories ---

export function createSession(name: string): DesignSession {
  const now = new Date().toISOString();
  return {
    name,
    createdAt: now,
    updatedAt: now,
    themes: [],
    constraints: [],
    artifacts: emptyArtifacts(),
    issues: [],
    acceptedSuggestions: [],
    history: [{ timestamp: now, kind: 'session_start', detail: `Session "${name}" started` }],
  };
}

// --- History recording ---

export function recordEvent(session: DesignSession, kind: SessionEventKind, detail: string): void {
  session.history = session.history ?? [];
  session.history.push({
    timestamp: new Date().toISOString(),
    kind,
    detail,
  });
  if (session.history.length > MAX_SESSION_HISTORY_EVENTS) {
    session.history.splice(0, session.history.length - MAX_SESSION_HISTORY_EVENTS);
  }
}

// --- Mutators ---

export function addThemes(session: DesignSession, themes: string[]): void {
  for (const t of themes) {
    if (!session.themes.includes(t)) {
      session.themes.push(t);
      recordEvent(session, 'theme_added', t);
    }
  }
}

export function addConstraints(session: DesignSession, constraints: string[]): void {
  for (const c of constraints) {
    if (!session.constraints.includes(c)) {
      session.constraints.push(c);
      recordEvent(session, 'constraint_added', c);
    }
  }
}

export function addArtifact(session: DesignSession, kind: keyof SessionArtifacts, id: string): void {
  const bucket = session.artifacts[kind] ?? (session.artifacts[kind] = []);
  if (!bucket.includes(id)) {
    bucket.push(id);
    recordEvent(session, 'artifact_created', `${kind}/${id}`);
  }
}

export function addCritiqueIssues(session: DesignSession, issues: CritiqueIssue[]): void {
  for (const issue of issues) {
    const existing = session.issues.find(i => i.code === issue.code);
    if (!existing) {
      session.issues.push({
        code: issue.code,
        target: issue.location,
        severity: issue.severity,
        status: 'open',
        summary: issue.summary,
      });
      recordEvent(session, 'issue_opened', `${issue.code}: ${issue.summary}`);
    }
  }
}

export function acceptSuggestion(session: DesignSession, code: string): void {
  if (!session.acceptedSuggestions.includes(code)) {
    session.acceptedSuggestions.push(code);
    recordEvent(session, 'suggestion_accepted', code);
  }
}

export function resolveIssue(session: DesignSession, code: string): boolean {
  const issue = session.issues.find(i => i.code === code);
  if (issue) {
    issue.status = 'resolved';
    recordEvent(session, 'issue_resolved', code);
    return true;
  }
  return false;
}

function formatArtifactLine(kind: ArtifactKind, ids: string[], knownPrefix: string, noneLabel?: string): string | null {
  if (ids.length === 0) return noneLabel ?? null;
  const label = ARTIFACT_LABELS[kind];
  return `${knownPrefix}${label}: ${ids.join(', ')}`;
}

// --- Context rendering (for prompt injection) ---

export function renderSessionContext(session: DesignSession): string {
  const lines: string[] = [];

  lines.push(`Session: ${session.name}`);

  if (session.themes.length > 0) {
    lines.push(`Themes: ${session.themes.join(', ')}`);
  }
  if (session.constraints.length > 0) {
    lines.push(`Constraints: ${session.constraints.join(', ')}`);
  }

  const artifacts = normalizeArtifacts(session.artifacts);
  for (const kind of ARTIFACT_KINDS) {
    const line = formatArtifactLine(kind, artifacts[kind] ?? [], 'Known ');
    if (line) lines.push(line);
  }

  const openIssues = session.issues.filter(i => i.status === 'open');
  if (openIssues.length > 0) {
    lines.push(`Open issues (${openIssues.length}):`);
    for (const issue of openIssues) {
      lines.push(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
    }
  }

  if (session.acceptedSuggestions.length > 0) {
    lines.push(`Accepted suggestions: ${session.acceptedSuggestions.join(', ')}`);
  }

  // Include recent history (last 10 events) for guided design context
  const history = session.history ?? [];
  if (history.length > 0) {
    const recent = history.slice(-10);
    lines.push(`Recent activity (${recent.length} of ${history.length} events):`);
    for (const e of recent) {
      lines.push(`  ${e.kind}: ${e.detail}`);
    }
  }

  return lines.join('\n');
}

// --- Status formatting ---

export function formatSessionStatus(session: DesignSession): string {
  const lines: string[] = [];

  lines.push(`Session: ${session.name}`);
  lines.push(`Created: ${session.createdAt}`);
  lines.push(`Updated: ${session.updatedAt}`);
  lines.push('');

  if (session.themes.length > 0) {
    lines.push(`Themes: ${session.themes.join(', ')}`);
  }
  if (session.constraints.length > 0) {
    lines.push(`Constraints: ${session.constraints.join(', ')}`);
  }
  lines.push('');

  lines.push('Artifacts:');
  const artifacts = normalizeArtifacts(session.artifacts);
  for (const kind of ARTIFACT_KINDS) {
    const ids = artifacts[kind] ?? [];
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    lines.push(`  ${label}: ${ids.length > 0 ? ids.join(', ') : '(none)'}`);
  }
  lines.push('');

  const openIssues = session.issues.filter(i => i.status === 'open');
  const resolvedIssues = session.issues.filter(i => i.status === 'resolved');
  lines.push(`Issues: ${openIssues.length} open, ${resolvedIssues.length} resolved`);
  for (const issue of openIssues) {
    lines.push(`  [${issue.severity}] ${issue.code} → ${issue.target}: ${issue.summary}`);
  }
  lines.push('');

  if (session.acceptedSuggestions.length > 0) {
    lines.push(`Accepted suggestions: ${session.acceptedSuggestions.join(', ')}`);
  }

  if (session.activeBuild) {
    const n = Object.keys(session.activeBuild.stagedWrites ?? {}).length;
    lines.push(`IN_FLIGHT_BUILD: ${session.activeBuild.plan.goal} (${n} staged file${n === 1 ? '' : 's'})`);
  }
  if (session.activeTuning) {
    const n = Object.keys(session.activeTuning.stagedWrites ?? {}).length;
    lines.push(`IN_FLIGHT_TUNING: ${session.activeTuning.plan.goal} (${n} staged file${n === 1 ? '' : 's'})`);
  }

  return lines.join('\n');
}

// --- History formatting ---

export function formatSessionHistory(session: DesignSession, limit = 20): string {
  const history = session.history ?? [];
  if (history.length === 0) return 'No events recorded.';

  const lines: string[] = [];
  lines.push(`Session: ${session.name}`);
  lines.push(`Total events: ${history.length}`);
  lines.push('');

  const shown = limit > 0 ? history.slice(-limit) : history;
  if (limit > 0 && history.length > limit) {
    lines.push(`(showing last ${limit} of ${history.length})`);
    lines.push('');
  }

  for (const event of shown) {
    const ts = event.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    lines.push(`  ${ts}  ${event.kind}: ${event.detail}`);
  }

  return lines.join('\n');
}

/** Scaffold kind → SessionArtifacts bucket. Pack-like kinds land in `packs`. */
export function artifactBucketForKind(kind: string): keyof SessionArtifacts {
  switch (kind) {
    case 'quest':
    case 'quests': return 'quests';
    case 'room':
    case 'rooms': return 'rooms';
    case 'faction':
    case 'factions': return 'factions';
    case 'district':
    case 'districts': return 'districts';
    case 'entity':
    case 'npc':
    case 'entities': return 'entities';
    case 'dialogue':
    case 'dialogues': return 'dialogues';
    case 'ability':
    case 'abilities': return 'abilities';
    case 'status':
    case 'statuses': return 'statuses';
    case 'item':
    case 'items': return 'items';
    case 'hazard':
    case 'hazards': return 'hazards';
    case 'archetype':
    case 'archetypes':
    case 'class': return 'archetypes';
    case 'background':
    case 'backgrounds':
    case 'origin': return 'backgrounds';
    case 'build-catalog':
    case 'catalog':
    case 'catalogs': return 'catalogs';
    case 'placement':
    case 'placements': return 'placements';
    case 'entity-ai':
    case 'entityAi':
    case 'npc-ai': return 'entityAi';
    case 'encounter-anchor':
    case 'anchor':
    case 'anchors': return 'anchors';
    case 'progression-tree':
    case 'tree':
    case 'trees': return 'trees';
    case 'rule-profile':
    case 'rule-profiles':
    case 'ruleProfile':
    case 'ruleProfiles': return 'ruleProfiles';
    case 'item-placement':
    case 'item-placements':
    case 'itemPlacement':
    case 'itemPlacements': return 'itemPlacements';
    default: return 'packs';
  }
}
