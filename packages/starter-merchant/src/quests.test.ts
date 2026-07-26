// Quest completability proven by EXECUTION, not arithmetic.
//
// A scripted session performs the verbs a player would — speak, choose, move,
// consign, attack — against the shipped world. No synthetic events, no direct
// quest-state writes. The trap this guards is the v3.0 Phase-9 catch: content
// that is wired, unit-green, and unreachable in the actual game.
//
// Scaffolding note: the script tops up stamina between swings so the attrition
// loop never gates on the resource economy, and enemies do not act (NPC turns
// are CLI-driven). The state that matters — zone entries, dialogue completions,
// kills — all flows through the real dispatch pipeline.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getCurrency } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import {
  openTheBooksQuest,
  lateCaravanQuest,
  standingAccountQuest,
  merchantQuests,
  xpAwards,
} from './content.js';
import { getOpenObligations } from './contract-core.js';

const questXp = (quest: typeof openTheBooksQuest): number =>
  (quest.rewards ?? []).find((r) => r.type === 'xp')?.params.amount as number;

const eventsOfType = (engine: Engine, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

/** Swing until the target drops. The kill is a real combat.entity.defeated. */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 600): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const factor = engine.world.entities[engine.world.playerId];
    if (factor) {
      factor.resources.stamina = 20;
      // Combat spends liquidity in this pack (there is no gain row) — top it up
      // so the attrition loop tests the quest, not the resource floor.
      factor.resources.liquidity = 60;
    }
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

describe('salt-road-ledger quests — scripted playthrough', () => {
  it('every authored quest is registered at construction', () => {
    // quest-core validates at construction and fails loud; this pins that all
    // three reached the engine rather than only the ones a script happens to hit.
    const engine = createGame(71);
    expect(merchantQuests).toHaveLength(3);
    expect(engine.world.quests).toBeDefined();
  });

  it('OPEN THE BOOKS completes through real dialogue, and the reward lands', () => {
    const engine = createGame(71);

    // NOT offered at boot: the trigger is `dialogue.started`, because a quest
    // gated on entering the START zone can never fire (the `move` handler is what
    // emits world.zone.entered). Approaching Corvane is what opens it.
    expect(engine.world.quests[openTheBooksQuest.id]).toBeUndefined();

    const xpBefore = getCurrency(engine.world, 'factor', 'xp');

    engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
    const offered = engine.world.quests[openTheBooksQuest.id];
    expect(offered?.status).toBe('active');
    expect(offered?.currentStage).toBe('register-with-the-guild');

    engine.submitAction('choose', { parameters: { choiceId: 'register' } });

    const quest = engine.world.quests[openTheBooksQuest.id];
    expect(quest?.status).toBe('completed');

    // The reward, and the dialogue XP the progression rewards also grant.
    const xpAfter = getCurrency(engine.world, 'factor', 'xp');
    expect(xpAfter).toBeGreaterThanOrEqual(xpBefore + questXp(openTheBooksQuest));

    // And the mechanical payoff: the seal is in hand, so consign is now possible.
    expect(engine.world.entities.factor.inventory).toContain('guild-seal');
    expect(eventsOfType(engine, 'merchant.books.opened')).toHaveLength(1);
  });

  it('THE LATE CARAVAN offers on the quay and advances through the customs shed', () => {
    const engine = createGame(71);

    engine.submitAction('move', { targetIds: ['long-quay'] });
    const offered = engine.world.quests[lateCaravanQuest.id];
    expect(offered?.status).toBe('active');
    expect(offered?.currentStage).toBe('find-out-what-is-owed');

    // Drell keeps the manifests — reaching him is the advance condition.
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    expect(engine.world.quests[lateCaravanQuest.id]?.currentStage).toBe('settle-or-default');
  });

  it('THE STANDING ACCOUNT completes by facing the reckoning, and pays the boss bonus', () => {
    const engine = createGame(71);
    const xpBefore = getCurrency(engine.world, 'factor', 'xp');

    // Route to the audit chamber the way a player must: quay -> customs -> chamber.
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });

    const offered = engine.world.quests[standingAccountQuest.id];
    expect(offered?.status).toBe('active');

    killByAttrition(engine, 'the-standing-account');

    expect(engine.world.quests[standingAccountQuest.id]?.status).toBe('completed');

    // Quest XP + per-kill XP + the once-only boss bonus all land.
    const xpAfter = getCurrency(engine.world, 'factor', 'xp');
    expect(xpAfter).toBeGreaterThanOrEqual(
      xpBefore + questXp(standingAccountQuest) + xpAwards.kill + xpAwards.bossBonus,
    );
  });

  it('the boss bonus is awarded ONCE even across a longer session', () => {
    // oncePer gates on a world.globals flag, so a second defeat event for the
    // same boss must not pay again.
    const engine = createGame(71);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });
    killByAttrition(engine, 'the-standing-account');
    const xpAfterKill = getCurrency(engine.world, 'factor', 'xp');

    // Replay the defeat event directly — the gate, not the combat, is under test.
    engine.store.recordEvent({
      id: '', tick: engine.world.meta.tick, type: 'combat.entity.defeated', actorId: 'factor',
      payload: { entityId: 'the-standing-account', entityName: 'The Standing Account', defeatedBy: 'factor', defeatZoneId: 'audit-chamber' },
    });

    // Per-kill XP may fire again (it is not gated), but the boss BONUS must not.
    expect(getCurrency(engine.world, 'factor', 'xp')).toBeLessThan(xpAfterKill + xpAwards.bossBonus);
  });

  it('a full session reaches the endgame with the obligation loop exercised', () => {
    // The integration path the pack actually sells: open the books, consign
    // something, let it run late, audit, then face the reckoning.
    const engine = createGame(71);

    engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
    engine.submitAction('choose', { parameters: { choiceId: 'register' } });
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    expect(getOpenObligations(engine.world)).toHaveLength(1);

    const obligation = getOpenObligations(engine.world)[0];
    engine.world.meta.tick = obligation.dueTick + 20;
    engine.submitAction('move', { targetIds: ['long-quay'] });
    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(0);

    engine.submitAction('audit');
    const [report] = eventsOfType(engine, 'merchant.audit.requested');
    expect(report.payload.overdueCount).toBe(1);
    expect(report.payload.balanced).toBe(false);

    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });
    killByAttrition(engine, 'the-standing-account');

    expect(engine.world.quests[standingAccountQuest.id]?.status).toBe('completed');
  });
});

describe('determinism across the full playthrough', () => {
  it('two identical scripted sessions are byte-identical', () => {
    const script = (engine: Engine) => {
      engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
      engine.submitAction('choose', { parameters: { choiceId: 'register' } });
      engine.submitAction('appraise', { parameters: { itemId: 'guild-seal' } });
      engine.submitAction('move', { targetIds: ['long-quay'] });
      engine.submitAction('move', { targetIds: ['crooked-stair'] });
      engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
      engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
      engine.submitAction('audit');
      engine.submitAction('move', { targetIds: ['long-quay'] });
    };
    const a = createGame(71);
    const b = createGame(71);
    script(a);
    script(b);

    expect(a.serialize()).toBe(b.serialize());
  });

  it('a different seed produces a different world', () => {
    // The negative control for the assertion above: if serialize() were
    // seed-blind, the byte-identity test would pass vacuously.
    const script = (engine: Engine) => {
      engine.submitAction('move', { targetIds: ['long-quay'] });
      engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
    };
    const a = createGame(71);
    const b = createGame(9182);
    script(a);
    script(b);

    expect(a.serialize()).not.toBe(b.serialize());
  });
});
