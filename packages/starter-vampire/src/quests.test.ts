// Crimson Court quest playthroughs (F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { thirstAndShadowsQuest, eldersReckoningQuest, vampireQuests, xpAwards } from './content.js';

const questXp = (quest: typeof thirstAndShadowsQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding
 *  (attack's optional bloodlust spend never blocks the base action — see
 *  combat-resources.ts's trySpend); the kill itself is a real
 *  combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const fledgling = engine.world.entities[engine.world.playerId];
    if (fledgling) fledgling.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('crimson-court quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(42);
    expect(engine.world.quests).toEqual({}); // nothing offered at the ball

    // — Thirst and Shadows: offered descending into the wine cellar —
    engine.submitAction('move', { targetIds: ['wine-cellar'] });
    const thirst = engine.world.quests[thirstAndShadowsQuest.id];
    expect(thirst?.status).toBe('active');
    expect(thirst?.currentStage).toBe('reach-the-bell-tower');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1: reach the bell tower. The SAME event also offers "The Elder's
    // Reckoning" — two independent quests keying off one world.zone.entered.
    engine.submitAction('move', { targetIds: ['bell-tower'] });
    expect(engine.world.quests[thirstAndShadowsQuest.id].currentStage).toBe('put-down-the-hunter');
    expect(engine.world.quests[eldersReckoningQuest.id]?.status).toBe('active');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(1);

    // Stage 2: the witch hunter stands placed right here.
    const xpBeforeHunter = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'witch-hunter');
    expect(engine.world.quests[thirstAndShadowsQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeHunter).toBe(
      xpAwards.kill + questXp(thirstAndShadowsQuest),
    );
    // Killing the hunter must not touch the still-active elder quest.
    expect(engine.world.quests[eldersReckoningQuest.id].status).toBe('active');

    // — The Elder's Reckoning: the elder guards the ballroom — travel back —
    engine.submitAction('move', { targetIds: ['wine-cellar'] });
    engine.submitAction('move', { targetIds: ['grand-ballroom'] });
    const xpBeforeElder = getCurrency(engine.world, 'player', 'xp');
    killByAttrition(engine, 'elder-vampire');
    expect(engine.world.quests[eldersReckoningQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'player', 'xp') - xpBeforeElder).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(eldersReckoningQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['player'].inventory).toContain('obsidian-ring');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['wine-cellar'] });
    engine.submitAction('move', { targetIds: ['grand-ballroom'] });
    engine.submitAction('move', { targetIds: ['wine-cellar'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([thirstAndShadowsQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(42);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(vampireQuests.map((q) => q.id)).toEqual(['thirst-and-shadows', 'the-elders-reckoning']);
  });
});
