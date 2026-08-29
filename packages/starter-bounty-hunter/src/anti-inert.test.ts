// ANTI-INERT — every mechanic this pack advertises does something.
//
// The standing lesson of v3.6 and v3.7, applied to the twelfth pack at birth
// rather than discovered in it two releases later: a verb with no reachable
// target, a resource nothing writes, an NPC nobody can recruit and a status
// nothing applies are all the same defect, and all four shipped in this catalog
// before somebody went looking.
//
// So each of the six pack-native verbs gets a row proving it CHANGES something,
// and — where the verb refuses — a row proving the refusal is a structured
// rejection rather than a silent no-op. The refusals matter as much as the
// successes here: `collar` exists precisely BECAUSE it can say no, which is
// what makes it a taking rather than a damage roll with a payout attached.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { createGame } from './setup.js';
import {
  pursuitState,
  getPursuitState,
  informantPrice,
  formatPursuitForNarrator,
  COLLAR_WARRANT_COST,
  POST_BOUNTY_WARRANT_COST,
  IMPEACH_WARRANT_GAIN,
  IMPEACH_INFAMY_COST,
  FENCE_INFAMY_GAIN,
  INFORMANT_INFAMY_GAIN,
  LAY_LOW_HEAT_RELIEF,
  LAY_LOW_STAMINA_GAIN,
  SEARCHED_HEAT,
  HUNTED_HEAT,
  ALERT_HUNTED,
} from './pursuit-core.js';
import {
  bountyHunterAbilities,
  bountyHunterStatusDefinitions,
  firstTicketQuest,
} from './content.js';

const PLAYER = 'thief-taker';

function boot(): Engine {
  return createGame(71);
}

function res(engine: Engine, id: string): number {
  return Number(engine.world.entities[PLAYER]?.resources?.[id] ?? 0);
}

/** Stand the player next to somebody without pretending the walk happened. */
function standWith(engine: Engine, entityId: string): void {
  const target = engine.world.entities[entityId];
  const me = engine.world.entities[PLAYER];
  if (target && me) me.zoneId = target.zoneId;
}

function submit(engine: Engine, verb: string, params: Record<string, unknown> = {}, targetIds?: string[]) {
  return engine.submitAction(verb, { ...(targetIds ? { targetIds } : {}), ...params });
}

function rejection(events: ReturnType<Engine['submitAction']>): string | undefined {
  const e = events.find((x) => x.type === 'action.rejected');
  return e ? String(e.payload.reason) : undefined;
}

describe('anti-inert: collar', () => {
  it('takes a beaten mark, spends warrant, and RECORDS the taking', () => {
    const engine = boot();
    standWith(engine, 'rookery-runner');
    engine.world.entities['rookery-runner'].resources.hp = 3; // beaten, still breathing

    const warrantBefore = res(engine, 'warrant');
    const events = submit(engine, 'collar', {}, ['rookery-runner']);
    expect(rejection(events), 'a lawful collar was refused').toBeUndefined();

    expect(res(engine, 'warrant')).toBe(warrantBefore - COLLAR_WARRANT_COST);
    const marks = getPursuitState(engine.world).marks;
    expect(marks.map((m) => m.entityId)).toContain('rookery-runner');
    expect(marks[0].convicted).toBe(false);
  });

  it('two collars mint distinct evt_ ids at the action tick, not hand-rolled actor-type keys', () => {
    const engine = boot();
    standWith(engine, 'rookery-runner');
    engine.world.entities['rookery-runner'].resources.hp = 2;
    engine.world.meta.tick = 5;
    const first = submit(engine, 'collar', {}, ['rookery-runner']);
    const collar1 = first.find((e) => e.type === 'pursuit.mark.collared');
    expect(collar1, 'first collar produced no event').toBeDefined();
    expect(collar1!.id).toMatch(/^evt_/);
    expect(collar1!.id).not.toBe(`${PLAYER}-pursuit.mark.collared`);
    expect(collar1!.tick).toBe(5);

    standWith(engine, 'bludger');
    engine.world.entities['bludger'].resources.hp = 2;
    engine.world.meta.tick = 8;
    const second = submit(engine, 'collar', {}, ['bludger']);
    const collar2 = second.find((e) => e.type === 'pursuit.mark.collared');
    expect(collar2, 'second collar produced no event').toBeDefined();
    expect(collar2!.id).toMatch(/^evt_/);
    expect(collar2!.id).not.toBe(collar1!.id);
    expect(collar2!.tick).toBe(8);
  });

  it('refuses a mark still on their feet — with a reason, not silence', () => {
    const engine = boot();
    standWith(engine, 'rookery-runner');
    const events = submit(engine, 'collar', {}, ['rookery-runner']);
    expect(rejection(events)).toContain('still on their feet');
    expect(getPursuitState(engine.world).marks).toEqual([]);
  });

  it('refuses without legal cover — the line between thief-taker and kidnapper', () => {
    const engine = boot();
    standWith(engine, 'rookery-runner');
    engine.world.entities['rookery-runner'].resources.hp = 2;
    engine.world.entities[PLAYER].resources.warrant = 0;
    expect(rejection(submit(engine, 'collar', {}, ['rookery-runner']))).toContain('not enough warrant');
  });
});

describe('anti-inert: impeach', () => {
  it('converts a taking into warrant, and costs infamy for it', () => {
    const engine = boot();
    standWith(engine, 'rookery-runner');
    engine.world.entities['rookery-runner'].resources.hp = 2;
    submit(engine, 'collar', {}, ['rookery-runner']);

    const warrant = res(engine, 'warrant');
    const infamy = res(engine, 'infamy');
    expect(rejection(submit(engine, 'impeach', {}, ['rookery-runner']))).toBeUndefined();

    expect(res(engine, 'warrant')).toBe(warrant + IMPEACH_WARRANT_GAIN);
    expect(res(engine, 'infamy')).toBe(infamy - IMPEACH_INFAMY_COST);
    expect(getPursuitState(engine.world).marks[0].convicted).toBe(true);
  });

  it('refuses when you are holding nobody', () => {
    expect(rejection(submit(boot(), 'impeach'))).toContain('holding nobody');
  });
});

describe('anti-inert: informant', () => {
  it('buys a location, and tells the street you were asking', () => {
    const engine = boot();
    const coin = res(engine, 'coin');
    const infamy = res(engine, 'infamy');
    const price = informantPrice(infamy);

    expect(rejection(submit(engine, 'informant', {}, ['nightman']))).toBeUndefined();
    expect(res(engine, 'coin')).toBe(coin - price);
    expect(res(engine, 'infamy')).toBe(infamy + INFORMANT_INFAMY_GAIN);
    expect(getPursuitState(engine.world).words['nightman']).toBe('flash-house');
  });

  it('prices by YOUR standing with the street, and says the number when refusing', () => {
    // DCSS's Zot lesson: a price the player cannot see reads as arbitrary.
    expect(informantPrice(0)).toBeGreaterThan(informantPrice(100));
    const engine = boot();
    engine.world.entities[PLAYER].resources.coin = 0;
    const reason = rejection(submit(engine, 'informant', {}, ['nightman']));
    expect(reason).toContain('costs');
    expect(reason).toMatch(/\d/);
  });
});

describe('anti-inert: fence', () => {
  it('moves goods for coin and buys standing with the other half of the city', () => {
    const engine = boot();
    standWith(engine, 'mother-slack');
    const me = engine.world.entities[PLAYER];
    me.inventory = [...(me.inventory ?? []), 'stolen-plate'];

    const infamy = res(engine, 'infamy');
    const coin = res(engine, 'coin');
    expect(rejection(submit(engine, 'fence', { toolId: 'stolen-plate' }))).toBeUndefined();

    expect(res(engine, 'infamy')).toBe(infamy + FENCE_INFAMY_GAIN);
    expect(res(engine, 'coin')).toBeGreaterThan(coin);
    expect(engine.world.entities[PLAYER].inventory).not.toContain('stolen-plate');
  });

  it('needs a PERSON, not a menu — refused where nobody buys quietly', () => {
    const engine = boot(); // starts at the bounty office
    const me = engine.world.entities[PLAYER];
    me.inventory = [...(me.inventory ?? []), 'stolen-plate'];
    expect(rejection(submit(engine, 'fence', { toolId: 'stolen-plate' }))).toContain('nobody here buys quietly');
  });
});

describe('anti-inert: post-bounty', () => {
  it('puts a price on a name and spends the office credit to do it', () => {
    const engine = boot();
    const warrant = res(engine, 'warrant');
    expect(rejection(submit(engine, 'post-bounty', {}, ['nightman']))).toBeUndefined();
    expect(res(engine, 'warrant')).toBe(warrant - POST_BOUNTY_WARRANT_COST);
    expect(getPursuitState(engine.world).posted).toContain('nightman');
  });

  it('refuses a second price on the same name', () => {
    const engine = boot();
    submit(engine, 'post-bounty', {}, ['nightman']);
    expect(rejection(submit(engine, 'post-bounty', {}, ['nightman']))).toContain('already a price');
  });
});

describe('anti-inert: lay-low, and the pursuit state it moves', () => {
  it('sheds heat and reports the transition with its named trigger', () => {
    const engine = boot();
    engine.world.globals['player_heat'] = HUNTED_HEAT + 2;
    expect(pursuitState(engine.world).state).toBe('HUNTED');

    const events = submit(engine, 'lay-low');
    expect(rejection(events)).toBeUndefined();
    const changed = events.find((e) => e.type === 'pursuit.state.changed');
    expect(changed, 'lying low narrated no transition').toBeDefined();
    expect(changed!.payload.trigger).toBe('lay-low');
    expect(changed!.payload.from).toBe('HUNTED');
    expect(Number(engine.world.globals['player_heat'])).toBe(HUNTED_HEAT + 2 - LAY_LOW_HEAT_RELIEF);
  });

  it('refuses when nobody is looking — a verb that always works teaches nothing', () => {
    const engine = boot();
    expect(pursuitState(engine.world).state).toBe('COLD');
    expect(rejection(submit(engine, 'lay-low'))).toContain('nobody is looking');
  });

  it('lay-low at full stamina does not exceed maxStamina', () => {
    const engine = boot();
    engine.world.globals['player_heat'] = SEARCHED_HEAT;
    const me = engine.world.entities[PLAYER];
    const max = Number(me.resources.maxStamina);
    me.resources.stamina = max;
    expect(rejection(submit(engine, 'lay-low'))).toBeUndefined();
    expect(me.resources.stamina).toBe(max);
  });

  it('lay-low from a partial tank restores up to maxStamina, not the ruleset 40', () => {
    const engine = boot();
    engine.world.globals['player_heat'] = SEARCHED_HEAT;
    const me = engine.world.entities[PLAYER];
    const max = Number(me.resources.maxStamina);
    me.resources.stamina = 8;
    expect(rejection(submit(engine, 'lay-low'))).toBeUndefined();
    expect(me.resources.stamina).toBe(Math.min(8 + LAY_LOW_STAMINA_GAIN, max));
    expect(me.resources.stamina).toBeLessThanOrEqual(max);
  });
});

describe('anti-inert: apply-status duration rides the effect (11-pack pattern)', () => {
  it('every apply-status effect carries duration matching the timed definition', () => {
    for (const ability of bountyHunterAbilities) {
      for (const effect of ability.effects) {
        if (effect.type !== 'apply-status') continue;
        const statusId = effect.params.statusId;
        expect(typeof statusId, `${ability.id} apply-status missing statusId`).toBe('string');
        const def = bountyHunterStatusDefinitions.find((s) => s.id === statusId);
        expect(def, `${ability.id} applies unknown status ${String(statusId)}`).toBeDefined();
        if (def?.duration?.type === 'ticks') {
          expect(effect.params.duration, `${ability.id} missing duration for ${String(statusId)}`).toBe(def.duration.value);
        }
      }
    }
  });
});

describe('anti-inert: first ticket advances off an authored verb', () => {
  it('offering then informant emits quest.stage.advanced', () => {
    const engine = boot();
    expect(rejection(submit(engine, 'move', {}, ['shambles']))).toBeUndefined();
    expect(engine.world.quests[firstTicketQuest.id]?.status).toBe('active');
    expect(engine.world.quests[firstTicketQuest.id]?.currentStage).toBe('find-the-runner');

    expect(rejection(submit(engine, 'informant', {}, ['rookery-runner']))).toBeUndefined();
    expect(engine.world.eventLog.some((e) => e.type === 'quest.stage.advanced' && e.payload.questId === firstTicketQuest.id)).toBe(true);
    expect(engine.world.quests[firstTicketQuest.id]?.currentStage).toBe('take-him-breathing');
  });
});

describe('the pursuit state is a legible machine, not a mood', () => {
  it('reads COLD / SEARCHED / HUNTED off heat, at its own stated thresholds', () => {
    const engine = boot();
    expect(pursuitState(engine.world).state).toBe('COLD');
    engine.world.globals['player_heat'] = SEARCHED_HEAT;
    expect(pursuitState(engine.world).state).toBe('SEARCHED');
    engine.world.globals['player_heat'] = HUNTED_HEAT;
    expect(pursuitState(engine.world).state).toBe('HUNTED');
  });

  it('a faction on the hunt overrides a quiet heat number', () => {
    // The doctrine in the pack's own vocabulary: heat drains and alert does
    // not, so a faction that has decided about you keeps hunting through a
    // quiet week. This is the engine's rule, expressed — not a second clock.
    const engine = boot();
    engine.world.globals['player_heat'] = 0;
    engine.world.globals['faction_alert_thieves-company'] = ALERT_HUNTED;
    const { state, because } = pursuitState(engine.world);
    expect(state).toBe('HUNTED');
    expect(because).toContain('thieves-company');
  });

  it('every state carries the NUMBER that caused it', () => {
    // Svelch 2020: pursuit reads as fair when it follows learnable rules, and
    // a state with no stated cause is a mood rather than a rule.
    const engine = boot();
    for (const heat of [0, SEARCHED_HEAT, HUNTED_HEAT]) {
      engine.world.globals['player_heat'] = heat;
      expect(pursuitState(engine.world).because).toContain(String(heat));
      expect(formatPursuitForNarrator(engine.world)).toContain(String(heat));
    }
  });
});
