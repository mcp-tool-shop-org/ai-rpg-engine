import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { myRuleset } from './ruleset.js';
import { createGame } from './setup.js';

describe('starter template', () => {
    it('ruleset validates against schema', () => {
        const r = validateRulesetDefinition(myRuleset);
        expect(r.ok).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('declares combat stats mapped in buildCombatStack', () => {
        const statIds = myRuleset.stats.map((s) => s.id);
        expect(statIds).toContain('power');
        expect(statIds).toContain('speed');
        expect(statIds).toContain('grit');
    });

    it('declares a starter-specific resource', () => {
        const resIds = myRuleset.resources.map((r) => r.id);
        expect(resIds).toContain('tension');
    });

    it('createGame boots without throwing', () => {
        const engine = createGame(1);
        expect(engine).toBeDefined();
    });

    it('tension rises when combat damage lands (tension-pressure fires)', () => {
        const engine = createGame(1);
        expect(engine.world.entities['player']?.resources.tension).toBe(0);

        // Walk into the danger zone and fight. combat-core emits
        // 'combat.damage.applied' whenever a hit lands — that is the event
        // the tension-pressure module listens on.
        engine.submitAction('move', { targetIds: ['danger-zone'] });
        for (let i = 0; i < 8; i++) {
            engine.submitAction('attack', { targetIds: ['grunt'] });
            if ((engine.world.entities['player']?.resources.tension ?? 0) > 0) break;
        }

        // Meta-test property: deleting the tension-pressure listener in
        // setup.ts turns this RED — nothing else writes the tension resource.
        expect(engine.world.entities['player']?.resources.tension).toBeGreaterThan(0);
    });
});
