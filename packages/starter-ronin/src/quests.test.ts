// Jade Veil quest playthroughs (F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { voicesInTheCourtQuest, unmaskTheTraitorQuest, roninQuests, xpAwards } from './content.js';

const questXp = (quest: typeof voicesInTheCourtQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding
 *  (attack's optional ki spend never blocks the base action — see
 *  combat-resources.ts's trySpend); the kill itself is a real
 *  combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const hero = engine.world.entities[engine.world.playerId];
    if (hero) hero.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('jade-veil quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered at the gate

    // — Voices in the Court: offered stepping into the great hall —
    engine.submitAction('move', { targetIds: ['great-hall'] });
    const voices = engine.world.quests[voicesInTheCourtQuest.id];
    expect(voices?.status).toBe('active');
    expect(voices?.currentStage).toBe('reach-the-hidden-passage');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1: find the hidden passage (not a direct neighbor of the great
    // hall — the tea garden sits between them).
    engine.submitAction('move', { targetIds: ['tea-garden'] });
    engine.submitAction('move', { targetIds: ['hidden-passage'] });
    expect(engine.world.quests[voicesInTheCourtQuest.id].currentStage).toBe('silence-the-shadow');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(1);

    // Stage 2: the shadow assassin stands placed right here.
    const xpBeforeShadow = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'shadow-assassin');
    expect(engine.world.quests[voicesInTheCourtQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeShadow).toBe(
      xpAwards.kill + questXp(voicesInTheCourtQuest),
    );

    // — Unmask the Traitor: offered on entering the lord's chamber —
    engine.submitAction('move', { targetIds: ['lords-chamber'] });
    expect(engine.world.quests[unmaskTheTraitorQuest.id]?.status).toBe('active');

    // The corrupt samurai guards the gate itself — travel back to reach him.
    engine.submitAction('move', { targetIds: ['great-hall'] });
    engine.submitAction('move', { targetIds: ['castle-gate'] });
    const xpBeforeTraitor = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'corrupt-samurai');
    expect(engine.world.quests[unmaskTheTraitorQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeTraitor).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(unmaskTheTraitorQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['player'].inventory).toContain('wakizashi');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['great-hall'] });
    engine.submitAction('move', { targetIds: ['castle-gate'] });
    engine.submitAction('move', { targetIds: ['great-hall'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([voicesInTheCourtQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(roninQuests.map((q) => q.id)).toEqual(['voices-in-the-court', 'unmask-the-traitor']);
  });
});
