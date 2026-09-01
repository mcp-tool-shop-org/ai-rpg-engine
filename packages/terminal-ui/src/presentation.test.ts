// TurnPresenter tests — the composition point of the presentation stack.
// Pins: plans built here always validate, sfx land in the canonical soundpack
// vocabulary, audio-director scheduling (priorities/ducking/cooldowns) runs
// on real plans, the styled narration honors the Stage-D color contract, and
// everything is deterministic. Playback itself is out of scope BY DESIGN —
// there is no terminal audio backend (see presentation.ts header).

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent, ZoneState } from '@ai-rpg-engine/core';
import { validateNarrationPlan } from '@ai-rpg-engine/presentation';
import { CORE_SOUND_PACK, SoundRegistry, extendCueMap } from '@ai-rpg-engine/soundpack-core';
import { compareAudioCommands } from '@ai-rpg-engine/audio-director';
import {
  TurnPresenter,
  presentTurn,
  renderNarrationLine,
  narrationTextFromEvents,
  PRESENTATION_TICK_MS,
  QUIET_TURN_TEXT,
} from './presentation.js';
import { stripAnsi } from './styles.js';

function makeWorld() {
  const zones: ZoneState[] = [
    { id: 'crypt', roomId: 'test', name: 'Crypt Chamber', tags: ['dark'], neighbors: [] },
  ];
  const player: EntityState = {
    id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero',
    tags: ['player'], stats: {}, resources: { hp: 20 }, statuses: [], zoneId: 'crypt',
  };
  const ghoul: EntityState = {
    id: 'ghoul', blueprintId: 'ghoul', type: 'enemy', name: 'Ash Ghoul',
    tags: ['enemy'], stats: {}, resources: { hp: 8 }, statuses: [], zoneId: 'crypt',
  };
  const engine = createTestEngine({
    modules: [], zones, entities: [player, ghoul], playerId: 'hero', startZone: 'crypt',
  });
  return engine.world;
}

let nextId = 0;
function ev(
  type: string,
  payload: Record<string, unknown>,
  presentation?: ResolvedEvent['presentation'],
): ResolvedEvent {
  const event: ResolvedEvent = { id: `evt_${nextId++}`, tick: 1, type, payload };
  if (presentation) event.presentation = presentation;
  return event;
}

const hit = () =>
  ev('combat.damage.applied', { attackerId: 'hero', targetId: 'ghoul', damage: 4, currentHp: 4 },
    { channels: ['objective'], priority: 'high', soundCues: ['combat.hit'] });

const defeat = () =>
  ev('combat.entity.defeated', { entityId: 'ghoul', entityName: 'Ash Ghoul', defeatedBy: 'hero' },
    { channels: ['objective', 'narrator'], priority: 'critical', soundCues: ['combat.defeat'] });

// F-32948b79: the authoritative "the fight is over" signal — triumph/flash
// are re-keyed off this event, not off "any non-player defeat" (see
// presentation's builder.test.ts for the full re-key coverage).
const cleared = () =>
  ev('combat.encounter.cleared', {}, { channels: ['objective', 'narrator'], priority: 'high' });

const enterZone = () =>
  ev('world.zone.entered', { zoneId: 'crypt', zoneName: 'Crypt Chamber' },
    { channels: ['objective'], priority: 'normal', soundCues: ['scene.enter'] });

const stinger = () =>
  ev('audio.cue.requested', { cueId: 'scene.crypt-reveal', channel: 'stinger', priority: 'high' });

describe('TurnPresenter: combat turn', () => {
  it('builds a validated critical plan and schedules canonical-audio commands', () => {
    const world = makeWorld();
    // F-32948b79: triumph now requires combat.encounter.cleared, not just a
    // defeat — cleared() makes this the "the fight actually ended" case the
    // test's own title (and downstream sfx/urgency assertions) intends.
    const result = new TurnPresenter().present(world, [hit(), defeat(), cleared()], { color: false });

    expect(validateNarrationPlan(result.plan)).toEqual([]);
    expect(result.plan.tone).toBe('triumph');
    expect(result.plan.urgency).toBe('critical');
    expect(result.warnings).toEqual([]);

    // The narration is the log's own lines, joined — unpunctuated fragments
    // gain a period at the join (F-b1b81929).
    expect(result.narrationText).toBe('4 damage dealt (HP: 4). Ash Ghoul defeated!');

    // Scheduled sfx use SOUNDPACK ids — the vocabulary is unified end to end.
    const sfxPlays = result.audioCommands.filter(
      (c) => c.domain === 'sfx' && c.action === 'play',
    );
    expect(sfxPlays.map((c) => c.resourceId).sort()).toEqual(['alert_critical', 'alert_warning']);

    // Every scheduled resource resolves in a SoundRegistry loaded with the
    // core pack — nothing points into the void.
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    for (const cmd of sfxPlays) {
      expect(registry.get(cmd.resourceId), cmd.resourceId).toBeDefined();
    }

    // Sfx presence ducks ambient (default ducking rule) — proof the director
    // actually ran, not just a pass-through.
    expect(result.audioCommands.some((c) => c.action === 'duck' && c.domain === 'ambient')).toBe(true);
  });

  it('the player falling is sorrow, not triumph', () => {
    const world = makeWorld();
    const fall = ev('combat.entity.defeated',
      { entityId: 'hero', entityName: 'Hero', defeatedBy: 'ghoul' },
      { priority: 'critical', soundCues: ['combat.defeat'] });
    const result = new TurnPresenter().present(world, [fall], { color: false });
    expect(result.plan.tone).toBe('sorrow');
    expect(result.plan.uiEffects).toEqual([{ type: 'fade-out', durationMs: 600 }]);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });
});

// F-0671a25f / F-b5150ad5: TurnPresenter was the repo's only per-turn
// AudioCommand composition point and never called AudioDirector.scheduleSting
// — the documented sting hook (music-layer fanfare/stinger, distinct from
// the sfx pipeline's blips) could never actually reach a player or embedder.
// present() now derives a sting cue (deriveStingCue, presentation) and, when
// one resolves (soundpack-core's resolveMusicSting), merges ONE 'sting'
// AudioCommand into schedule()'s output via scheduleStingInto (F-b4f0d758,
// wave-4 stitch) — sorted under the same comparator schedule() uses, layered
// over the stem, never replacing it.
describe('TurnPresenter: victory/defeat stings (F-0671a25f)', () => {
  it('a cleared encounter merges a combat.victory sting in comparator order, not appended last', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [hit(), defeat(), cleared()], { color: false });
    const stings = result.audioCommands.filter((c) => c.action === 'sting');
    expect(stings).toHaveLength(1);
    expect(stings[0].resourceId).toBe('music_victory_sting');
    expect(stings[0].domain).toBe('music');
    // F-b4f0d758: the whole array holds schedule()'s sorted-contract — a
    // timing-0 sting must NOT trail after-text commands. Verify global order
    // under the exported comparator (the exact invariant the old
    // append-last assertion violated).
    const sorted = [...result.audioCommands].sort(compareAudioCommands);
    expect(result.audioCommands).toEqual(sorted);
  });

  it('the player falling appends a combat.defeat sting — shippable today without combat.encounter.cleared existing at all', () => {
    const world = makeWorld();
    const fall = ev('combat.entity.defeated',
      { entityId: 'hero', entityName: 'Hero', defeatedBy: 'ghoul' },
      { priority: 'critical', soundCues: ['combat.defeat'] });
    const result = new TurnPresenter().present(world, [fall], { color: false });
    const stings = result.audioCommands.filter((c) => c.action === 'sting');
    expect(stings).toHaveLength(1);
    expect(stings[0].resourceId).toBe('music_defeat_sting');
  });

  it('a mutual kill (non-player defeat + clearance, THEN the player also falls) stings defeat, never victory', () => {
    const world = makeWorld();
    const fall = ev('combat.entity.defeated',
      { entityId: 'hero', entityName: 'Hero', defeatedBy: 'ghoul' },
      { priority: 'critical', soundCues: ['combat.defeat'] });
    const result = new TurnPresenter().present(world, [defeat(), cleared(), fall], { color: false });
    const stings = result.audioCommands.filter((c) => c.action === 'sting');
    expect(stings).toHaveLength(1);
    expect(stings[0].resourceId).toBe('music_defeat_sting');
  });

  it('a calm turn schedules no sting — audioCommands unchanged from before this fix (regression guard against the two pipelines double-firing)', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [enterZone()], { color: false });
    expect(result.audioCommands.some((c) => c.action === 'sting')).toBe(false);
  });

  it('a bare non-player defeat with NO clearance schedules no sting (mirrors deriveStingCue returning undefined)', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [hit(), defeat()], { color: false });
    expect(result.audioCommands.some((c) => c.action === 'sting')).toBe(false);
  });
});

// F-deb1375c / R4: TurnPresenter already deriveStingCue → resolveMusicSting
// → scheduleStingInto. A flee-clear must not schedule music_victory_sting
// or paint triumph (green-bold). Cue id combat.retreat maps to
// music_retreat_sting (media F-1b6a21ea).
describe('TurnPresenter: retreat-cleared (F-deb1375c / R4)', () => {
  const retreatCleared = () =>
    ev(
      'combat.encounter.cleared',
      { outcome: 'retreat' },
      { channels: ['objective', 'narrator'], priority: 'high' },
    );

  it('a retreat-cleared present() has zero music_victory_sting and plan.tone is not triumph', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [retreatCleared()], { color: false });
    expect(
      result.audioCommands.some((c) => c.action === 'sting' && c.resourceId === 'music_victory_sting'),
    ).toBe(false);
    expect(
      result.audioCommands.some((c) => c.action === 'sting' && c.resourceId === 'music_retreat_sting'),
    ).toBe(true);
    expect(result.plan.tone).not.toBe('triumph');
    expect(result.plan.tone).toBe('combat');
    expect(result.plan.uiEffects).toEqual([]);
    expect(result.narrationText).toContain('The fight breaks off.');
    expect(result.plan.asides).toBeUndefined();
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });
});

// Composition half of media's F-901767f5. TurnPresenter wires the REAL
// tone-aware resolver at the wave-2 stitch: soundpack-core's
// districtToneToSoundMood bridge + a CORE_SOUND_PACK-loaded SoundRegistry,
// roll pinned to 0 (deterministic first id-sorted match). A zone entry with
// no tone (or an unmapped tone) still falls through per-field to the
// documented scene.enter targets.
describe('TurnPresenter: zone-entry music (F-901767f5, tone-aware resolver wired at the stitch)', () => {
  it('a tone-less zone-entry turn populates musicCue/ambientLayers via the scene.enter fallback', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [enterZone()], { color: false });
    expect(result.plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
    expect(result.plan.ambientLayers).toEqual([
      { layerId: 'ambient_white_noise', action: 'start', volume: 0.3, fadeMs: 1000 },
    ]);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });

  it('a grim-toned zone entry resolves the dread stem and drone bed through the real bridge', () => {
    const world = makeWorld();
    const grimZone = ev(
      'world.zone.entered',
      { zoneId: 'gallows-row', zoneName: 'Gallows Row', tone: 'grim' },
      { channels: ['objective'], priority: 'normal', soundCues: ['scene.enter'] },
    );
    const result = new TurnPresenter().present(world, [grimZone], { color: false });
    expect(result.plan.musicCue).toEqual({ action: 'play', trackId: 'music_dread', fadeMs: 1000 });
    expect(result.plan.ambientLayers).toEqual([
      { layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 },
    ]);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });

  it('an unmapped tone falls through to the scene.enter targets, never an error', () => {
    const world = makeWorld();
    const oddZone = ev(
      'world.zone.entered',
      { zoneId: 'somewhere', zoneName: 'Somewhere', tone: 'not-a-tone' },
      { channels: ['objective'], priority: 'normal', soundCues: ['scene.enter'] },
    );
    const result = new TurnPresenter().present(world, [oddZone], { color: false });
    expect(result.plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
    expect(result.plan.ambientLayers).toEqual([
      { layerId: 'ambient_white_noise', action: 'start', volume: 0.3, fadeMs: 1000 },
    ]);
  });

  it('a non-zone-entry turn is unaffected: musicCue undefined, ambientLayers []', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [hit()], { color: false });
    expect(result.plan.musicCue).toBeUndefined();
    expect(result.plan.ambientLayers).toEqual([]);
  });
});

describe('TurnPresenter: calm turn', () => {
  it('a zone entry builds a calm plan with the transition cue', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [enterZone()], { color: false });

    expect(validateNarrationPlan(result.plan)).toEqual([]);
    expect(result.plan.tone).toBe('calm');
    expect(result.plan.urgency).toBe('normal');
    expect(result.narrationText).toBe('Entered Crypt Chamber');
    expect(result.plan.sfx).toEqual([{ effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 }]);
  });

  it('a starter stinger (audio.cue.requested) rides the scene.* namespace mapping', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [enterZone(), stinger()], { color: false });
    expect(result.plan.sfx.map((s) => s.effectId)).toEqual(['ui_whoosh', 'ui_attention']);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });

  it('an event-free turn narrates the quiet fallback and schedules nothing audible', () => {
    const world = makeWorld();
    const result = new TurnPresenter().present(world, [], { color: false });
    expect(result.narrationText).toBe(QUIET_TURN_TEXT);
    expect(result.plan.sfx).toEqual([]);
    expect(result.audioCommands.filter((c) => c.action === 'play')).toEqual([]);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });
});

describe('TurnPresenter: cooldowns across turns (tick clock)', () => {
  it('a repeated hit cue within the pack cooldown window is suppressed, then recovers', () => {
    const world = makeWorld();
    const presenter = new TurnPresenter();

    // alert_warning carries cooldownMs 3000 in CORE_SOUND_PACK; the tick
    // clock advances PRESENTATION_TICK_MS (1000ms) per tick.
    const first = presenter.present(world, [hit()], { color: false, now: 1 * PRESENTATION_TICK_MS });
    expect(first.audioCommands.some((c) => c.resourceId === 'alert_warning' && c.action === 'play')).toBe(true);

    const second = presenter.present(world, [hit()], { color: false, now: 2 * PRESENTATION_TICK_MS });
    expect(second.audioCommands.some((c) => c.resourceId === 'alert_warning' && c.action === 'play')).toBe(false);

    const later = presenter.present(world, [hit()], { color: false, now: 5 * PRESENTATION_TICK_MS });
    expect(later.audioCommands.some((c) => c.resourceId === 'alert_warning' && c.action === 'play')).toBe(true);
  });

  it('defaults the clock to world.meta.tick * PRESENTATION_TICK_MS', () => {
    const world = makeWorld();
    const presenter = new TurnPresenter();
    // Same tick twice: the second present sits 0ms after the first — inside
    // any nonzero cooldown, so the play must be suppressed.
    presenter.present(world, [hit()], { color: false });
    const again = presenter.present(world, [hit()], { color: false });
    expect(again.audioCommands.some((c) => c.action === 'play' && c.domain === 'sfx')).toBe(false);
  });
});

describe('styled narration: Stage-D color contract', () => {
  it('stripping ANSI from the colored line yields the plain line, byte for byte', () => {
    const world = makeWorld();
    const events = [hit(), defeat()];
    const colored = new TurnPresenter().present(world, events, { color: true });
    const plain = new TurnPresenter().present(world, events, { color: false });
    expect(stripAnsi(colored.styledNarration)).toBe(plain.styledNarration);
    expect(plain.styledNarration).toBe(plain.narrationText);
  });

  it('emphasis tiers: triumph=green bold, critical=red bold, elevated=yellow, calm=plain', () => {
    const base = { sceneText: 'X', sfx: [], ambientLayers: [], uiEffects: [], interruptibility: 'free' as const };
    const green = renderNarrationLine({ ...base, tone: 'triumph', urgency: 'critical' }, { color: true });
    expect(green).toContain('[32m');
    expect(green).toContain('[1m');
    const red = renderNarrationLine({ ...base, tone: 'combat', urgency: 'critical' }, { color: true });
    expect(red).toContain('[31m');
    const yellow = renderNarrationLine({ ...base, tone: 'combat', urgency: 'elevated' }, { color: true });
    expect(yellow).toContain('[33m');
    const calm = renderNarrationLine({ ...base, tone: 'calm', urgency: 'normal' }, { color: true });
    expect(calm).toBe('X');
  });
});

describe('presentTurn one-shot + determinism', () => {
  it('two identical presents produce deep-equal results', () => {
    const world = makeWorld();
    const events = [hit(), defeat(), stinger()];
    const a = presentTurn(world, events, { color: false });
    const b = presentTurn(makeWorld(), [hit(), defeat(), stinger()], { color: false });
    // Fixture ids differ per call (evt counter), but the presented output is
    // a pure function of event CONTENT the presenter reads.
    expect(a.plan).toEqual(b.plan);
    expect(a.audioCommands).toEqual(b.audioCommands);
    expect(a.styledNarration).toBe(b.styledNarration);
  });

  it('accepts a custom cue resolver (extendCueMap) for richer packs', () => {
    const world = makeWorld();
    const result = presentTurn(world, [hit()], {
      color: false,
      resolveSoundCue: extendCueMap({
        'combat.hit': { effectId: 'ui_click', timing: 'immediate', intensity: 1 },
      }),
    });
    expect(result.plan.sfx).toEqual([{ effectId: 'ui_click', timing: 'immediate', intensity: 1 }]);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
  });
});

describe('narrationTextFromEvents', () => {
  it('joins formatted lines without the log affordance prefix, punctuating the join', () => {
    expect(narrationTextFromEvents([enterZone(), hit()])).toBe(
      'Entered Crypt Chamber. 4 damage dealt (HP: 4)',
    );
  });

  it('skips unrenderable bookkeeping events entirely', () => {
    const flag = ev('world.flag.changed', { flag: 'x', value: true });
    expect(narrationTextFromEvents([flag])).toBe(QUIET_TURN_TEXT);
  });

  it('an unlock round narrates the unlock, not the quiet fallback (F-0a572dd7)', () => {
    // The live delta for a menu XP spend: declared/resolved bookkeeping
    // around the one renderable event.
    const round = [
      ev('action.declared', { verb: 'unlock' }),
      ev('progression.node.unlocked', { treeId: 'combat-mastery', nodeId: 'toughened', effects: [] }),
      ev('action.resolved', { verb: 'unlock' }),
    ];
    expect(narrationTextFromEvents(round)).toBe('Unlocked Toughened');
  });

  // F-b1b81929: a busy round joined its fragments with bare spaces —
  // "…stamina: 5 → 4 Hit! 3 damage dealt (HP: 7) Miss." read as one run-on
  // mash. The joins are now punctuated; the transform is punctuation-ONLY.
  describe('join punctuation (F-b1b81929)', () => {
    it('the live-caught shape: a resource change joined to a hit gains its period', () => {
      const round = [
        ev('resource.changed', { resource: 'stamina', previous: 5, current: 4 }),
        ev('combat.contact.hit', {}),
      ];
      expect(narrationTextFromEvents(round)).toBe('stamina: 5 → 4. Hit!');
    });

    it('fragments already ending in ./!/? are untouched at the join', () => {
      const round = [
        ev('combat.contact.hit', {}),
        ev('combat.contact.miss', {}),
        ev('combat.entity.defeated', { entityName: 'Ash Ghoul' }),
      ];
      expect(narrationTextFromEvents(round)).toBe('Hit! Miss. Ash Ghoul defeated!');
    });

    it('the FINAL fragment keeps its original ending — punctuation lands at joins only', () => {
      const round = [
        ev('combat.contact.hit', {}),
        ev('resource.changed', { resource: 'stamina', previous: 5, current: 4 }),
      ];
      expect(narrationTextFromEvents(round)).toBe('Hit! stamina: 5 → 4');
    });

    it('a quoted dialogue choice ending inside its quotes counts as punctuated', () => {
      const round = [
        ev('dialogue.choice.selected', { choiceText: 'Who goes there?' }),
        ev('combat.contact.hit', {}),
      ];
      expect(narrationTextFromEvents(round)).toBe('"Who goes there?" Hit!');
    });

    it('single-fragment narration is byte-identical to its formatEventLine text', () => {
      const round = [ev('resource.changed', { resource: 'stamina', previous: 5, current: 4 })];
      expect(narrationTextFromEvents(round)).toBe('stamina: 5 → 4');
    });
  });
});
