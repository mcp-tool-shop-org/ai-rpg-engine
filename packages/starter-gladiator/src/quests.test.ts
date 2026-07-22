// Gladiator quest playthroughs (F-c07d6024-gladiator-quest-loop).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing. Mirrors
// starter-fantasy's and starter-zombie's own quests.test.ts pattern.
//
// Scaffolding note: the script tops up the gladiator's stamina between swings
// so the attrition loop never gates on the resource economy. Enemies do not
// act (NPC turns are CLI-driven), so the only state that matters — zone
// entries and kills — flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { firstBloodQuest, overlordsDueQuest, gladiatorQuests, xpAwards } from './content.js';

const questXp = (quest: typeof firstBloodQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding;
 *  the kill itself is a real combat.entity.defeated from the dispatcher. */
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

describe('iron-colosseum quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered at the door

    // — First Blood in the Sand: offered on stepping onto the arena floor —
    // Route holding-cells -> armory -> patron-gallery -> arena-floor so The
    // Overlord's Due (triggered by patron-gallery) offers BEFORE First Blood
    // (triggered by arena-floor), proving offer order follows play, not
    // authoring order.
    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    const due = engine.world.quests[overlordsDueQuest.id];
    expect(due?.status).toBe('active');
    expect(due?.currentStage).toBe('topple-the-overlord');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    engine.submitAction('move', { targetIds: ['arena-floor'] });
    const firstBlood = engine.world.quests[firstBloodQuest.id];
    expect(firstBlood?.status).toBe('active');
    expect(firstBlood?.currentStage).toBe('draw-first-blood');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(2);

    // The war beast is the single-stage kill target — completes First Blood.
    const xpBeforeBeast = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'war-beast');
    expect(engine.world.quests[firstBloodQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeBeast).toBe(
      xpAwards.kill + questXp(firstBloodQuest),
    );

    // — The Overlord's Due: the boss kill completes it —
    const xpBeforeOverlord = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'arena-overlord');
    expect(engine.world.quests[overlordsDueQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeOverlord).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(overlordsDueQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['player'].inventory).toContain('victory-wreath');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([overlordsDueQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(gladiatorQuests.map((q) => q.id)).toEqual(['first-blood', 'the-overlords-due']);
  });
});
