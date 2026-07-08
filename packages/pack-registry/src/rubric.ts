// Pack quality rubric — validates a pack against the full catalog

import type { PackEntry, RubricCheck, RubricResult } from './types.js';

const BASE_VERBS = new Set(['move', 'inspect', 'attack', 'use', 'speak', 'choose']);

export function validatePackRubric(
  pack: PackEntry,
  allPacks: PackEntry[],
): RubricResult {
  const others = allPacks.filter((p) => p.meta.id !== pack.meta.id);
  const checks: RubricCheck[] = [];

  checks.push(checkDistinctVerbs(pack, others));
  checks.push(checkDistinctResourcePressure(pack));
  checks.push(checkDistinctFactionTopology(pack));
  checks.push(checkDistinctPresentationRule(pack, others));
  checks.push(checkDistinctAudioPalette(pack));
  checks.push(checkDistinctFailureMode(pack, others));
  checks.push(checkDistinctNarrativeFantasy(pack, others));

  const score = checks.filter((c) => c.passed).length;
  return {
    packId: pack.meta.id,
    ok: score >= 5,
    checks,
    score,
  };
}

function checkDistinctVerbs(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const packVerbs = pack.ruleset.verbs.map((v) => v.id);
  const nonBaseVerbs = packVerbs.filter((v) => !BASE_VERBS.has(v));
  const otherVerbSets = others.map((o) => new Set(o.ruleset.verbs.map((v) => v.id)));
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
  const nonHp = pack.ruleset.resources.filter((r) => r.id !== 'hp').map((r) => r.id);

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
  const packTones = new Set(pack.meta.tones);
  const isDuplicate = others.some((o) => {
    const oTones = new Set(o.meta.tones);
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
  const hasAudio = pack.meta.tags.some((t) => t.includes('audio')) ||
    pack.manifest.audioProfile !== undefined;

  return {
    dimension: 'distinct-audio-palette',
    passed: true,
    detail: hasAudio
      ? 'Audio profile defined'
      : 'No audio profile (soft check — does not block)',
  };
}

function checkDistinctFailureMode(pack: PackEntry, others: PackEntry[]): RubricCheck {
  const failureIds = pack.ruleset.resources
    .filter((r) => r.id !== 'hp' && r.id !== 'stamina')
    .map((r) => r.id);
  // "Distinct" means distinct across the catalog: at least one failure-pressure
  // resource no other pack declares. A shared pressure resource is a shared
  // failure mode, not a distinct one.
  const otherFailureSets = others.map(
    (o) => new Set(
      o.ruleset.resources
        .filter((r) => r.id !== 'hp' && r.id !== 'stamina')
        .map((r) => r.id),
    ),
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
  const genreKey = [...pack.meta.genres].sort().join('+');
  const isDuplicate = others.some(
    (o) => [...o.meta.genres].sort().join('+') === genreKey,
  );

  return {
    dimension: 'distinct-narrative-fantasy',
    passed: !isDuplicate,
    detail: isDuplicate
      ? `Genre combination "${genreKey}" duplicates another pack`
      : `Genre combination: ${genreKey}`,
  };
}
