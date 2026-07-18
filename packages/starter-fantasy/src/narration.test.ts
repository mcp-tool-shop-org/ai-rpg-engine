// End-to-end narration proof — the presentation stack is REACHABLE from a
// real game, not dark inventory.
//
// Full path under test, driven through an actual engine turn (no fixtures):
//   starter content (abilities with ability.* soundCues, crypt stinger)
//     → modules emit events carrying gameplay soundCues (combat.hit, …)
//     → terminal-ui TurnPresenter builds a NarrationPlan (presentation)
//       with cues mapped through soundpack-core's canonical table
//     → audio-director schedules AudioCommands against CORE_SOUND_PACK ids.
//
// Playback ceiling (honest): nothing here PLAYS audio — the terminal has no
// audio backend. The proof is that a valid plan and canonical, registry-
// resolvable commands exist for every turn a player actually takes.

import { describe, it, expect } from 'vitest';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import { validateNarrationPlan } from '@ai-rpg-engine/presentation';
import { CORE_SOUND_PACK, SoundRegistry } from '@ai-rpg-engine/soundpack-core';
import { TurnPresenter } from '@ai-rpg-engine/terminal-ui';
import { createGame } from './setup.js';

/** Run one player action and return the events it appended to the world log. */
function turn(
  engine: ReturnType<typeof createGame>,
  verb: string,
  options?: { targetIds?: string[] },
): ResolvedEvent[] {
  const before = engine.store.state.eventLog.length;
  engine.submitAction(verb, options);
  // Slice the WORLD LOG, not the submitAction return: reactive emissions
  // (starter stingers via events.on, defeat fallout) land in the log without
  // being in the returned array — and the log slice is exactly what a
  // frontend loop presents.
  return engine.store.state.eventLog.slice(before);
}

describe('starter-fantasy: a combat turn builds a real, valid NarrationPlan', () => {
  it('attacking the ash-ghoul yields an elevated/critical combat plan with mapped sfx', () => {
    const engine = createGame(42);
    const world = engine.store.state;
    world.entities['player'].zoneId = 'crypt-chamber';
    world.locationId = 'crypt-chamber';

    const presenter = new TurnPresenter();

    // Deterministic with seed 42; attacks may miss on a given roll, so swing
    // until a damage event lands (bounded — this is a fixed sequence).
    let hitTurn: ResolvedEvent[] | undefined;
    for (let i = 0; i < 12 && !hitTurn; i++) {
      const events = turn(engine, 'attack', { targetIds: ['ash-ghoul'] });
      if (events.some((e) => e.type === 'combat.damage.applied')) hitTurn = events;
    }
    expect(hitTurn, 'no attack landed in 12 swings at seed 42').toBeDefined();

    const result = presenter.present(world, hitTurn!);

    // The plan is real and VALID — audio-director accepted it (no warnings).
    expect(validateNarrationPlan(result.plan)).toEqual([]);
    expect(result.warnings).toEqual([]);

    // Combat derivation: tone combat (or triumph if the swing killed),
    // urgency elevated (or critical on a defeat).
    expect(['combat', 'triumph']).toContain(result.plan.tone);
    expect(['elevated', 'critical']).toContain(result.plan.urgency);

    // The module's `combat.hit` cue arrived MAPPED into the canonical
    // soundpack vocabulary — the three-vocabulary split is closed.
    expect(result.plan.sfx.length).toBeGreaterThan(0);
    expect(result.plan.sfx.map((s) => s.effectId)).toContain('alert_warning');

    // And it scheduled into playable commands for an embedder.
    const plays = result.audioCommands.filter((c) => c.action === 'play' && c.domain === 'sfx');
    expect(plays.map((c) => c.resourceId)).toContain('alert_warning');
  });

  it('every sfx a full fight schedules resolves in a core-pack SoundRegistry', () => {
    const engine = createGame(42);
    const world = engine.store.state;
    world.entities['player'].zoneId = 'crypt-chamber';
    world.locationId = 'crypt-chamber';

    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const presenter = new TurnPresenter();

    // Fight to the death (bounded): present EVERY turn and check the whole
    // command stream stays inside the canonical vocabulary.
    for (let i = 0; i < 30; i++) {
      const events = turn(engine, 'attack', { targetIds: ['ash-ghoul'] });
      const result = presenter.present(world, events);
      expect(validateNarrationPlan(result.plan)).toEqual([]);
      for (const cmd of result.audioCommands) {
        if (cmd.domain === 'sfx' && cmd.action === 'play') {
          expect(registry.get(cmd.resourceId), `unresolvable sfx "${cmd.resourceId}"`).toBeDefined();
        }
      }
      if (events.some((e) => e.type === 'combat.entity.defeated')) {
        // Defeat turn: plan goes critical; the win stinger (combat.victory →
        // ui_success) is scheduled alongside the defeat hit.
        expect(result.plan.urgency).toBe('critical');
        expect(result.plan.sfx.map((s) => s.effectId)).toContain('ui_success');
        return;
      }
    }
    expect.unreachable('ash-ghoul survived 30 swings at seed 42');
  });
});

describe('starter-fantasy: calm and scene turns', () => {
  it('a quiet look-around builds a calm, normal-urgency plan', () => {
    const engine = createGame(42);
    const events = turn(engine, 'inspect');
    const result = new TurnPresenter().present(engine.store.state, events);

    expect(validateNarrationPlan(result.plan)).toEqual([]);
    expect(result.plan.tone).toBe('calm');
    expect(result.plan.urgency).toBe('normal');
  });

  it('entering the crypt carries BOTH the scene.enter cue and the crypt-reveal stinger', () => {
    const engine = createGame(42);
    const world = engine.store.state;
    world.entities['player'].zoneId = 'vestry-door';
    world.locationId = 'vestry-door';

    const events = turn(engine, 'move', { targetIds: ['crypt-chamber'] });
    expect(events.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(events.some((e) => e.type === 'audio.cue.requested')).toBe(true);

    const result = new TurnPresenter().present(world, events);
    expect(validateNarrationPlan(result.plan)).toEqual([]);
    // scene.enter → ui_whoosh (exact tier); scene.crypt-reveal → ui_attention
    // (scene.* namespace tier). Both from ONE turn of real play.
    const ids = result.plan.sfx.map((s) => s.effectId);
    expect(ids).toContain('ui_whoosh');
    expect(ids).toContain('ui_attention');
  });
});

describe('starter-fantasy: narration determinism', () => {
  it('two same-seed games present identical plans and audio for the same turn', () => {
    const run = () => {
      const engine = createGame(7);
      const world = engine.store.state;
      world.entities['player'].zoneId = 'vestry-door';
      world.locationId = 'vestry-door';
      const events = turn(engine, 'move', { targetIds: ['crypt-chamber'] });
      return new TurnPresenter().present(world, events, { color: false });
    };
    const a = run();
    const b = run();
    expect(a.plan).toEqual(b.plan);
    expect(a.audioCommands).toEqual(b.audioCommands);
    expect(a.narrationText).toBe(b.narrationText);
  });
});
