// Pack quality rubric — validates a pack against the full catalog

import type { PackEntry, RubricCheck, RubricResult } from './types.js';

const BASE_VERBS = new Set(['move', 'inspect', 'attack', 'use', 'speak', 'choose']);

function recordIds(raw: unknown): { ids: string[]; missing: boolean } {
  if (!Array.isArray(raw)) return { ids: [], missing: true };
  const ids: string[] = [];
  for (const item of raw) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      ids.push((item as { id: string }).id);
    }
  }
  return { ids, missing: false };
}

function stringArray(raw: unknown): { values: string[]; missing: boolean } {
  if (!Array.isArray(raw)) return { values: [], missing: true };
  return { values: raw.filter((v): v is string => typeof v === 'string'), missing: false };
}

export function validatePackRubric(
  pack: PackEntry,
  // Defaults to [pack] so a one-arg call cannot throw on allPacks.filter.
  allPacks: PackEntry[] = [pack],
): RubricResult {
  if (pack === null || typeof pack !== 'object') {
    return { packId: '', ok: false, checks: [], score: 0 };
  }
  const catalog = Array.isArray(allPacks) ? allPacks : [pack];
  const packId = typeof pack.meta?.id === 'string' ? pack.meta.id : '';
  const others = catalog.filter((p) => p?.meta?.id !== packId);
  const checks: RubricCheck[] = [];

  checks.push(checkDistinctVerbs(pack, others));
  checks.push(checkDistinctResourcePressure(pack));
  checks.push(checkDistinctFactionTopology(pack));
  checks.push(checkDistinctPresentationRule(pack, others));
  checks.push(checkDistinctAudioPalette(pack));
  checks.push(checkDistinctFailureMode(pack, others));
  checks.push(checkDistinctNarrativeFantasy(pack, others));

  const score = checks.filter((c) => c.passed).length;
  const verbs = recordIds(pack.ruleset?.verbs);
  const resources = recordIds(pack.ruleset?.resources);
  const structuralGap = verbs.missing || resources.missing;
  return {
    packId,
    ok: score >= 5 && !structuralGap,
    checks,
    score,
  };
}

function checkDistinctVerbs(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const own = recordIds(pack.ruleset?.verbs);
  if (own.missing) {
    return {
      dimension: 'distinct-verbs',
      passed: false,
      detail:
        'pack.ruleset.verbs is missing or not an array — set ruleset.verbs to an array of { id } records (null elements are skipped). A missing verbs list cannot prove distinct-verbs.',
    };
  }
  const packVerbs = own.ids;
  const nonBaseVerbs = packVerbs.filter((v) => !BASE_VERBS.has(v));
  const otherVerbSets = others.map((o) => new Set(recordIds(o?.ruleset?.verbs).ids));
  // "Distinct" means distinct across the catalog: at least one non-base verb
  // that no other pack declares. Existence alone is not distinctness.
  const trulyUnique = nonBaseVerbs.filter((v) =>
    otherVerbSets.every((set) => !set.has(v)),
  );

  let detail: string;
  if (trulyUnique.length >= 1) {
    detail = `${nonBaseVerbs.length} non-base verb(s): ${nonBaseVerbs.join(', ')}. ` +
      `${trulyUnique.length} unique across catalog: ${trulyUnique.join(', ')}`;
  } else if (nonBaseVerbs.length >= 1) {
    detail = `${nonBaseVerbs.length} non-base verb(s) (${nonBaseVerbs.join(', ')}) but all are shared with other packs`;
  } else {
    detail = 'No verbs beyond base set';
  }

  return {
    dimension: 'distinct-verbs',
    passed: trulyUnique.length >= 1,
    detail,
  };
}

function checkDistinctResourcePressure(pack: PackEntry): RubricCheck {
  const own = recordIds(pack.ruleset?.resources);
  if (own.missing) {
    return {
      dimension: 'distinct-resource-pressure',
      passed: false,
      detail:
        'pack.ruleset.resources is missing or not an array — set ruleset.resources to an array of { id } records (null elements are skipped).',
    };
  }
  const nonHp = own.ids.filter((id) => id !== 'hp');

  return {
    dimension: 'distinct-resource-pressure',
    passed: nonHp.length >= 1,
    detail: nonHp.length >= 1
      ? `Non-HP resources: ${nonHp.join(', ')}`
      : 'Only HP resource defined',
  };
}

function checkDistinctFactionTopology(pack: PackEntry): RubricCheck {
  // Inspect the pack's actual district topology: the dimension passes iff at
  // least one declared district is controlled by a faction. (The old check
  // inspected defaultModules for 'dialogue-core' — nothing to do with factions
  // — and printed a claim it never verified.)
  const districts = pack.districts ?? [];
  const controlled = districts.filter((d) => d.controllingFaction !== undefined);
  const factions = [...new Set(controlled.map((d) => d.controllingFaction as string))];
  const passed = controlled.length >= 1;

  let detail: string;
  if (passed) {
    detail = `${districts.length} district(s), ${controlled.length} faction-controlled ` +
      `(factions: ${factions.join(', ')})`;
  } else if (districts.length >= 1) {
    detail = `${districts.length} district(s) declared but none has a controllingFaction`;
  } else {
    detail = 'No district topology declared';
  }

  return {
    dimension: 'distinct-faction-topology',
    passed,
    detail,
  };
}

function checkDistinctPresentationRule(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const own = stringArray(pack.meta?.tones);
  if (own.missing) {
    return {
      dimension: 'distinct-presentation-rule',
      passed: false,
      detail:
        "pack.meta.tones is missing or not an array — set meta.tones to an array of tone strings, e.g. ['dark'].",
    };
  }
  const packTones = new Set(own.values);
  const isDuplicate = others.some((o) => {
    const oTones = new Set(stringArray(o?.meta?.tones).values);
    return packTones.size === oTones.size && [...packTones].every((t) => oTones.has(t));
  });

  return {
    dimension: 'distinct-presentation-rule',
    passed: !isDuplicate,
    detail: isDuplicate
      ? 'Tone set is identical to another pack'
      : `Tones: ${[...packTones].join(', ')}`,
  };
}

function checkDistinctAudioPalette(pack: PackEntry): RubricCheck {
  const tags = Array.isArray(pack.meta?.tags) ? pack.meta.tags : [];
  const hasAudio = tags.some((t) => typeof t === 'string' && t.includes('audio')) ||
    pack.manifest?.audioProfile !== undefined;

  return {
    dimension: 'distinct-audio-palette',
    passed: true,
    detail: hasAudio
      ? 'Audio profile defined'
      : 'No audio profile (soft check — does not block)',
  };
}

function checkDistinctFailureMode(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const own = recordIds(pack.ruleset?.resources);
  if (own.missing) {
    return {
      dimension: 'distinct-failure-mode',
      passed: false,
      detail:
        'pack.ruleset.resources is missing or not an array — set ruleset.resources to an array of { id } records (null elements are skipped).',
    };
  }
  const failureIds = own.ids.filter((id) => id !== 'hp' && id !== 'stamina');
  // "Distinct" means distinct across the catalog: at least one failure-pressure
  // resource no other pack declares. A shared pressure resource is a shared
  // failure mode, not a distinct one.
  const otherFailureSets = others.map(
    (o) => new Set(recordIds(o?.ruleset?.resources).ids.filter((id) => id !== 'hp' && id !== 'stamina')),
  );
  const trulyUnique = failureIds.filter((id) =>
    otherFailureSets.every((set) => !set.has(id)),
  );

  let detail: string;
  if (trulyUnique.length >= 1) {
    detail = `Unique pressure resource(s) across catalog: ${trulyUnique.join(', ')}`;
  } else if (failureIds.length >= 1) {
    detail = `Pressure resource(s) (${failureIds.join(', ')}) all shared with other packs`;
  } else {
    detail = 'No distinct failure pressure beyond HP/stamina';
  }

  return {
    dimension: 'distinct-failure-mode',
    passed: trulyUnique.length >= 1,
    detail,
  };
}

function checkDistinctNarrativeFantasy(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const own = stringArray(pack.meta?.genres);
  if (own.missing) {
    return {
      dimension: 'distinct-narrative-fantasy',
      passed: false,
      detail:
        "pack.meta.genres is missing or not an array — set meta.genres to an array of genre strings, e.g. ['fantasy'].",
    };
  }
  const genreKey = [...own.values].sort().join('+');
  const isDuplicate = others.some(
    (o) => [...stringArray(o?.meta?.genres).values].sort().join('+') === genreKey,
  );

  return {
    dimension: 'distinct-narrative-fantasy',
    passed: !isDuplicate,
    detail: isDuplicate
      ? `Genre combination "${genreKey}" duplicates another pack`
      : `Genre combination: ${genreKey}`,
  };
}
