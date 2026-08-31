// Command: emit-pack — walk session YAML + project files into a ContentPack JSON.
// No LLM. loadContent is the fail-closed gate; --write is refused when invalid.

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { loadContent, type ContentPack, type LoadResult } from '@ai-rpg-engine/content-schema';
import { parseYamlish } from '../validators.js';
import type { SessionArtifacts } from '../session.js';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.swarm', 'coverage', '.ai-sessions',
  '.ai-transcripts', 'site',
]);
const SKIP_FILES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', '.ai-session.json',
]);
const MAX_FILES = 400;
const MAX_FILE_BYTES = 512 * 1024;

export type ClassifiedDoc = {
  kind: string;
  id?: string;
  value: Record<string, unknown>;
  path: string;
};

export type EmitPackResult = {
  pack: ContentPack;
  load: LoadResult;
  filesRead: string[];
  notes: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asId(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function pushUnique<T extends Record<string, unknown>>(
  list: T[],
  item: T,
  idKey: string,
): void {
  const id = asId(item[idKey]);
  if (id) {
    const idx = list.findIndex((x) => asId(x[idKey]) === id);
    if (idx >= 0) {
      list[idx] = item;
      return;
    }
  }
  list.push(item);
}

/** Classify a parsed YAML/JSON document into a studio kind. */
export function classifyDocument(parsed: unknown, filePath = ''): ClassifiedDoc | null {
  if (!isRecord(parsed)) return null;
  const name = filePath.replace(/\\/g, '/').toLowerCase();

  if (Array.isArray(parsed.zones) && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
    return { kind: 'room', id: parsed.id, value: parsed, path: filePath };
  }
  if (isRecord(parsed.room) && Array.isArray(parsed.entities) && isRecord(parsed.quest)) {
    return { kind: 'encounter-pack', id: asId(parsed.id) ?? asId((parsed.room as Record<string, unknown>).id), value: parsed, path: filePath };
  }
  if (isRecord(parsed.district) && Array.isArray(parsed.rooms)) {
    return { kind: 'location-pack', id: asId(parsed.id) ?? asId((parsed.district as Record<string, unknown>).id), value: parsed, path: filePath };
  }
  if (Array.isArray(parsed.traits) && typeof parsed.requiredFlaws === 'number' && typeof parsed.maxTraits === 'number') {
    return { kind: 'catalog', id: asId(parsed.packId) ?? asId(parsed.id) ?? 'catalog', value: parsed, path: filePath };
  }
  if (typeof parsed.profileId === 'string' && parsed.profileId.length > 0) {
    return { kind: 'entityAi', id: asId(parsed.entityId) ?? asId(parsed.id), value: parsed, path: filePath };
  }
  const looksLikeAiMap = Object.keys(parsed).length > 0
    && Object.values(parsed).every((e) => isRecord(e) && typeof e.profileId === 'string')
    && !('id' in parsed);
  if (looksLikeAiMap) {
    return { kind: 'entityAi-map', value: parsed, path: filePath };
  }
  if (typeof parsed.entityId === 'string' && typeof parsed.zoneId === 'string') {
    return { kind: 'placement', id: `${parsed.entityId}@${parsed.zoneId}`, value: parsed, path: filePath };
  }
  if (isRecord(parsed.statPriorities) && typeof parsed.progressionTreeId === 'string') {
    return { kind: 'archetype', id: asId(parsed.id), value: parsed, path: filePath };
  }
  if (isRecord(parsed.statModifiers) && Array.isArray(parsed.startingTags) && typeof parsed.id === 'string') {
    return { kind: 'background', id: parsed.id, value: parsed, path: filePath };
  }
  if (Array.isArray(parsed.speakers) || parsed.entryNodeId !== undefined || isRecord(parsed.nodes)) {
    return { kind: 'dialogue', id: asId(parsed.id), value: parsed, path: filePath };
  }
  if (Array.isArray(parsed.stages) && typeof parsed.id === 'string') {
    return { kind: 'quest', id: parsed.id, value: parsed, path: filePath };
  }
  if (Array.isArray(parsed.zoneIds) && typeof parsed.id === 'string' && typeof parsed.name === 'string') {
    return { kind: 'district', id: parsed.id, value: parsed, path: filePath };
  }
  if (typeof parsed.trigger === 'string' && Array.isArray(parsed.effects)) {
    return { kind: 'hazard', id: asId(parsed.id), value: parsed, path: filePath };
  }
  if (typeof parsed.verb === 'string' && (Array.isArray(parsed.effects) || isRecord(parsed.target))) {
    return { kind: 'ability', id: asId(parsed.id), value: parsed, path: filePath };
  }
  if (typeof parsed.stacking === 'string') {
    return { kind: 'status', id: asId(parsed.id), value: parsed, path: filePath };
  }
  if (typeof parsed.id === 'string' && !parsed.type && (typeof parsed.slot === 'string' || typeof parsed.rarity === 'string')) {
    return { kind: 'item', id: parsed.id, value: parsed, path: filePath };
  }
  if (typeof parsed.id === 'string' && typeof parsed.type === 'string' && typeof parsed.name === 'string') {
    return { kind: 'entity', id: parsed.id, value: parsed, path: filePath };
  }
  if (Array.isArray(parsed.members) && typeof parsed.id === 'string') {
    return { kind: 'faction', id: parsed.id, value: parsed, path: filePath };
  }
  // Already-assembled ContentPack (emit-pack output / starter JSON).
  if (Array.isArray(parsed.entities) || Array.isArray(parsed.zones) || Array.isArray(parsed.quests)) {
    if (!Array.isArray(parsed.zones) || parsed.name === undefined) {
      return { kind: 'pack-json', id: asId(parsed.schemaVersion), value: parsed, path: filePath };
    }
  }
  if (name.endsWith('.json') && (Array.isArray(parsed.entities) || Array.isArray(parsed.zones))) {
    return { kind: 'pack-json', value: parsed, path: filePath };
  }
  return null;
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0 && out.length < MAX_FILES) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith('.') && name !== '.ai-session.json') {
        if (SKIP_DIRS.has(name)) continue;
        if (name !== '.ai-session.json' && name.startsWith('.')) continue;
      }
      if (SKIP_DIRS.has(name)) continue;
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
      if (SKIP_FILES.has(name)) continue;
      const ext = extname(name).toLowerCase();
      if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') continue;
      if (info.size > MAX_FILE_BYTES) continue;
      out.push(full);
      if (out.length >= MAX_FILES) break;
    }
  }
  return out;
}

function liftZoneEntities(
  zone: Record<string, unknown>,
  placements: Array<{ entityId: string; zoneId: string }>,
): Record<string, unknown> {
  const zoneId = asId(zone.id);
  const entities = zone.entities;
  if (zoneId && Array.isArray(entities)) {
    for (const e of entities) {
      if (typeof e !== 'string' || e.length === 0) continue;
      if (!placements.some((p) => p.entityId === e && p.zoneId === zoneId)) {
        placements.push({ entityId: e, zoneId });
      }
    }
  }
  return zone;
}

function mergePackJson(pack: MutablePack, src: Record<string, unknown>, notes: string[]): void {
  const take = <K extends keyof MutablePack>(key: K, label: string) => {
    const v = src[key as string];
    if (!Array.isArray(v)) return;
    const dest = pack[key] as unknown as Record<string, unknown>[];
    for (const item of v) {
      if (isRecord(item)) {
        const idKey = key === 'placements' ? 'entityId' : 'id';
        if (key === 'placements' && typeof item.entityId === 'string' && typeof item.zoneId === 'string') {
          if (!dest.some((p) => p.entityId === item.entityId && p.zoneId === item.zoneId)) dest.push(item);
        } else {
          pushUnique(dest, item, idKey);
        }
      }
    }
    notes.push(`merged ${v.length} ${label} from pack JSON`);
  };
  take('entities', 'entities');
  take('zones', 'zones');
  take('quests', 'quests');
  take('dialogues', 'dialogues');
  take('items', 'items');
  take('hazardDefinitions', 'hazardDefinitions');
  take('districts', 'districts');
  take('abilities', 'abilities');
  take('statuses', 'statuses');
  take('archetypes', 'archetypes');
  take('backgrounds', 'backgrounds');
  take('placements', 'placements');
  if (isRecord(src.entityAi)) {
    pack.entityAi = { ...pack.entityAi, ...src.entityAi as Record<string, Record<string, unknown>> };
  }
  if (isRecord(src.buildCatalog) && !pack.buildCatalog) {
    pack.buildCatalog = src.buildCatalog;
  }
}

type MutablePack = {
  schemaVersion: string;
  entities: Record<string, unknown>[];
  zones: Record<string, unknown>[];
  quests: Record<string, unknown>[];
  dialogues: Record<string, unknown>[];
  items: Record<string, unknown>[];
  hazardDefinitions: Record<string, unknown>[];
  districts: Record<string, unknown>[];
  abilities: Record<string, unknown>[];
  statuses: Record<string, unknown>[];
  archetypes: Record<string, unknown>[];
  backgrounds: Record<string, unknown>[];
  placements: Array<{ entityId: string; zoneId: string } & Record<string, unknown>>;
  entityAi: Record<string, Record<string, unknown>>;
  buildCatalog?: Record<string, unknown>;
};

function emptyPack(): MutablePack {
  return {
    schemaVersion: '1',
    entities: [],
    zones: [],
    quests: [],
    dialogues: [],
    items: [],
    hazardDefinitions: [],
    districts: [],
    abilities: [],
    statuses: [],
    archetypes: [],
    backgrounds: [],
    placements: [],
    entityAi: {},
  };
}

function ingest(pack: MutablePack, doc: ClassifiedDoc, notes: string[]): void {
  const v = doc.value;
  switch (doc.kind) {
    case 'room': {
      const zones = Array.isArray(v.zones) ? v.zones : [];
      for (const z of zones) {
        if (!isRecord(z)) continue;
        const lifted = liftZoneEntities(z, pack.placements);
        pushUnique(pack.zones, lifted, 'id');
      }
      notes.push(`lifted ${zones.length} zone(s) from room ${doc.id ?? '?'}`);
      break;
    }
    case 'encounter-pack': {
      if (isRecord(v.room)) ingest(pack, { kind: 'room', id: asId(v.room.id), value: v.room, path: doc.path }, notes);
      if (Array.isArray(v.entities)) {
        for (const e of v.entities) {
          if (isRecord(e)) pushUnique(pack.entities, e, 'id');
        }
      }
      if (isRecord(v.quest)) pushUnique(pack.quests, v.quest, 'id');
      break;
    }
    case 'location-pack': {
      if (isRecord(v.district)) pushUnique(pack.districts, v.district, 'id');
      if (Array.isArray(v.rooms)) {
        for (const room of v.rooms) {
          if (isRecord(room)) ingest(pack, { kind: 'room', id: asId(room.id), value: room, path: doc.path }, notes);
        }
      }
      break;
    }
    case 'entity':
      pushUnique(pack.entities, v, 'id');
      break;
    case 'quest':
      pushUnique(pack.quests, v, 'id');
      break;
    case 'dialogue':
      pushUnique(pack.dialogues, v, 'id');
      break;
    case 'item':
      pushUnique(pack.items, v, 'id');
      break;
    case 'hazard':
      pushUnique(pack.hazardDefinitions, v, 'id');
      break;
    case 'district':
      pushUnique(pack.districts, v, 'id');
      break;
    case 'ability':
      pushUnique(pack.abilities, v, 'id');
      break;
    case 'status':
      pushUnique(pack.statuses, v, 'id');
      break;
    case 'archetype':
      pushUnique(pack.archetypes, v, 'id');
      break;
    case 'background':
      pushUnique(pack.backgrounds, v, 'id');
      break;
    case 'catalog':
      pack.buildCatalog = v;
      if (Array.isArray(v.archetypes)) {
        for (const a of v.archetypes) if (isRecord(a)) pushUnique(pack.archetypes, a, 'id');
      }
      if (Array.isArray(v.backgrounds)) {
        for (const b of v.backgrounds) if (isRecord(b)) pushUnique(pack.backgrounds, b, 'id');
      }
      break;
    case 'placement':
      if (typeof v.entityId === 'string' && typeof v.zoneId === 'string') {
        if (!pack.placements.some((p) => p.entityId === v.entityId && p.zoneId === v.zoneId)) {
          pack.placements.push({ entityId: v.entityId, zoneId: v.zoneId, ...v });
        }
      }
      break;
    case 'entityAi': {
      const id = asId(v.entityId) ?? asId(v.id);
      if (id) {
        const { entityId: _e, id: _i, ...rest } = v;
        pack.entityAi[id] = rest;
      }
      break;
    }
    case 'entityAi-map':
      for (const [id, ai] of Object.entries(v)) {
        if (isRecord(ai)) pack.entityAi[id] = ai;
      }
      break;
    case 'pack-json':
      mergePackJson(pack, v, notes);
      break;
    default:
      break;
  }
}

function toContentPack(pack: MutablePack): ContentPack {
  const out: ContentPack = {
    schemaVersion: pack.schemaVersion,
  };
  if (pack.entities.length) out.entities = pack.entities as ContentPack['entities'];
  if (pack.zones.length) out.zones = pack.zones as ContentPack['zones'];
  if (pack.quests.length) out.quests = pack.quests as ContentPack['quests'];
  if (pack.dialogues.length) out.dialogues = pack.dialogues as ContentPack['dialogues'];
  if (pack.items.length) out.items = pack.items as ContentPack['items'];
  if (pack.hazardDefinitions.length) out.hazardDefinitions = pack.hazardDefinitions as ContentPack['hazardDefinitions'];
  if (pack.districts.length) out.districts = pack.districts as ContentPack['districts'];
  if (pack.abilities.length) out.abilities = pack.abilities as ContentPack['abilities'];
  if (pack.statuses.length) out.statuses = pack.statuses as ContentPack['statuses'];
  if (pack.archetypes.length) out.archetypes = pack.archetypes as ContentPack['archetypes'];
  if (pack.backgrounds.length) out.backgrounds = pack.backgrounds as ContentPack['backgrounds'];
  if (pack.placements.length) out.placements = pack.placements as ContentPack['placements'];
  if (Object.keys(pack.entityAi).length) out.entityAi = pack.entityAi as ContentPack['entityAi'];
  if (pack.buildCatalog) out.buildCatalog = pack.buildCatalog;
  return out;
}

export async function assembleContentPack(
  projectRoot: string,
  options: { extraPaths?: string[]; artifacts?: SessionArtifacts } = {},
): Promise<EmitPackResult> {
  const notes: string[] = [];
  const filesRead: string[] = [];
  const pack = emptyPack();
  const root = resolve(projectRoot);
  const files = await walkFiles(root);
  const extra = options.extraPaths ?? [];
  const all = [...new Set([...files, ...extra.map((p) => resolve(root, p))])];

  for (const file of all) {
    let raw: string;
    try {
      raw = await readFile(file, 'utf-8');
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = file.endsWith('.json') ? JSON.parse(raw) : parseYamlish(raw);
    } catch {
      notes.push(`skipped unreadable ${relative(root, file)}`);
      continue;
    }
    const doc = classifyDocument(parsed, file);
    if (!doc) continue;
    filesRead.push(file);
    ingest(pack, doc, notes);
  }

  const contentPack = toContentPack(pack);
  const load = loadContent(contentPack);
  return { pack: contentPack, load, filesRead, notes };
}

export function formatEmitPackReport(result: EmitPackResult): string {
  const lines = [result.load.summary];
  if (result.filesRead.length > 0) {
    lines.push(`Assembled from ${result.filesRead.length} file(s).`);
  }
  if (result.pack.placements && result.pack.placements.length > 0) {
    lines.push(`Placements: ${result.pack.placements.length} (zone.entities lifted).`);
  }
  if (result.pack.entityAi) {
    lines.push(`entityAi overlays: ${Object.keys(result.pack.entityAi).length}.`);
  }
  return lines.join('\n');
}

export function defaultPackWritePath(projectRoot: string): string {
  return join(projectRoot, 'content', 'pack.json');
}

export function packJson(pack: ContentPack): string {
  return JSON.stringify(pack, null, 2) + '\n';
}

/** Ids from a ContentPack / classified doc into session artifact buckets. */
export function idsFromPack(pack: ContentPack): Partial<SessionArtifacts> {
  const pick = (arr: Array<{ id?: string }> | undefined): string[] =>
    (arr ?? []).map((x) => x.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
  const out: Partial<SessionArtifacts> = {
    entities: pick(pack.entities),
    quests: pick(pack.quests),
    dialogues: pick(pack.dialogues),
    items: pick(pack.items),
    hazards: pick(pack.hazardDefinitions),
    districts: pick(pack.districts),
    abilities: pick(pack.abilities),
    statuses: pick(pack.statuses),
    archetypes: pick(pack.archetypes),
    backgrounds: pick(pack.backgrounds),
    rooms: pick(pack.zones),
    placements: (pack.placements ?? [])
      .map((p) => (p.entityId && p.zoneId ? `${p.entityId}@${p.zoneId}` : ''))
      .filter(Boolean),
    entityAi: pack.entityAi ? Object.keys(pack.entityAi) : [],
    catalogs: asId((pack.buildCatalog as { packId?: unknown } | undefined)?.packId)
      ? [asId((pack.buildCatalog as { packId?: unknown }).packId)!]
      : [],
  };
  return out;
}


