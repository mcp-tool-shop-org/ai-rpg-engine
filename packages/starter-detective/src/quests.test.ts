// Detective quest playthroughs (F-c07d6024, mirroring F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.
//
// Scaffolding note: the script tops up the inspector's stamina between swings
// so the attrition loop never gates on the resource economy. Enemies do not
// act (NPC turns are CLI-driven), so the only state that matters — zone
// entries and kills — flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { trailQuest, hargreavesQuest, detectiveQuests, xpAwards } from './content.js';

const questXp = (quest: typeof trailQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding;
 *  the kill itself is a real combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const inspector = engine.world.entities[engine.world.playerId];
    if (inspector) inspector.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('gaslight-detective quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered at the crime scene

    // — Following the Trail: offered on stepping into the parlour —
    engine.submitAction('move', { targetIds: ['parlour'] });
    const trail = engine.world.quests[trailQuest.id];
    expect(trail?.status).toBe('active');
    expect(trail?.currentStage).toBe('reach-the-entrance');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1 (and only stage): reaching the front entrance completes the
    // quest. This is not yet Hargreaves' ground, so no second offer fires.
    const xpBeforeEntrance = getCurrency(engine.world, 'inspector', 'xp');
    engine.submitAction('move', { targetIds: ['front-entrance'] });
    expect(engine.world.quests[trailQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'inspector', 'xp') - xpBeforeEntrance).toBe(
      xpAwards.firstVisit + questXp(trailQuest),
    );
    expect(engine.world.quests[hargreavesQuest.id]).toBeUndefined();

    // — Closing the Case: offered on setting foot in the back alley —
    engine.submitAction('move', { targetIds: ['back-alley'] });
    expect(engine.world.quests[hargreavesQuest.id]?.status).toBe('active');

    // Mr. Hargreaves' kill completes it.
    const xpBeforeHargreaves = getCurrency(engine.world, 'inspector', 'xp');
    killByAttrition(engine, 'crime-boss');
    expect(engine.world.quests[hargreavesQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'inspector', 'xp') - xpBeforeHargreaves).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(hargreavesQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['inspector'].inventory).toContain('pocket-watch');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['parlour'] });
    engine.submitAction('move', { targetIds: ['crime-scene'] });
    engine.submitAction('move', { targetIds: ['parlour'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([trailQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(detectiveQuests.map((q) => q.id)).toEqual(['following-the-trail', 'closing-the-case']);
  });
});
