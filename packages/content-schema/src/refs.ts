// Cross-reference validation — checks that IDs reference real content

import type { ValidationError, ValidationResult } from './validate.js';
import type {
  EntityBlueprint,
  ZoneDefinition,
  DialogueDefinition,
  QuestDefinition,
  AbilityDefinition,
  StatusDefinition,
  ConditionSpec,
} from './schemas.js';

export type ContentPack = {
  entities?: EntityBlueprint[];
  zones?: ZoneDefinition[];
  dialogues?: DialogueDefinition[];
  quests?: QuestDefinition[];
  /** Optional ability definitions — used by validateGameContent to build a verb/status web */
  abilities?: AbilityDefinition[];
  /** Optional status definitions — used by validateGameContent to resolve status references */
  statuses?: StatusDefinition[];
  /** Optional verb definitions — used by validateGameContent to resolve ability verbs */
  verbs?: { id: string }[];
  /**
   * Optional chargen archetype definitions (character-creation's build-catalog
   * `archetypes[]`) — used by validateGameContent to check `startingInventory` kits
   * against the item registry (F-703048a5). Minimal shape mirrors
   * `ArchetypeDefinition` (same pattern as `BuildCatalogShape` in build-catalog.ts);
   * content-schema sits BELOW character-creation in the dependency graph, so
   * importing the real type would invert the layering. A real `ArchetypeDefinition[]`
   * satisfies this shape as-is — no reshaping needed to wire it in.
   */
  archetypes?: { id: string; startingInventory?: string[] }[];
  /**
   * Optional chargen background definitions (character-creation's build-catalog
   * `backgrounds[]`) — used by validateGameContent to check `startingInventory` kits
   * against the item registry (F-703048a5). Minimal shape mirrors
   * `BackgroundDefinition`; see `archetypes` above for the layering rationale.
   */
  backgrounds?: { id: string; startingInventory?: string[] }[];
  /**
   * Optional bespoke item-use-effect definitions (e.g. inventory-core's
   * `ItemEffect[]`) — used by validateGameContent to check each `itemId` against
   * the item registry (F-703048a5). Minimal shape mirrors `ItemEffect` (the `use`
   * function field, if present, is simply ignored here).
   */
  itemUseEffects?: { itemId: string }[];
  /**
   * Pack format version. Emitted by world-forge's `exportToEngine` since the
   * lane existed and, until C1, an UNDECLARED key — so it landed in the same
   * silent-pass bucket as a typo (C0 REPORT §3.1: a nonsense key produced a
   * byte-identical load report to real content). Declared here so the key
   * allowlist can reject genuine unknowns without rejecting a real emitted key.
   */
  schemaVersion?: string;
  /**
   * District topology. Real `DistrictDefinition` data in the shape district-core
   * understands, which arrived at a key `ContentPack` did not declare — one of
   * C0's "cheap wire gaps" (REPORT §3.1). Routed into a booted world by
   * `applyContentPack`'s districts channel: district-core reads its definitions
   * from world state (`district-core.ts:212`), so a post-boot write lands.
   *
   * Minimal structural shape, mirroring the `archetypes`/`backgrounds` pattern
   * above — content-schema sits BELOW @ai-rpg-engine/modules, so importing the
   * real `DistrictDefinition` would invert the layering. A real
   * `DistrictDefinition[]` satisfies this as-is.
   */
  districts?: {
    id: string;
    name: string;
    zoneIds: string[];
    tags: string[];
    controllingFaction?: string;
    baseMetrics?: Record<string, number>;
  }[];
  /**
   * Character-creation catalog. Authored in world-forge and exported — an
   * authoring win previously cancelled by a wire gap (REPORT §4: `archetypes`
   * and `backgrounds` ARE authored and exported, they just landed under a key
   * the engine did not declare).
   *
   * SESSION-SCOPED: consumed by character creation before a session runs, not by
   * any world reader. Read it with `extractSessionContent`, not
   * `applyContentPack`. Shape left open — `validateBuildCatalog` in this package
   * is the checker.
   */
  buildCatalog?: Record<string, unknown>;
  /**
   * Progression trees. SESSION-SCOPED for a structural reason measured in C1:
   * progression-core closure-captures its tree `Map` at construction
   * (`progression-core.ts:70-72`) and never reads trees from world state, so a
   * post-boot write cannot reach it. Read it with `extractSessionContent` and
   * pass it to `createProgressionCore({ trees })`.
   */
  progressionTrees?: unknown[];
  /**
   * WHERE the pack's entities stand (C3/P1).
   *
   * C0's sharpest single drop: `EntityBlueprint` has no location field, so an
   * exported pack knew every NPC and where none of them stood (REPORT §2 —
   * "the single most consequential drop in the lane"), and C1's intake seam
   * reported it as an advisory on every single ingestion because there was
   * nothing better to do about it.
   *
   * Placement is its own record rather than a field on the blueprint, and that
   * is deliberate: a blueprint is a TEMPLATE. `encounter-spawn` already clones
   * templates and overrides `zoneId` per instance, so a location on the
   * template would be a lie for every cloned participant. One template, N
   * placements.
   */
  placements?: EntityPlacementRecord[];
  /**
   * Deterministic per-zone spawn sets (C3/P1) — the charter's Pillar 2
   * "deterministic per-zone spawn sets with cleared/respawn state".
   *
   * Emitted by world-forge since the lane existed and, until now, an UNDECLARED
   * pass-through with zero engine hits (C0 REPORT §3.1). Routed into a booted
   * world by an injected channel that REGISTERS into `encounter-spawn`'s
   * existing content registry — the engine already has a complete spawn system
   * (rolls, one-live-encounter-per-zone ledger, `encounter.spawned` event), and
   * C3 extends it rather than standing a second one beside it.
   *
   * Minimal structural shape, mirroring the `districts` pattern above:
   * content-schema sits BELOW @ai-rpg-engine/modules, so importing the real
   * `EncounterAnchor` would invert the layering.
   */
  encounterAnchors?: EncounterAnchorRecord[];
  /**
   * TYPED environmental hazards (C3/P3) — the vocabulary that lets hazard data
   * MEAN something.
   *
   * C0 §3.2's sharpest measurement: hazard STRINGS carry no engine semantics
   * ("their meaning is JavaScript the pack ships"), so a data-only export was
   * inert by construction, and C0 §9 called closing this "the highest-value single
   * item, because it closes a structural hole rather than a wire hole."
   *
   * Zones bind to these by id through `ZoneDefinition.hazardRefs`. Shape mirrored
   * structurally (the `districts` pattern) because the interpreter lives in
   * @ai-rpg-engine/modules, above this package.
   */
  hazardDefinitions?: Array<{
    id: string;
    name?: string;
    effects: unknown[];
    trigger: string;
    moveCostDelta?: number;
    passable?: string;
    blocksVision?: boolean;
    weatherConditions?: string[];
    immuneTags?: string[];
    tags?: string[];
  }>;
  /**
   * Optional item catalog entries. Derived into the item registry by
   * {@link validateGameContent} so a JSON pack that names items in inventory,
   * chargen kits, or quest rewards is not green on a dangling id.
   */
  items?: { id: string }[];
};

/**
 * One entity, placed in one zone, optionally gated on a compiled condition.
 *
 * `spawnCondition` is a {@link ConditionSpec}, not a grammar string: world-forge
 * COMPILES its SpawnCondition grammar at export (RG-C1 Lane 2's ink pattern — a
 * rich authoring grammar compiling to a closed, engine-owned instruction
 * format). The engine never parses author syntax.
 */
export type EntityPlacementRecord = {
  /** An `EntityBlueprint.id` in this pack. Unresolvable ⇒ refused by name. */
  entityId: string;
  /** A `ZoneDefinition.id` in this pack. Unresolvable ⇒ refused by name. */
  zoneId: string;
  /** Absent ⇒ always placed. */
  spawnCondition?: ConditionSpec;
};

/** A per-zone encounter table entry. See {@link ContentPack.encounterAnchors}. */
export type EncounterAnchorRecord = {
  id: string;
  zoneId: string;
  /** Closed set — an unmapped value is REFUSED, never defaulted. */
  encounterType: 'ambush' | 'patrol' | 'horde' | 'duel' | string;
  enemyIds: string[];
  /** Per-anchor spawn chance in [0, 1]. */
  probability: number;
  /** Rounds a zone stays quiet after this anchor fires. */
  cooldownTurns: number;
  tags: string[];
};

/**
 * Result of a cross-reference pass.
 *
 * `errors` set `ok` to false (genuinely broken references). `advisories` never affect
 * `ok` — they are likely-mistake signals the author should look at (mirrors the
 * `validateAbilityPack` / `validateStatusDefinitionPack` warning pattern).
 */
export type RefsResult = ValidationResult & { advisories: ValidationError[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function duplicateIdMessage(kind: string, id: string): string {
  return `duplicate ${kind} id "${id}" — ${kind} ids must be unique; rename one of the copies (at load, the later definition silently replaces the earlier one)`;
}

function collectUniqueIds(
  records: Array<{ id?: unknown }>,
  kind: string,
  pathFor: (id: string, index: number) => string,
  errors: ValidationError[],
): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < records.length; i++) {
    const id = records[i].id;
    if (typeof id !== 'string') continue;
    if (ids.has(id)) {
      errors.push({ path: pathFor(id, i), message: duplicateIdMessage(kind, id) });
    }
    ids.add(id);
  }
  return ids;
}

function idsFrom(collection: unknown): string[] | undefined {
  if (!Array.isArray(collection)) return undefined;
  return collection
    .filter(isRecord)
    .map((r) => (r as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string');
}

export function validateRefs(pack: ContentPack): RefsResult {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];
  const path = 'refs';

  // Boundary guard: validateRefs is a public export (and the base of
  // validateGameContent), so a caller may hand it malformed input directly
  // (loadContent guards before calling, but other callers may not). Return a
  // structured error rather than a raw TypeError from `.map(e => e.id)`.
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
    return { ok: false, errors: [{ path: 'pack', message: 'content pack must be a plain object' }], advisories: [] };
  }

  // Normalize every collection to a safe array of record elements once, so the
  // cross-ref loops below can never raw-throw on a null/non-array collection or a
  // null element (the per-type validators enforce element shape; validateRefs is
  // cross-reference only, but as a public boundary it must degrade, not crash).
  const zones = (Array.isArray(pack.zones) ? pack.zones : []).filter(isRecord) as NonNullable<ContentPack['zones']>;
  const entities = (Array.isArray(pack.entities) ? pack.entities : []).filter(isRecord) as NonNullable<ContentPack['entities']>;
  const dialogues = (Array.isArray(pack.dialogues) ? pack.dialogues : []).filter(isRecord) as NonNullable<ContentPack['dialogues']>;
  const quests = (Array.isArray(pack.quests) ? pack.quests : []).filter(isRecord) as NonNullable<ContentPack['quests']>;
  // Build the id registries WITH duplicate detection (v2.5 PC-4, F-9c5db864).
  // A plain `new Set(map(id))` silently dedups, so a copy-pasted record whose
  // id was never renamed passed validation clean and then silently clobbered
  // at WorldStore / MODULE_INTAKE last-wins — one authored thing missing from
  // the shipped game with zero diagnostic.
  const entityIds = collectUniqueIds(entities, 'entity', (id) => `${path}.entity(${id}).id`, errors);
  const zoneIds = collectUniqueIds(zones, 'zone', (id) => `${path}.zone(${id}).id`, errors);
  collectUniqueIds(dialogues, 'dialogue', (id) => `${path}.dialogue(${id}).id`, errors);
  collectUniqueIds(quests, 'quest', (id) => `${path}.quest(${id}).id`, errors);

  // Zone neighbors must reference existing zones
  for (const zone of zones) {
    for (const neighbor of zone.neighbors ?? []) {
      if (!zoneIds.has(neighbor)) {
        errors.push({
          path: `${path}.zone(${zone.id}).neighbors`,
          message: `references unknown zone "${neighbor}"`,
        });
      }
    }
    // Exit targets must reference existing zones
    for (const exit of zone.exits ?? []) {
      if (!zoneIds.has(exit.targetZoneId)) {
        errors.push({
          path: `${path}.zone(${zone.id}).exits`,
          message: `exit target references unknown zone "${exit.targetZoneId}"`,
        });
      }
    }
    // Entities placed in zones must exist
    for (const entityId of zone.entities ?? []) {
      if (!entityIds.has(entityId)) {
        errors.push({
          path: `${path}.zone(${zone.id}).entities`,
          message: `references unknown entity "${entityId}"`,
        });
      }
    }
  }

  // F-6fbd6e71: district zoneIds bind to pack.zones[].id the same way
  // placements bind to entities and hazardRefs bind to hazardDefinitions.
  // A ghost zone is an ERROR. Two districts claiming the same zone is also
  // an error — intake last-wins (`zoneToDistrict[zoneId] = def.id`), so the
  // earlier claim silently disappears.
  const districts = (Array.isArray(pack.districts) ? pack.districts : []).filter(isRecord) as NonNullable<ContentPack['districts']>;
  collectUniqueIds(districts, 'district', (id) => `${path}.district(${id}).id`, errors);
  const claimedZones = new Map<string, string>();
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    const districtId = typeof d.id === 'string' && d.id.length > 0 ? d.id : `districts[${i}]`;
    const zids = Array.isArray(d.zoneIds) ? d.zoneIds : [];
    for (const zid of zids) {
      if (typeof zid !== 'string') continue;
      if (!zoneIds.has(zid)) {
        errors.push({
          path: `${path}.district(${districtId}).zoneIds`,
          message: `references unknown zone "${zid}" — district zoneIds bind to this pack's zones[].id`,
        });
      }
      const previous = claimedZones.get(zid);
      if (previous !== undefined) {
        errors.push({
          path: `${path}.district(${districtId}).zoneIds`,
          message: `zone "${zid}" is already claimed by district "${previous}" — a zone belongs to one district; later claims silently win at intake`,
        });
      } else {
        claimedZones.set(zid, districtId);
      }
    }
  }

  // C3/P3 — hazardRefs bind to hazardDefinitions[].id the same way placements
  // bind to entities and anchors bind to zones: a dangling id is an ERROR, not
  // a DroppedField later. Shape (array-of-string) is validateZoneDefinition's
  // job; a non-array is skipped here so this pass never spreads a string.
  const hazardDefs = (Array.isArray(pack.hazardDefinitions) ? pack.hazardDefinitions : []).filter(isRecord) as NonNullable<ContentPack['hazardDefinitions']>;
  const hazardIds = collectUniqueIds(hazardDefs, 'hazard', (id) => `${path}.hazard(${id}).id`, errors);
  for (const zone of zones) {
    const refs = (zone as { hazardRefs?: unknown }).hazardRefs;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (typeof ref !== 'string') continue;
      if (!hazardIds.has(ref)) {
        errors.push({
          path: `${path}.zone(${zone.id}).hazardRefs`,
          message: `references unknown hazard "${ref}" — hazardRefs bind to this pack's hazardDefinitions[].id`,
        });
      }
    }
  }

  // --- C3/P1: placements + spawn sets must resolve ------------------------
  //
  // These are ERRORS, not advisories. The exporter already emits a warning for
  // an entity placed in a deleted zone ("N entity placement(s) reference zones
  // that do not exist and will be unreachable at runtime", export.ts) — but a
  // warning at export time is narration. Arriving at the runtime, the same fact
  // is refusable, and refusing it is the difference between "the NPC is missing"
  // and "the pack told you which NPC and which zone".
  const placements = (Array.isArray(pack.placements) ? pack.placements : []).filter(isRecord) as NonNullable<ContentPack['placements']>;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (typeof p.entityId === 'string' && !entityIds.has(p.entityId)) {
      errors.push({
        path: `${path}.placements[${i}].entityId`,
        message: `references unknown entity "${p.entityId}" — a placement names a blueprint in this pack's entities[]`,
      });
    }
    if (typeof p.zoneId === 'string' && !zoneIds.has(p.zoneId)) {
      errors.push({
        path: `${path}.placements[${i}](${p.entityId}).zoneId`,
        message: `references unknown zone "${p.zoneId}" — the entity would be placed nowhere, which is the exact gap placements exist to close`,
      });
    }
  }
  // One entity placed twice is an authoring error, not a stack of two NPCs: a
  // blueprint converts to ONE EntityState with ONE zoneId, so the second
  // placement would silently win. Same failure shape as the duplicate
  // entity/zone ids above (v2.5 PC-4), and caught for the same reason.
  const placedEntityIds = new Set<string>();
  for (let i = 0; i < placements.length; i++) {
    const id = placements[i].entityId;
    if (typeof id !== 'string') continue;
    if (placedEntityIds.has(id)) {
      errors.push({
        path: `${path}.placements[${i}].entityId`,
        message: `entity "${id}" is placed more than once — a blueprint becomes one EntityState with one zoneId, so the later placement would silently win. Use one placement per entity (spawn SETS are encounterAnchors).`,
      });
    }
    placedEntityIds.add(id);
  }

  const anchors = (Array.isArray(pack.encounterAnchors) ? pack.encounterAnchors : []).filter(isRecord) as NonNullable<ContentPack['encounterAnchors']>;
  collectUniqueIds(anchors, 'encounter anchor', (id, i) => `${path}.encounterAnchors[${i}].id`, errors);
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (typeof a.zoneId === 'string' && !zoneIds.has(a.zoneId)) {
      errors.push({
        path: `${path}.encounterAnchors[${i}](${a.id}).zoneId`,
        message: `references unknown zone "${a.zoneId}" — an anchor keys a per-zone spawn table, so an unknown zone makes it unreachable`,
      });
    }
    for (const enemyId of Array.isArray(a.enemyIds) ? a.enemyIds : []) {
      if (typeof enemyId === 'string' && !entityIds.has(enemyId)) {
        errors.push({
          path: `${path}.encounterAnchors[${i}](${a.id}).enemyIds`,
          message: `references unknown entity "${enemyId}" — spawn participants are cloned from this pack's entity templates`,
        });
      }
    }
  }

  // --- C3/P2: entry-gate operands that name pack content -------------------
  //
  // ⚠ FOUND BY MEASUREMENT, NOT BY DESIGN. The C0 coverage fixture authors the
  // gate `item:rope` on `zone-under-vault` while its item catalog calls the same
  // object `item-rope`. Nothing checked, so the pack shipped a door that can
  // NEVER open: `has-item` looks for an id no item in the pack has. Exactly the
  // phantom-module-id shape from C0 §5 — plausible, and dead — and exactly what
  // C0 §4 warned about in the other direction ("the forge can NAME verbs but
  // cannot DEFINE one; it emits dangling references into a slot it never fills").
  //
  // ADVISORY, not an error, and the distinction is load-bearing: an item id can
  // legitimately be granted by pack CODE, by another pack, or by a reward this
  // pack does not declare, so refusing would break valid content. But a gate
  // whose item matches nothing in a pack that HAS an item catalog is almost
  // always a typo, and saying so costs nothing.
  const itemRecords = (Array.isArray(pack.items) ? pack.items : []).filter(isRecord) as Array<{ id?: unknown }>;
  const itemIds = collectUniqueIds(itemRecords, 'item', (id) => `${path}.item(${id}).id`, errors);
  const memberIds = new Set<string>(entityIds);
  for (const zone of zones) {
    const gate = (zone as { entryGate?: { conditions?: unknown[] } }).entryGate;
    if (!gate || !Array.isArray(gate.conditions)) continue;
    for (const raw of gate.conditions) {
      if (!isRecord(raw)) continue;
      const c = raw as { type?: unknown; params?: Record<string, unknown> };
      const refId = typeof c.params?.id === 'string' ? c.params.id : undefined;
      if (refId === undefined) continue;

      if (c.type === 'has-item' && itemIds.size > 0 && !itemIds.has(refId)) {
        advisories.push({
          path: `${path}.zone(${zone.id}).entryGate`,
          message:
            `gate condition \`has-item\` names "${refId}", which matches no item in this pack ` +
            `(${[...itemIds].sort().join(', ')}). If nothing else grants that id, this gate can never open. ` +
            'Advisory rather than an error because an item may be granted by pack code or another pack.',
        });
      }
      if (c.type === 'party-member' && memberIds.size > 0 && !memberIds.has(refId)) {
        advisories.push({
          path: `${path}.zone(${zone.id}).entryGate`,
          message:
            `gate condition \`party-member\` names "${refId}", which is not an entity in this pack. ` +
            'If no other pack supplies that companion, this gate can never open.',
        });
      }
    }
  }

  // Dialogue speakers should reference known entities
  for (const dialogue of dialogues) {
    for (const speaker of dialogue.speakers ?? []) {
      if (!entityIds.has(speaker)) {
        errors.push({
          path: `${path}.dialogue(${dialogue.id}).speakers`,
          message: `speaker "${speaker}" not found in entities`,
        });
      }
    }
  }

  // Entity starting statuses, inventory — can't fully validate without status/item registries,
  // but we flag duplicates
  for (const entity of entities) {
    if (entity.inventory) {
      const seen = new Set<string>();
      for (const item of entity.inventory) {
        if (seen.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).inventory`,
            message: `duplicate item "${item}"`,
          });
        }
        seen.add(item);
      }
    }
  }

  // Quest stage self-references
  for (const quest of quests) {
    const stages = (Array.isArray(quest.stages) ? quest.stages : []).filter(isRecord) as NonNullable<QuestDefinition['stages']>;
    const stageIds = new Set(stages.map((s) => s.id).filter((id): id is string => typeof id === 'string'));
    for (const stage of stages) {
      if (stage.nextStage && !stageIds.has(stage.nextStage)) {
        errors.push({
          path: `${path}.quest(${quest.id}).stage(${stage.id}).nextStage`,
          message: `references unknown stage "${stage.nextStage}"`,
        });
      }
      if (stage.failStage && !stageIds.has(stage.failStage)) {
        errors.push({
          path: `${path}.quest(${quest.id}).stage(${stage.id}).failStage`,
          message: `references unknown stage "${stage.failStage}"`,
        });
      }
    }
  }

  // Zone neighbor symmetry — ADVISORY only (CA-01). A one-way passage (A→B but B↛A) is a
  // legitimate design choice (a ledge you drop off, a collapsing bridge), so it must not
  // force ok:false. We surface it as an actionable advisory instead.
  for (const zone of zones) {
    for (const neighbor of zone.neighbors ?? []) {
      const neighborZone = zones.find((z) => z.id === neighbor);
      if (neighborZone && !(neighborZone.neighbors ?? []).includes(zone.id)) {
        advisories.push({
          path: `${path}.zone(${zone.id}).neighbors`,
          message: `one-way passage: zone '${zone.id}' lists '${neighbor}' as neighbor but not vice versa — add '${zone.id}' to '${neighbor}'.neighbors if the passage should be two-way`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

/**
 * Optional registries that define the ids entities/abilities reference. Each is optional:
 * when a registry is absent AND the pack itself does not define that category, the
 * corresponding cross-check is skipped (warn-and-degrade — we only flag what we can verify).
 */
export type GameContentRegistries = {
  /** Known status ids (e.g. from a StatusDefinition pack) */
  statusIds?: string[];
  /** Known verb ids (e.g. from a ruleset's verbs) */
  verbIds?: string[];
  /** Known ability ids */
  abilityIds?: string[];
  /** Known item ids (inventory / equipment) */
  itemIds?: string[];
};

/**
 * Whole-game cross-validator (CA-05).
 *
 * Runs the structural `validateRefs` pass, then — when the relevant registry is available
 * (supplied explicitly OR derivable from the pack itself) — ties entity- and ability-level
 * references to the ids that actually define them:
 *
 * - entity.startingStatuses → status registry
 * - entity.inventory / entity.equipment → item registry
 * - archetype.startingInventory / background.startingInventory → item registry
 *   (chargen build-catalog kits)
 * - itemUseEffect.itemId → item registry (bespoke item-use-effect definitions)
 * - quest.rewards[type="item"].params.itemId → item registry
 * - ability.verb → verb registry
 * - ability `apply-status` effects (params.statusId) → status registry
 *
 * A misspelled status/verb/item id is reported as an ERROR here, instead of failing
 * silently at runtime. Categories with no available registry are skipped (not invented as
 * errors). One-way neighbor advisories from `validateRefs` flow through unchanged.
 *
 * F-703048a5: the item-registry check originally covered only entity inventory/equipment,
 * so the same "typo'd itemId ships silently" bug kept recurring on three other
 * itemId-shaped surfaces — e.g. a fantasy-starter archetype shipping
 * `startingInventory: ['torch']` with no matching catalog entry anywhere in that starter.
 * All four surfaces now share this one structural check and the same finding shape.
 */
export function validateGameContent(
  pack: ContentPack,
  registries: GameContentRegistries = {},
): RefsResult {
  const base = validateRefs(pack);
  // If the pack is not a usable object, validateRefs already produced the
  // structured 'pack' error — return before dereferencing pack.statuses/verbs/
  // abilities/entities below (e.g. `null.statuses` would raw-throw).
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) return base;
  const errors: ValidationError[] = [...base.errors];
  const advisories: ValidationError[] = [...base.advisories];
  const path = 'game';

  // Build effective registries: explicit input first, otherwise derive from the pack.
  // F-b6ded9eb: filter isRecord + optional-chain .id before any .map/.verb/.effects
  // walk so a null element cannot TypeError (validateRefs and pack.items already do).
  const statusReg = buildRegistry(registries.statusIds, idsFrom(pack.statuses));
  const verbReg = buildRegistry(registries.verbIds, idsFrom(pack.verbs));
  // Derive from pack.items[].id the same way statuses/verbs are derived, so a
  // JSON pack loaded with no explicit registries cannot stay green on a
  // dangling itemId. Absent items[] AND absent registries.itemIds → skip
  // (warn-and-degrade), matching the other categories.
  const itemReg = buildRegistry(registries.itemIds, idsFrom(pack.items));
  const abilityReg = buildRegistry(registries.abilityIds, idsFrom(pack.abilities));
  void abilityReg; // reserved for future entity→ability references; no current source field

  const entities = (Array.isArray(pack.entities) ? pack.entities : []).filter(isRecord) as NonNullable<ContentPack['entities']>;
  const abilities = (Array.isArray(pack.abilities) ? pack.abilities : []).filter(isRecord) as NonNullable<ContentPack['abilities']>;
  const statuses = (Array.isArray(pack.statuses) ? pack.statuses : []).filter(isRecord) as NonNullable<ContentPack['statuses']>;
  const quests = (Array.isArray(pack.quests) ? pack.quests : []).filter(isRecord) as NonNullable<ContentPack['quests']>;
  const archetypes = (Array.isArray(pack.archetypes) ? pack.archetypes : []).filter(isRecord) as NonNullable<ContentPack['archetypes']>;
  const backgrounds = (Array.isArray(pack.backgrounds) ? pack.backgrounds : []).filter(isRecord) as NonNullable<ContentPack['backgrounds']>;

  // entity.startingStatuses → status registry
  if (statusReg) {
    for (const entity of entities) {
      for (const statusId of entity.startingStatuses ?? []) {
        if (!statusReg.has(statusId)) {
          errors.push({
            path: `${path}.entity(${entity.id}).startingStatuses`,
            message: `references unknown status "${statusId}" — define it in the status registry or fix the id`,
          });
        }
      }
    }
  }

  // entity.inventory + entity.equipment → item registry
  if (itemReg) {
    for (const entity of entities) {
      for (const item of entity.inventory ?? []) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).inventory`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
      for (const [slot, item] of Object.entries(entity.equipment ?? {})) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).equipment.${slot}`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
    }

    // chargen archetype/background startingInventory kits → item registry (F-703048a5).
    // Same bug class as entity.inventory above: a typo'd id in a character-creation
    // build-catalog kit ships silently because nothing cross-checks it.
    for (const archetype of archetypes) {
      for (const item of archetype.startingInventory ?? []) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.archetype(${archetype.id}).startingInventory`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
    }
    for (const background of backgrounds) {
      for (const item of background.startingInventory ?? []) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.background(${background.id}).startingInventory`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
    }

    // buildCatalog kits — starters put archetypes/backgrounds here, not at the
    // top level. Same startingInventory shape, same silent-typo class.
    const catalogKits = kitsFromBuildCatalog(pack.buildCatalog);
    for (const kit of catalogKits) {
      for (const item of kit.startingInventory) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.${kit.kind}(${kit.id}).startingInventory`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
    }

    // bespoke item-use-effect itemId fields → item registry (F-703048a5). Runtime
    // item-use wiring (e.g. inventory-core's ItemEffect[]) keys effects by itemId
    // with no catalog cross-check today — same silent-typo risk as above.
    const itemUseEffects = Array.isArray(pack.itemUseEffects) ? pack.itemUseEffects : [];
    for (let i = 0; i < itemUseEffects.length; i++) {
      const effect = itemUseEffects[i];
      if (effect && typeof effect.itemId === 'string' && !itemReg.has(effect.itemId)) {
        errors.push({
          path: `${path}.itemUseEffect[${i}].itemId`,
          message: `references unknown item "${effect.itemId}" — define it in the item registry or fix the id`,
        });
      }
    }

    // quest.rewards item-type rewards → item registry (F-703048a5). Mirrors the
    // shape modules' quest-core.ts already expects at apply time
    // (reward.type === 'item' && typeof reward.params.itemId === 'string').
    for (const quest of quests) {
      const rewards = quest.rewards ?? [];
      for (let i = 0; i < rewards.length; i++) {
        const reward = rewards[i];
        const itemId = reward && reward.type === 'item' ? reward.params?.itemId : undefined;
        if (typeof itemId === 'string' && !itemReg.has(itemId)) {
          errors.push({
            path: `${path}.quest(${quest.id}).rewards[${i}].params.itemId`,
            message: `references unknown item "${itemId}" — define it in the item registry or fix the id`,
          });
        }
      }
    }
  }

  // ability.verb → verb registry; apply-status effects → status registry
  for (const ability of abilities) {
    if (verbReg && typeof ability.verb === 'string' && !verbReg.has(ability.verb)) {
      errors.push({
        path: `${path}.ability(${ability.id}).verb`,
        message: `references unknown verb "${ability.verb}" — declare it in the ruleset's verbs or fix the id`,
      });
    }

    if (statusReg) {
      const effects = Array.isArray(ability.effects) ? ability.effects : [];
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        if (effect && effect.type === 'apply-status') {
          const statusId = effect.params?.statusId;
          if (typeof statusId === 'string' && !statusReg.has(statusId)) {
            errors.push({
              path: `${path}.ability(${ability.id}).effects[${i}].params.statusId`,
              message: `apply-status references unknown status "${statusId}" — define it in the status registry or fix the id`,
            });
          }
          // Timed StatusDefinition.duration is unread at apply time — the
          // effect's params.duration is what ability-effects actually uses.
          // Eleven packs duplicate it on the effect; a missing number against
          // a ticks-duration definition applies as permanent.
          if (typeof statusId === 'string' && effect.params?.duration === undefined) {
            const def = statuses.find((s) => s && s.id === statusId);
            if (def?.duration?.type === 'ticks') {
              errors.push({
                path: `${path}.ability(${ability.id}).effects[${i}].params.duration`,
                message:
                  `apply-status on timed status "${statusId}" is missing params.duration ` +
                  `(definition is ${def.duration.value ?? '?'} ticks) — without it the status applies as permanent`,
              });
            }
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

/**
 * Returns a Set of ids when at least one source is present, otherwise `null` to signal
 * "no registry available — skip this category" (warn-and-degrade).
 */
function buildRegistry(
  explicit: string[] | undefined,
  fromPack: string[] | undefined,
): Set<string> | null {
  if (explicit === undefined && fromPack === undefined) return null;
  return new Set([...(explicit ?? []), ...(fromPack ?? [])]);
}

function isKitRecord(v: unknown): v is { id: string; startingInventory?: string[] } {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (v as { id?: unknown }).id === 'string';
}

/** Chargen kits nested under buildCatalog — same shape as top-level archetypes/backgrounds. */
function kitsFromBuildCatalog(
  catalog: ContentPack['buildCatalog'],
): Array<{ kind: 'archetype' | 'background'; id: string; startingInventory: string[] }> {
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) return [];
  const out: Array<{ kind: 'archetype' | 'background'; id: string; startingInventory: string[] }> = [];
  const rec = catalog as { archetypes?: unknown; backgrounds?: unknown };
  if (Array.isArray(rec.archetypes)) {
    for (const a of rec.archetypes) {
      if (!isKitRecord(a) || !Array.isArray(a.startingInventory)) continue;
      out.push({ kind: 'archetype', id: a.id, startingInventory: a.startingInventory.filter((id): id is string => typeof id === 'string') });
    }
  }
  if (Array.isArray(rec.backgrounds)) {
    for (const b of rec.backgrounds) {
      if (!isKitRecord(b) || !Array.isArray(b.startingInventory)) continue;
      out.push({ kind: 'background', id: b.id, startingInventory: b.startingInventory.filter((id): id is string => typeof id === 'string') });
    }
  }
  return out;
}
