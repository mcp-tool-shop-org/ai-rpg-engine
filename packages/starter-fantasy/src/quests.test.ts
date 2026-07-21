// Fantasy quest playthroughs (F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.
//
// Scaffolding note: the script tops up the hero's stamina between swings so
// the attrition loop never gates on the resource economy. Enemies do not act
// (NPC turns are CLI-driven), so the only state that matters — zone entries
// and kills — flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency, questProgressCount } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { ashesBelowQuest, wardensRestQuest, fantasyQuests, xpAwards } from './content.js';

const questXp = (quest: typeof ashesBelowQuest): number =>
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

describe('chapel-threshold quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered at the door

    // — Ashes Below: offered on stepping into the nave —
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    const ashes = engine.world.quests[ashesBelowQuest.id];
    expect(ashes?.status).toBe('active');
    expect(ashes?.currentStage).toBe('cross-to-the-vestry');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1: reach the vestry passage.
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    expect(engine.world.quests[ashesBelowQuest.id].currentStage).toBe('lay-the-dead-to-rest');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(1);

    // Stage 2 (progress 2): the stalker at the vestry is the first of the two.
    killByAttrition(engine, 'crypt-stalker');
    const midQuest = engine.world.quests[ashesBelowQuest.id];
    expect(midQuest.status).toBe('active');
    expect(questProgressCount(midQuest, 'lay-the-dead-to-rest')).toBe(1);

    // — The Warden's Rest: offered on setting foot in the crypt —
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });
    expect(engine.world.quests[wardensRestQuest.id]?.status).toBe('active');

    // The ash ghoul is the second risen dead → Ashes Below completes, and the
    // completing kill's XP delta is exactly kill + quest reward.
    const xpBeforeGhoul = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'ash-ghoul');
    expect(engine.world.quests[ashesBelowQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeGhoul).toBe(
      xpAwards.kill + questXp(ashesBelowQuest),
    );

    // — Face the Warden: the boss kill completes the second quest —
    const xpBeforeWarden = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'crypt-warden');
    expect(engine.world.quests[wardensRestQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeWarden).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(wardensRestQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['player'].inventory).toContain('healing-draught');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['chapel-entrance'] });
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([ashesBelowQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(fantasyQuests.map((q) => q.id)).toEqual(['ashes-below', 'the-wardens-rest']);
  });
});
