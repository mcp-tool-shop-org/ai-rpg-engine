// Zombie quest playthroughs (F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.
//
// Scaffolding note: the script tops up the survivor's stamina between swings
// so the attrition loop never gates on the resource economy. Enemies do not
// act (NPC turns are CLI-driven), so the only state that matters — zone
// entries and kills — flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { medicineRunQuest, alphaQuest, zombieQuests, xpAwards } from './content.js';

const questXp = (quest: typeof medicineRunQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding;
 *  the kill itself is a real combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const survivor = engine.world.entities[engine.world.playerId];
    if (survivor) survivor.resources.stamina = 25;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('ashfall-dead quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // the safehouse asks nothing yet

    // — The Medicine Run: offered on stepping onto the overrun street —
    engine.submitAction('move', { targetIds: ['overrun-street'] });
    const run = engine.world.quests[medicineRunQuest.id];
    expect(run?.status).toBe('active');
    expect(run?.currentStage).toBe('clear-the-street');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1: put down one of the dead (the shambler walks this street).
    killByAttrition(engine, 'shambler_1');
    expect(engine.world.quests[medicineRunQuest.id].currentStage).toBe('reach-the-east-wing');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(1);

    // Stage 2: reaching the east wing completes The Medicine Run — and the
    // SAME entry offers The Alpha (offer resolves before tracking, so the
    // arriving step can never count as Alpha progress).
    const xpBeforeWing = getCurrency(engine.world, 'survivor', 'xp');
    engine.submitAction('move', { targetIds: ['hospital-wing'] });
    expect(engine.world.quests[medicineRunQuest.id].status).toBe('completed');
    expect(engine.world.quests[alphaQuest.id]?.status).toBe('active');
    // Entry delta: first-visit XP + the quest reward, nothing else.
    expect(getCurrency(engine.world, 'survivor', 'xp') - xpBeforeWing).toBe(
      xpAwards.firstVisit + questXp(medicineRunQuest),
    );

    // — The Alpha: the boss kill completes it —
    const xpBeforeBloater = getCurrency(engine.world, 'survivor', 'xp');
    killByAttrition(engine, 'bloater-alpha');
    expect(engine.world.quests[alphaQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'survivor', 'xp') - xpBeforeBloater).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(alphaQuest),
    );
    // The item reward lands via the real item.acquired path.
    expect(engine.world.entities['survivor'].inventory).toContain('antibiotics');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['overrun-street'] });
    engine.submitAction('move', { targetIds: ['safehouse-lobby'] });
    engine.submitAction('move', { targetIds: ['overrun-street'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([medicineRunQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(zombieQuests.map((q) => q.id)).toEqual(['the-medicine-run', 'the-alpha']);
  });
});
