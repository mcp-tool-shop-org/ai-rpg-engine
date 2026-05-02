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

    it('tension pressure module is wired', () => {
        const engine = createGame(1);
        const p = engine.world.entities['player'];
        expect(p?.resources.tension).toBe(0);
    });
});
