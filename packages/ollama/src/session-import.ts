// session import — fill SessionArtifacts from a pack JSON, content.ts, or YAML glob.

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import {
  addArtifact,
  createSession,
  recordEvent,
  type DesignSession,
  type SessionArtifacts,
} from './session.js';
import { parseYamlish } from './validators.js';
import { classifyDocument, idsFromPack, type ClassifiedDoc } from './commands/emit-pack.js';
import type { ContentPack } from '@ai-rpg-engine/content-schema';

const CONVENTIONAL_PACKS = [
  'content/pack.json',
  'pack.json',
  'content.json',
  'content/content.json',
];
const CONVENTIONAL_TS = [
  'src/content.ts',
  'content.ts',
  'src/pack.ts',
];

export type ImportSessionResult = {
  session: DesignSession;
  added: number;
  source: string;
  buckets: Partial<SessionArtifacts>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function mergeIds(into: Partial<SessionArtifacts>, from: Partial<SessionArtifacts>): void {
  for (const [kind, ids] of Object.entries(from) as Array<[keyof SessionArtifacts, string[] | undefined]>) {
    if (!ids || ids.length === 0) continue;
    const bucket = (into[kind] ?? (into[kind] = [])) as string[];
    for (const id of ids) {
      if (id && !bucket.includes(id)) bucket.push(id);
    }
  }
}

function idsFromDoc(doc: ClassifiedDoc): Partial<SessionArtifacts> {
  const id = doc.id;
  switch (doc.kind) {
    case 'room': return { rooms: id ? [id] : [] };
    case 'entity': return { entities: id ? [id] : [] };
    case 'quest': return { quests: id ? [id] : [] };
    case 'dialogue': return { dialogues: id ? [id] : [] };
    case 'item': return { items: id ? [id] : [] };
    case 'hazard': return { hazards: id ? [id] : [] };
    case 'district': return { districts: id ? [id] : [] };
    case 'ability': return { abilities: id ? [id] : [] };
    case 'status': return { statuses: id ? [id] : [] };
    case 'archetype': return { archetypes: id ? [id] : [] };
    case 'background': return { backgrounds: id ? [id] : [] };
    case 'catalog': return { catalogs: id ? [id] : [] };
    case 'placement': return { placements: id ? [id] : [] };
    case 'entityAi': return { entityAi: id ? [id] : [] };
    case 'entityAi-map': return { entityAi: Object.keys(doc.value) };
    case 'encounter-anchor': return { anchors: id ? [id] : [] };
    case 'progression-tree': return { trees: id ? [id] : [] };
    case 'faction': return { factions: id ? [id] : [] };
    case 'encounter-pack':
    case 'location-pack':
      return { packs: id ? [id] : [] };
    case 'pack-json':
      return idsFromPack(doc.value as ContentPack);
    default:
      return {};
  }
}

/** Pull `id: 'foo'` / `id: "foo"` tokens out of a TypeScript content export. */
export function extractIdsFromContentTs(src: string): Partial<SessionArtifacts> {
  const buckets: Partial<SessionArtifacts> = {};
  const sections: Array<{ key: keyof SessionArtifacts; re: RegExp }> = [
    { key: 'entities', re: /entities\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'quests', re: /quests\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'dialogues', re: /dialogues\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'items', re: /items\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'districts', re: /districts\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'archetypes', re: /archetypes\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'backgrounds', re: /backgrounds\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'rooms', re: /(?:zones|rooms)\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'hazards', re: /hazardDefinitions\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'abilities', re: /abilities\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'statuses', re: /statuses\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'anchors', re: /encounterAnchors\s*:\s*\[([\s\S]*?)\]/ },
    { key: 'trees', re: /progressionTrees\s*:\s*\[([\s\S]*?)\]/ },
  ];
  const idRe = /\bid\s*:\s*['"]([a-z0-9_:-]+)['"]/gi;
  for (const { key, re } of sections) {
    const m = re.exec(src);
    if (!m) continue;
    const ids: string[] = [];
    let hit: RegExpExecArray | null;
    const body = m[1];
    const local = new RegExp(idRe.source, 'gi');
    while ((hit = local.exec(body))) {
      if (!ids.includes(hit[1])) ids.push(hit[1]);
    }
    if (ids.length) buckets[key] = ids;
  }
  return buckets;
}

async function globYaml(root: string): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set(['node_modules', 'dist', '.git', '.swarm', 'coverage', 'site']);
  const stack = [root];
  while (stack.length && out.length < 400) {
    const dir = stack.pop()!;
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (skip.has(name) || (name.startsWith('.') && name !== '.')) continue;
      const full = join(dir, name);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        stack.push(full);
        continue;
      }
      const ext = extname(name).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') out.push(full);
    }
  }
  return out;
}

async function parseFile(path: string): Promise<Partial<SessionArtifacts>> {
  const raw = await readFile(path, 'utf-8');
  const ext = extname(path).toLowerCase();
  if (ext === '.ts' || ext === '.js' || ext === '.mjs') {
    return extractIdsFromContentTs(raw);
  }
  let parsed: unknown;
  try {
    parsed = ext === '.json' ? JSON.parse(raw) : parseYamlish(raw);
  } catch {
    return {};
  }
  const doc = classifyDocument(parsed, path);
  if (!doc) {
    if (isRecord(parsed) && (Array.isArray(parsed.entities) || Array.isArray(parsed.zones))) {
      return idsFromPack(parsed as ContentPack);
    }
    return {};
  }
  return idsFromDoc(doc);
}

export async function resolveImportTarget(projectRoot: string, pathArg?: string): Promise<{ path: string; label: string }> {
  const root = resolve(projectRoot);
  if (pathArg && pathArg.length > 0) {
    return { path: resolve(root, pathArg), label: pathArg };
  }
  for (const rel of CONVENTIONAL_PACKS) {
    const p = join(root, rel);
    if (await fileExists(p)) return { path: p, label: rel };
  }
  for (const rel of CONVENTIONAL_TS) {
    const p = join(root, rel);
    if (await fileExists(p)) return { path: p, label: rel };
  }
  return { path: root, label: '*.yaml' };
}

export async function collectImportIds(
  projectRoot: string,
  pathArg?: string,
): Promise<{ buckets: Partial<SessionArtifacts>; source: string }> {
  const target = await resolveImportTarget(projectRoot, pathArg);
  const buckets: Partial<SessionArtifacts> = {};
  let info;
  try {
    info = await stat(target.path);
  } catch {
    return { buckets, source: target.label };
  }
  if (info.isDirectory()) {
    const files = await globYaml(target.path);
    for (const file of files) {
      mergeIds(buckets, await parseFile(file));
    }
    return { buckets, source: `${target.label} (${files.length} yaml)` };
  }
  mergeIds(buckets, await parseFile(target.path));
  return { buckets, source: target.label };
}

export function applyImportedIds(session: DesignSession, buckets: Partial<SessionArtifacts>): number {
  let added = 0;
  for (const [kind, ids] of Object.entries(buckets) as Array<[keyof SessionArtifacts, string[] | undefined]>) {
    if (!ids) continue;
    for (const id of ids) {
      const before = (session.artifacts[kind] ?? []).length;
      addArtifact(session, kind, id);
      if ((session.artifacts[kind] ?? []).length > before) added++;
    }
  }
  return added;
}

export async function importSessionArtifacts(
  projectRoot: string,
  session: DesignSession | null,
  pathArg?: string,
): Promise<ImportSessionResult> {
  const { buckets, source } = await collectImportIds(projectRoot, pathArg);
  const active = session ?? createSession('imported');
  const added = applyImportedIds(active, buckets);
  recordEvent(active, 'session_imported', `Imported ${added} artifact id(s) from ${source}`);
  return { session: active, added, source, buckets };
}
