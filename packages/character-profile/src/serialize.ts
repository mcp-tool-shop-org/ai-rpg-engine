// Profile serialization — save/load to JSON

import type { ItemChronicleEvent } from '@ai-rpg-engine/equipment';
import type { CharacterProfile } from './types.js';
import { PROFILE_VERSION } from './types.js';

// All chronicle event kinds, typed exhaustively against equipment's
// ItemChronicleEvent (F-08afa14a): `Record<ItemChronicleEvent, true>` fails to
// compile if equipment ever adds, renames, or removes an event and this list
// drifts — the deserializer can never silently reject a newly-legal event or
// accept a removed one. (Type-only import: erased at runtime.)
const ITEM_CHRONICLE_EVENT_FLAGS: Record<ItemChronicleEvent, true> = {
  'acquired': true,
  'lost': true,
  'used-in-kill': true,
  'recognized': true,
  'transformed': true,
  'cursed': true,
  'blessed': true,
};
const ITEM_CHRONICLE_EVENTS: ReadonlySet<string> = new Set(Object.keys(ITEM_CHRONICLE_EVENT_FLAGS));

/** Serialize a profile to JSON string. */
export function serializeProfile(profile: CharacterProfile): string {
  return JSON.stringify(profile, null, 2);
}

/** Deserialize a profile from JSON string. Returns the profile or errors. */
export function deserializeProfile(json: string): {
  profile: CharacterProfile | null;
  errors: string[];
} {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { profile: null, errors: ['Invalid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { profile: null, errors: ['Expected an object'] };
  }

  const obj = parsed as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'packId', 'createdAt', 'updatedAt'] as const) {
    if (typeof obj[field] !== 'string') {
      errors.push(`Missing or invalid field: ${field}`);
    }
  }

  // Version check
  if (typeof obj['version'] !== 'number') {
    errors.push('Missing or invalid version');
  } else if (obj['version'] > PROFILE_VERSION) {
    errors.push(`Profile version ${obj['version']} is newer than supported version ${PROFILE_VERSION}`);
  }

  // Required objects. Each check also excludes arrays (F-08afa14a):
  // `typeof [] === 'object'` in JS, so without the Array.isArray guard a
  // profile where build/stats/resources/loadout/progression is an array was
  // accepted as fully valid. A `progression` array in particular silently
  // produces NaN-poisoned XP/level once grantXp/computeLevel read
  // profile.progression.xp/.level off the array (`undefined + amount` = NaN)
  // — the same "corrupt input loads clean, then produces a sticky NaN with no
  // signal" failure class the numeric progression-subfield checks below
  // (CP-03) exist to eliminate, just previously unguarded for the array case.
  if (typeof obj['build'] !== 'object' || obj['build'] === null || Array.isArray(obj['build'])) {
    errors.push('Missing or invalid build');
  }
  if (typeof obj['stats'] !== 'object' || obj['stats'] === null || Array.isArray(obj['stats'])) {
    errors.push('Missing or invalid stats');
  }
  if (typeof obj['resources'] !== 'object' || obj['resources'] === null || Array.isArray(obj['resources'])) {
    errors.push('Missing or invalid resources');
  }
  if (typeof obj['loadout'] !== 'object' || obj['loadout'] === null || Array.isArray(obj['loadout'])) {
    errors.push('Missing or invalid loadout');
  }
  if (
    typeof obj['progression'] !== 'object' ||
    obj['progression'] === null ||
    Array.isArray(obj['progression'])
  ) {
    errors.push('Missing or invalid progression');
  }

  // itemChronicle (F-08afa14a) is optional on legacy (v1) saves — migrated to
  // {} below when absent — but had NO shape check at all when present. A
  // wrong-typed value (array, string, or a record whose per-item values
  // aren't arrays) reached packages/equipment consumers (evaluateRelicGrowth,
  // computeItemNotoriety) unchecked, where a non-array entry can raw-throw
  // deep inside relic-growth/provenance logic instead of failing cleanly at
  // this load boundary like every other field in this function.
  if (obj['itemChronicle'] !== undefined) {
    if (
      typeof obj['itemChronicle'] !== 'object' ||
      obj['itemChronicle'] === null ||
      Array.isArray(obj['itemChronicle'])
    ) {
      errors.push('Missing or invalid itemChronicle');
    } else {
      const chronicle = obj['itemChronicle'] as Record<string, unknown>;
      for (const key of Object.keys(chronicle)) {
        const entries = chronicle[key];
        if (!Array.isArray(entries)) {
          errors.push(`Missing or invalid itemChronicle.${key}`);
          continue;
        }
        // Element-level shape (F-08afa14a re-report): a valid ARRAY whose
        // elements are malformed sailed through — `[null]` passed with
        // errors: [] and then evaluateRelicGrowth raw-threw reading `.event`;
        // an object entry with a missing/wrong-typed `tick` never crashed at
        // all, it just made getAge() return NaN so every age milestone
        // silently failed forever. Validate each entry with the same
        // element-level rigor character-creation applies to traitIds/
        // statAllocations, naming the exact element and field.
        for (let i = 0; i < entries.length; i++) {
          const entry: unknown = entries[i];
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            errors.push(`Missing or invalid itemChronicle.${key}[${i}]`);
            continue;
          }
          const e = entry as Record<string, unknown>;
          if (typeof e['event'] !== 'string' || !ITEM_CHRONICLE_EVENTS.has(e['event'])) {
            errors.push(`Missing or invalid itemChronicle.${key}[${i}].event`);
          }
          if (typeof e['tick'] !== 'number' || !Number.isFinite(e['tick'])) {
            errors.push(`Missing or invalid itemChronicle.${key}[${i}].tick`);
          }
          if (typeof e['detail'] !== 'string' || e['detail'].length === 0) {
            errors.push(`Missing or invalid itemChronicle.${key}[${i}].detail`);
          }
          if (e['zoneId'] !== undefined && typeof e['zoneId'] !== 'string') {
            errors.push(`Missing or invalid itemChronicle.${key}[${i}].zoneId`);
          }
        }
      }
    }
  }

  // Required arrays
  if (!Array.isArray(obj['tags'])) errors.push('Missing or invalid tags');
  if (!Array.isArray(obj['injuries'])) errors.push('Missing or invalid injuries');
  if (!Array.isArray(obj['milestones'])) errors.push('Missing or invalid milestones');
  if (!Array.isArray(obj['reputation'])) errors.push('Missing or invalid reputation');

  // Required scalar / plain-object fields (CP-04). A save missing these
  // deserialized as a "valid" but corrupt profile before this check existed.
  if (typeof obj['totalTurns'] !== 'number' || Number.isNaN(obj['totalTurns'])) {
    errors.push('Missing or invalid totalTurns');
  }
  if (
    typeof obj['custom'] !== 'object' ||
    obj['custom'] === null ||
    Array.isArray(obj['custom'])
  ) {
    errors.push('Missing or invalid custom');
  }

  // Progression substructure (CP-03). The old code only checked that
  // `progression` was a non-null object and never inspected its numeric fields
  // or traitEvolutions — a corrupt progression slipped through as "valid".
  let needsTraitEvolutionRepair = false;
  if (typeof obj['progression'] === 'object' && obj['progression'] !== null && !Array.isArray(obj['progression'])) {
    const prog = obj['progression'] as Record<string, unknown>;
    for (const numField of ['xp', 'level', 'archetypeRank', 'disciplineRank'] as const) {
      if (typeof prog[numField] !== 'number' || Number.isNaN(prog[numField])) {
        errors.push(`Missing or invalid progression.${numField}`);
      }
    }
    if (prog['traitEvolutions'] === undefined) {
      // Legacy (v1) saves predate traitEvolutions — repair to [] rather than reject.
      needsTraitEvolutionRepair = true;
    } else if (!Array.isArray(prog['traitEvolutions'])) {
      errors.push('Missing or invalid progression.traitEvolutions');
    }
  }
  // (If progression itself was not an object, the earlier check already errored.)

  if (errors.length > 0) {
    return { profile: null, errors };
  }

  // Migrate v1 profiles: add itemChronicle and progression.traitEvolutions if missing.
  const base = parsed as CharacterProfile;
  const profile: CharacterProfile = {
    ...base,
    itemChronicle: base.itemChronicle ?? {},
    progression: needsTraitEvolutionRepair
      ? { ...base.progression, traitEvolutions: [] }
      : base.progression,
    version: Math.max(base.version, PROFILE_VERSION),
  };

  return { profile, errors: [] };
}

/** Validate a serialized profile string. */
export function validateSerializedProfile(json: string): { ok: boolean; errors: string[] } {
  const { errors } = deserializeProfile(json);
  return { ok: errors.length === 0, errors };
}
