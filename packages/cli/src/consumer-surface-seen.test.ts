// consumer-surface-seen.test.ts — the v3.10 consumer-surface SEEN proof,
// permanent CI home.
//
// v3.9's Phase-9 proof established that the documented recipe BOOTS
// (json-boot-recipe.test.ts). The v3.10 cycle's claim is bigger — "the world
// reaches the player" — so this proof plays a real session through the REAL
// engine and the REAL renderer and asserts the consumer surfaces are IN the
// visible frames, and byte-absent when their producers are quiet:
//
//   beat 1  quiet baseline — no Party line, no mood parens, no sting, no music
//   beat 2  zone entry     — moodHint parenthetical in the log line; the tone
//                            bridge resolves dread-family music + drone bed
//   beat 3  dialogue       — spoken line + speaker render; plan.speaker owns
//                            the line ONCE (asides is fragments-only, wave-4
//                            F-f1c74adc)
//   beat 4  recruit        — the always-on Party line appears, named
//   beat 4.5 dialogue+party — partyPresence attaches AND renders; asides
//                            carries the fragment; SpeakerCue.emotion contract
//   beat 5  combat victory — combat.encounter.cleared fires EXACTLY once,
//                            outcome victory, music_victory_sting scheduled,
//                            tone triumph
//   beat 6  NO_COLOR parity — ANSI-stripped colored frame equals color:false
//
// Ported from the coordinator's working reference script (same pack, same
// beats, same assertions): .swarm/phase9-seen-proof.mjs (run
// swarm-1788172562-0d00). That script stays a manual repro; this file is the
// permanent, CI-run home. Lives in packages/cli because the proof needs the
// full consumer stack (core + content-schema + modules + terminal-ui), which
// only the CLI legally depends on together.

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import {
  loadContent,
  extractSessionContent,
  applyContentPack,
  type ContentPack,
} from '@ai-rpg-engine/content-schema';
import {
  traversalCore,
  statusCore,
  inventoryCore,
  createEnvironmentCore,
  createDistrictCore,
  createEncounterSpawn,
  createProgressionCore,
  createWorldTick,
  createStandardChannels,
  registerStatusDefinitions,
  createDialogueCore,
  createCompanionCore,
  buildCombatStack,
  formatPartyStatusLine,
  getPartyState,
  modifyDistrictMetric,
} from '@ai-rpg-engine/modules';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';
import { renderFullScreen, renderDialogue, TurnPresenter } from '@ai-rpg-engine/terminal-ui';
import type { PresentedTurn } from '@ai-rpg-engine/terminal-ui';
import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ---------------------------------------------------------------- the pack
const pack = {
  meta: { id: 'gallows-row-proof', name: 'Gallows Row Proof' },
  manifest: {
    id: 'gallows-row-proof', title: 'Gallows Row Proof', version: '0.1.0',
    engineVersion: '0.1.0', ruleset: 'gallows-rules', modules: [], contentPacks: [],
  },
  ruleset: {
    id: 'gallows-rules', name: 'Gallows Rules', version: '0.1.0',
    stats: [
      { id: 'vigor', name: 'Vigor', default: 5 },
      { id: 'will', name: 'Will', default: 5 },
      { id: 'instinct', name: 'Instinct', default: 5 },
    ],
    resources: [
      { id: 'hp', name: 'HP', default: 12, max: 12 },
      { id: 'stamina', name: 'Stamina', default: 10, max: 10 },
    ],
    verbs: [
      { id: 'look', name: 'Look' },
      { id: 'move', name: 'Move' },
      { id: 'speak', name: 'Speak' },
      { id: 'attack', name: 'Attack' },
      { id: 'recruit', name: 'Recruit' },
    ],
    formulas: [], defaultModules: [], progressionModels: [],
  },
  zones: [
    { id: 'chapel-yard', name: 'Chapel Yard', tags: ['exterior'], neighbors: ['gallows-row'] },
    { id: 'gallows-row', name: 'Gallows Row', tags: ['exterior', 'dangerous'], neighbors: ['chapel-yard'] },
  ],
  entities: [
    {
      id: 'hero', type: 'player', name: 'The Gravewalker', tags: ['player'],
      baseStats: { vigor: 6, will: 4, instinct: 4 },
      baseResources: { hp: 12, maxHp: 12, stamina: 10, maxStamina: 10 }, inventory: [],
    },
    {
      id: 'sel', type: 'npc', name: 'Warden Sel', tags: ['npc', 'recruitable'], faction: 'wardens',
      baseStats: { vigor: 4, will: 5, instinct: 3 },
      baseResources: { hp: 8, maxHp: 8, stamina: 10, maxStamina: 10 }, inventory: [],
    },
    {
      id: 'ghast', type: 'npc', name: 'Rope Ghast', tags: ['enemy', 'hostile'], faction: 'gallows',
      baseStats: { vigor: 3, will: 2, instinct: 2 },
      baseResources: { hp: 4, maxHp: 4, stamina: 10, maxStamina: 10 }, inventory: [],
    },
  ],
  placements: [
    { entityId: 'hero', zoneId: 'chapel-yard' },
    { entityId: 'sel', zoneId: 'chapel-yard' },
    { entityId: 'ghast', zoneId: 'gallows-row' },
  ],
  factions: {
    gallows: { id: 'gallows', name: 'The Gallows Crowd', reputation: -60, disposition: 'hostile' },
    wardens: { id: 'wardens', name: 'The Wardens', reputation: 55, disposition: 'friendly' },
  },
} as unknown as ContentPack;

const dialogue = {
  id: 'sel-greeting',
  speakers: ['sel'],
  entryNodeId: 'entry',
  nodes: {
    entry: {
      id: 'entry',
      speaker: 'Warden Sel',
      text: 'Keep your voice down. The Row has ears.',
      choices: [{ id: 'leave', text: 'Understood.', nextNodeId: 'out' }],
    },
    out: { id: 'out', speaker: 'Warden Sel', text: 'Go.', choices: [] },
  },
} as unknown as DialogueDefinition;

const districts = [
  { id: 'gallows-district', name: 'Gallows Grounds', tags: ['grim'], zoneIds: ['gallows-row'] },
];

const HINT_KEYS = [
  'dialogueBias', 'dialogueHint', 'pressureHint',
  'textureHint', 'partyPresence', 'opportunityHint',
] as const;

type Played = {
  frames: { baseline: string; zoneEntry: string; recruit: string };
  dialogueFrames: { first: string | null; withParty: string | null };
  plans: {
    baseline: PresentedTurn; zoneEntry: PresentedTurn;
    dialogue: PresentedTurn; dialogueWithParty: PresentedTurn;
    victory?: PresentedTurn;
  };
  events: {
    zoneEntered?: ResolvedEvent; firstNode?: ResolvedEvent; partyNode?: ResolvedEvent;
    cleared: ResolvedEvent[]; heroFell: boolean;
  };
  attachedFirst: string[];
  attachedWithParty: string[];
  parity: { colored: string; plain: string };
  world: WorldState;
};

function playSession(): Played {
  const load = loadContent(pack);
  expect(load.ok).toBe(true);
  const loaded = (load.pack ?? pack) as ContentPack;
  const session = extractSessionContent(loaded);
  registerStatusDefinitions((session.statuses ?? []) as never);

  const combat = buildCombatStack({
    statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    playerId: 'hero',
  });

  const engine = new Engine({
    manifest: session.manifest as never,
    ruleset: session.ruleset as never,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      inventoryCore,
      createEnvironmentCore(),
      createDistrictCore({ districts: districts as never }),
      createEncounterSpawn({ gameId: 'gallows-row-proof', encounters: [], entityTemplates: [], zoneTables: {} }),
      createProgressionCore({ trees: [] }),
      createDialogueCore([dialogue]),
      createCompanionCore(),
      createWorldTick(),
    ],
  });
  const applied = applyContentPack(engine, loaded, { channels: createStandardChannels() });
  expect(applied.ok).toBe(true);

  const presenter = new TurnPresenter();
  const partyLine = () => {
    const party = getPartyState(engine.world);
    const names: Record<string, string> = {};
    for (const c of party.companions) {
      const name = engine.world.entities[c.npcId]?.name;
      if (name) names[c.npcId] = name;
    }
    return formatPartyStatusLine(party, names, engine.world);
  };
  const frame = (events: ResolvedEvent[]) =>
    renderFullScreen(engine.world, events, { color: false, partyLine: partyLine() });
  const turn = (verb: string, opts?: { targetIds?: string[] }) => {
    const before = engine.world.eventLog.length;
    engine.submitAction(verb, opts);
    return engine.world.eventLog.slice(before);
  };

  // Beat 1 — quiet baseline
  const lookEvents = turn('look');
  const baselineFrame = frame(lookEvents);
  const baselinePlan = presenter.present(engine.world, lookEvents);

  // Beat 2 — zone entry into a dread-family district
  modifyDistrictMetric(engine.world, 'gallows-district', 'alertPressure', 95);
  modifyDistrictMetric(engine.world, 'gallows-district', 'morale', -45);
  modifyDistrictMetric(engine.world, 'gallows-district', 'stability', -4);
  const moveEvents = turn('move', { targetIds: ['gallows-row'] });
  const zoneEntered = moveEvents.find((e) => e.type === 'world.zone.entered');
  const zoneFrame = frame(moveEvents);
  const zonePlan = presenter.present(engine.world, moveEvents);

  // Beat 3 — dialogue before any party exists
  turn('move', { targetIds: ['chapel-yard'] });
  const speakEvents = turn('speak', { targetIds: ['sel'] });
  const firstNode = speakEvents.find((e) => e.type === 'dialogue.node.entered');
  const firstDialogueFrame = renderDialogue(engine.world, { color: false });
  const dialoguePlan = presenter.present(engine.world, speakEvents);
  const attachedFirst = HINT_KEYS.filter((k) => typeof firstNode?.payload?.[k] === 'string');

  // Beat 4 — recruit
  const recruitEvents = turn('recruit', { targetIds: ['sel'] });
  const recruitFrame = frame(recruitEvents);

  // Beat 4.5 — dialogue again, party now present
  const speak2Events = turn('speak', { targetIds: ['sel'] });
  const partyNode = speak2Events.find((e) => e.type === 'dialogue.node.entered');
  const partyDialogueFrame = renderDialogue(engine.world, { color: false });
  const dialogueWithPartyPlan = presenter.present(engine.world, speak2Events);
  const attachedWithParty = HINT_KEYS.filter((k) => typeof partyNode?.payload?.[k] === 'string');
  turn('speak', { targetIds: ['sel'] });
  engine.submitAction('look');

  // Beat 5 — combat victory
  turn('move', { targetIds: ['gallows-row'] });
  let victoryPlan: PresentedTurn | undefined;
  const cleared: ResolvedEvent[] = [];
  let heroFell = false;
  for (let i = 0; i < 12; i++) {
    const evts = turn('attack', { targetIds: ['ghast'] });
    const c = evts.filter((e) => e.type === 'combat.encounter.cleared');
    if (c.length > 0) {
      cleared.push(...c);
      victoryPlan = presenter.present(engine.world, evts);
      break;
    }
    if (evts.some((e) => e.type === 'combat.entity.defeated' && e.payload?.entityId === 'hero')) {
      heroFell = true;
      break;
    }
  }

  // Beat 6 — NO_COLOR parity on the final state
  const tail = engine.world.eventLog.slice(-8);
  const colored = renderFullScreen(engine.world, tail, { color: true, partyLine: partyLine() });
  const plain = renderFullScreen(engine.world, tail, { color: false, partyLine: partyLine() });

  return {
    frames: { baseline: baselineFrame, zoneEntry: zoneFrame, recruit: recruitFrame },
    dialogueFrames: { first: firstDialogueFrame, withParty: partyDialogueFrame },
    plans: {
      baseline: baselinePlan, zoneEntry: zonePlan,
      dialogue: dialoguePlan, dialogueWithParty: dialogueWithPartyPlan, victory: victoryPlan,
    },
    events: { zoneEntered, firstNode, partyNode, cleared, heroFell },
    attachedFirst: [...attachedFirst],
    attachedWithParty: [...attachedWithParty],
    parity: { colored, plain },
    world: engine.world,
  };
}

// One real session, played once; every beat asserts against its captures.
const played = playSession();

describe('SEEN proof — beat 1: quiet baseline is byte-absent', () => {
  it('no Party line before recruit', () => {
    expect(played.frames.baseline.includes('Party:')).toBe(false);
  });
  it('no mood parenthetical in a district-less zone', () => {
    expect(/Entered .*\(/.test(played.frames.baseline)).toBe(false);
  });
  it('no sting and no musicCue on a quiet turn', () => {
    expect(played.plans.baseline.audioCommands.some((c) => c.action === 'sting')).toBe(false);
    expect(played.plans.baseline.plan.musicCue).toBeUndefined();
  });
});

describe('SEEN proof — beat 2: zone entry reaches eyes and ears', () => {
  it('world.zone.entered carries moodHint and the raw tone', () => {
    expect(played.events.zoneEntered).toBeDefined();
    expect(typeof played.events.zoneEntered?.payload?.moodHint).toBe('string');
    expect(typeof played.events.zoneEntered?.payload?.tone).toBe('string');
  });
  it('the mood parenthetical IS in the rendered log line', () => {
    expect(played.frames.zoneEntry.includes('> Entered Gallows Row. (Gallows Grounds:')).toBe(true);
  });
  it('a dread-family tone resolves music_dread over ambient_drone (tone-aware, not fallback)', () => {
    const dreadTones = new Set(['tense', 'volatile', 'oppressive', 'grim']);
    expect(dreadTones.has(String(played.events.zoneEntered?.payload?.tone))).toBe(true);
    expect(played.plans.zoneEntry.plan.musicCue?.trackId).toBe('music_dread');
    expect(played.plans.zoneEntry.plan.ambientLayers?.some((l) => l.layerId === 'ambient_drone')).toBe(true);
  });
});

describe('SEEN proof — beat 3: dialogue renders; the spoken line is owned once', () => {
  it('the dialogue frame renders the spoken line and the speaker', () => {
    expect(played.dialogueFrames.first).not.toBeNull();
    expect(played.dialogueFrames.first!.includes('Keep your voice down')).toBe(true);
    expect(played.dialogueFrames.first!.includes('Warden Sel')).toBe(true);
  });
  it('every attached hint is IN the dialogue frame; absences leave no empty labels', () => {
    for (const k of played.attachedFirst) {
      expect(played.dialogueFrames.first!.includes(String(played.events.firstNode!.payload[k]))).toBe(true);
    }
    expect(/\(\s*\)/.test(played.dialogueFrames.first ?? '')).toBe(false);
  });
  it('plan.speaker carries the spoken line; asides does NOT duplicate it (F-f1c74adc)', () => {
    expect(played.plans.dialogue.plan.speaker?.text).toBe('Keep your voice down. The Row has ears.');
    expect((played.plans.dialogue.plan.asides ?? []).some((a) => a.includes('Keep your voice down'))).toBe(false);
  });
});

describe('SEEN proof — beat 4: the Party line appears', () => {
  it('the always-on HUD carries the named party line after recruit', () => {
    expect(played.frames.recruit.includes('Party:')).toBe(true);
    expect(/Party:.*Warden Sel/.test(played.frames.recruit)).toBe(true);
  });
});

describe('SEEN proof — beat 4.5: a lived-in dialogue attaches and renders hints', () => {
  it('at least one narrator hint attaches once the world has texture', () => {
    expect(played.attachedWithParty.length).toBeGreaterThanOrEqual(1);
  });
  it('attached hints render in the frame; partyPresence rides asides as a fragment', () => {
    for (const k of played.attachedWithParty) {
      expect(played.dialogueFrames.withParty!.includes(String(played.events.partyNode!.payload[k]))).toBe(true);
    }
    if (played.attachedWithParty.includes('partyPresence')) {
      expect((played.plans.dialogueWithParty.plan.asides ?? []))
        .toContain(played.events.partyNode!.payload.partyPresence);
    }
  });
  it('SpeakerCue.emotion carries dialogueHint verbatim when present, else neutral', () => {
    const speaker = played.plans.dialogueWithParty.plan.speaker;
    if (!speaker) return;
    const hint = played.events.partyNode?.payload?.dialogueHint;
    expect(speaker.emotion).toBe(typeof hint === 'string' ? hint : 'neutral');
  });
});

describe('SEEN proof — beat 5: victory fires once and stings', () => {
  it('combat.encounter.cleared fired exactly once, outcome victory, player alive', () => {
    expect(played.events.heroFell).toBe(false);
    expect(played.events.cleared).toHaveLength(1);
    expect(played.events.cleared[0].payload?.outcome).toBe('victory');
  });
  it('the victory turn schedules the music_victory_sting and reads as triumph', () => {
    const sting = played.plans.victory?.audioCommands.find((c) => c.action === 'sting');
    expect(sting?.resourceId).toBe('music_victory_sting');
    expect(played.plans.victory?.plan.tone).toBe('triumph');
  });
});

describe('SEEN proof — beat 6: NO_COLOR parity', () => {
  it('the ANSI-stripped colored frame equals the color:false frame byte-for-byte', () => {
    expect(stripAnsi(played.parity.colored)).toBe(played.parity.plain);
  });
});
