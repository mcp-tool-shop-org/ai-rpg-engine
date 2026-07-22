// Neon Lockbox quest playthroughs (F-ENG005-quest-loop-min).
//
// Completability proven by EXECUTION, not arithmetic: a scripted engine
// session performs the same verbs a player would (move, attack) against the
// shipped world — no synthetic events, no direct quest-state writes — and
// both authored quests complete with their rewards landing.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { ghostInTheWiresQuest, crackTheVaultQuest, cyberpunkQuests, xpAwards } from './content.js';

const questXp = (quest: typeof ghostInTheWiresQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

/** Swing until the target drops. Stamina is topped up as test scaffolding
 *  (attack's optional bandwidth spend never blocks the base action — see
 *  combat-resources.ts's trySpend); the kill itself is a real
 *  combat.entity.defeated from the dispatcher. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 300): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const runner = engine.world.entities[engine.world.playerId];
    if (runner) runner.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('neon-lockbox quests — scripted playthrough', () => {
  it('completes BOTH authored quests in one session and every reward lands', () => {
    const engine = createGame(77);
    expect(engine.world.quests).toEqual({}); // nothing offered at the door

    // — Ghost in the Wires: offered the moment the runner leaves the street —
    engine.submitAction('move', { targetIds: ['server-room'] });
    const ghost = engine.world.quests[ghostInTheWiresQuest.id];
    expect(ghost?.status).toBe('active');
    expect(ghost?.currentStage).toBe('reach-the-vault');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);

    // Stage 1: reach the data vault. The SAME event also offers "Crack the
    // Vault" — two independent quests keying off one world.zone.entered.
    engine.submitAction('move', { targetIds: ['data-vault'] });
    expect(engine.world.quests[ghostInTheWiresQuest.id].currentStage).toBe('silence-the-ice');
    expect(engine.world.quests[crackTheVaultQuest.id]?.status).toBe('active');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(1);

    // Stage 2: the ICE sentry is the only ice-agent-tagged hostile placed —
    // its kill both completes Ghost in the Wires and leaves the Overseer for
    // the second quest.
    const xpBeforeSentry = getCurrency(engine.world, 'runner', 'xp');
    killByAttrition(engine, 'ice-sentry');
    expect(engine.world.quests[ghostInTheWiresQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'runner', 'xp') - xpBeforeSentry).toBe(
      xpAwards.kill + questXp(ghostInTheWiresQuest),
    );
    // Killing the (non-boss) sentry must not touch the still-active vault quest.
    expect(engine.world.quests[crackTheVaultQuest.id].status).toBe('active');

    // — Crack the Vault: the overseer kill completes the second quest —
    const xpBeforeOverseer = getCurrency(engine.world, 'runner', 'xp');
    killByAttrition(engine, 'vault-overseer');
    expect(engine.world.quests[crackTheVaultQuest.id].status).toBe('completed');
    expect(getCurrency(engine.world, 'runner', 'xp') - xpBeforeOverseer).toBe(
      xpAwards.kill + xpAwards.bossBonus + questXp(crackTheVaultQuest),
    );
    // The item reward lands in the inventory via the real item.acquired path.
    expect(engine.world.entities['runner'].inventory).toContain('neural-link');

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(2);
  });

  it('each quest is offered exactly once, however often its entry re-fires', () => {
    const engine = createGame(77);
    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['street-level'] });
    engine.submitAction('move', { targetIds: ['server-room'] });
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
    expect(Object.keys(engine.world.quests)).toEqual([ghostInTheWiresQuest.id]);
  });

  it('quest-core registers through the world stack and the pack content is valid', () => {
    const engine = createGame(77);
    const mm = engine.moduleManager as unknown as { modules: Map<string, unknown> };
    expect([...mm.modules.keys()]).toContain('quest-core');
    expect(cyberpunkQuests.map((q) => q.id)).toEqual(['ghost-in-the-wires', 'crack-the-vault']);
  });
});
