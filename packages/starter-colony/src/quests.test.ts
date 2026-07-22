// Colony quest playthroughs (F-c07d6024, mirroring F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.
//
// Scaffolding note: the script tops up the commander's stamina between swings
// so the attrition loop never gates on the resource economy. Enemies do not
// act (NPC turns are CLI-driven), so the only state that matters — zone
// entries and kills — flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { signalTraceQuest, signalSourceQuest, colonyQuests, xpAwards } from './content.js';

const questXp = (quest: typeof signalTraceQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding;
 *  the kill itself is a real combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const commander = engine.world.entities[engine.world.playerId];
    if (commander) commander.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('signal-loss quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered inside the command module

    // — Signal Trace: offered on stepping into hydroponics —
    engine.submitAction('move', { targetIds: ['hydroponics'] });
    const trace = engine.world.quests[signalTraceQuest.id];
    expect(trace?.status).toBe('active');
    expect(trace?.currentStage).toBe('reach-the-tower');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1 (and only stage): reach the signal tower completes the quest,
    // and the SAME entry offers The Signal Source (offer resolves before
    // tracking, so the arriving step can never count as source progress).
    const xpBeforeTower = getCurrency(engine.world, 'commander', 'xp');
    engine.submitAction('move', { targetIds: ['signal-tower'] });
    expect(engine.world.quests[signalTraceQuest.id].status).toBe('completed');
    // Entry delta: first-visit XP + the quest reward, nothing else.
    expect(getCurrency(engine.world, 'commander', 'xp') - xpBeforeTower).toBe(
      xpAwards.firstVisit + questXp(signalTraceQuest),
    );

    // — The Signal Source: offered on setting foot in the alien cavern —
    engine.submitAction('move', { targetIds: ['alien-cavern'] });
    expect(engine.world.quests[signalSourceQuest.id]?.status).toBe('active');

    // The resonance entity's kill completes it.
    const xpBeforeSource = getCurrency(engine.world, 'commander', 'xp');
    killByAttrition(engine, 'resonance_entity');
    expect(engine.world.quests[signalSourceQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'commander', 'xp') - xpBeforeSource).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(signalSourceQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['commander'].inventory).toContain('signal-booster');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['hydroponics'] });
    engine.submitAction('move', { targetIds: ['command-module'] });
    engine.submitAction('move', { targetIds: ['hydroponics'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([signalTraceQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(colonyQuests.map((q) => q.id)).toEqual(['signal-trace', 'the-signal-source']);
  });
});
