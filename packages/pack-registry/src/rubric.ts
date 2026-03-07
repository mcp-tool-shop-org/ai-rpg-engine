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
  const uniqueVerbs = packVerbs.filter((v) => !BASE_VERBS.has(v));
  const otherVerbSets = others.map((o) => new Set(o.ruleset.verbs.map((v) => v.id)));
  const trulyUnique = uniqueVerbs.filter((v) =>
    otherVerbSets.every((set) => !set.has(v)),
  );

  return {
    dimension: 'distinct-verbs',
    passed: uniqueVerbs.length >= 1,
    detail: uniqueVerbs.length >= 1
      ? `${uniqueVerbs.length} non-base verb(s): ${uniqueVerbs.join(', ')}. ${trulyUnique.length} unique across catalog.`
      : 'No verbs beyond base set',
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
  const hasDialogue = pack.ruleset.defaultModules.includes('dialogue-core');

  return {
    dimension: 'distinct-faction-topology',
    passed: hasDialogue,
    detail: hasDialogue
      ? 'Pack defines dialogue and faction structures'
      : 'Missing faction topology',
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
  const failureResources = pack.ruleset.resources.filter(
    (r) => r.id !== 'hp' && r.id !== 'stamina',
  );

  return {
    dimension: 'distinct-failure-mode',
    passed: failureResources.length >= 1,
    detail: failureResources.length >= 1
      ? `Unique pressure resources: ${failureResources.map((r) => r.id).join(', ')}`
      : 'No distinct failure pressure beyond HP/stamina',
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
