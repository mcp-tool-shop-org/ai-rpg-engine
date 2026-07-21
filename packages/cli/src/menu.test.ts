// F1d — abilities & XP reachable. The numbered menu gains ability entries
// (finally producing use-ability's parameters.abilityId) and XP-affordable
// unlock entries; the HUD the renderer receives gains xp/level.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, combatMasteryTree } from '@ai-rpg-engine/starter-fantasy';
import { addCurrency, getCurrency } from '@ai-rpg-engine/modules';
import { buildActionList } from '@ai-rpg-engine/terminal-ui';
import {
  buildAbilityActions,
  buildUnlockActions,
  buildExtraActions,
  renderExtraActions,
  parseExtraSelection,
  buildHudWorld,
  buildDebugActions,
  buildDirectorActions,
  renderInspectorReport,
  derivePlayerLevel,
  DEBUG_MENU_LABEL,
  DIRECTOR_MENU_LABEL,
  DIRECTOR_MENU_VERB,
} from './menu.js';
import { getAbilityCatalog } from './turns.js';
import { handlePlayerInput } from './bin.js';

/** Fantasy game with a divine player (ability requirements) in the crypt. */
function makeDivineCryptGame() {
  const engine = createGame(42);
  const player = engine.store.state.entities['player'];
  player.tags = [...player.tags, 'divine'];
  player.zoneId = 'crypt-chamber';
  engine.store.state.locationId = 'crypt-chamber';
  return engine;
}

describe('buildAbilityActions (F1d)', () => {
  it('lists every READY ability, expanding single-target ones per valid enemy', () => {
    const engine = makeDivineCryptGame();
    const actions = buildAbilityActions(engine.world, getAbilityCatalog(engine));

    const labels = actions.map((a) => a.label);
    // holy-smite is single-target damage → one entry per living enemy in zone, id-sorted.
    expect(labels).toContain('Holy Smite → Ash Ghoul');
    expect(labels).toContain('Holy Smite → Crypt Warden');
    // self-targeted abilities are single entries.
    expect(labels).toContain('Purify');
    expect(labels).toContain('Divine Light');
    // Every entry carries the abilityId the use-ability verb requires.
    expect(actions.every((a) => typeof a.parameters?.abilityId === 'string')).toBe(true);
  });

  it('offensive abilities never offer FRIENDLY NPCs as targets (live-caught: Holy Smite → the pilgrim)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.tags = [...player.tags, 'divine'];
    // Player stays at chapel-entrance with the pilgrim + Sister Maren (both
    // friendly `npc`-tagged; the type-heuristic still calls them 'enemy').
    const actions = buildAbilityActions(engine.world, getAbilityCatalog(engine));
    const labels = actions.map((a) => a.label);
    expect(labels.some((l) => l.startsWith('Holy Smite'))).toBe(false);
    // Support/self abilities remain available.
    expect(labels).toContain('Purify');
    expect(labels).toContain('Divine Light');
  });

  it('abilities the player does not qualify for are not listed (no menu-offers-it, engine-rejects-it trap)', () => {
    const engine = createGame(42); // no divine tag
    const actions = buildAbilityActions(engine.world, getAbilityCatalog(engine));
    expect(actions).toEqual([]);
  });

  it('selecting an ability entry submits use-ability with the right abilityId — and it EXECUTES', () => {
    const engine = makeDivineCryptGame();
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const baseCount = buildActionList(engine.world).length;
    const smiteIndex = extras.findIndex((a) => a.label === 'Holy Smite → Ash Ghoul');
    expect(smiteIndex).toBeGreaterThanOrEqual(0);

    const result = handlePlayerInput(engine, String(baseCount + smiteIndex + 1), {
      log: vi.fn(),
      extras,
    });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    const abilityEvents = engine.world.eventLog.filter(
      (e) => e.type === 'ability.used' || e.type === 'ability.check.failed',
    );
    expect(abilityEvents.length).toBeGreaterThan(0);
    expect(abilityEvents[0].payload.abilityId).toBe('holy-smite');
    // Never rejected: the menu only offered a submittable entry.
    expect(engine.world.eventLog.some((e) => e.type === 'ability.rejected')).toBe(false);
  });
});

describe('buildUnlockActions (F1d) — XP is spendable', () => {
  it('lists exactly the affordable, prerequisite-met nodes', () => {
    const engine = makeDivineCryptGame();
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);

    const actions = buildUnlockActions(engine.world, [combatMasteryTree]);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Unlock Toughened (10 xp)');
    expect(labels).toContain('Unlock Keen Eye (15 xp)');
    // battle-fury costs 25 (unaffordable) AND requires toughened — not offered.
    expect(labels.some((l) => l.includes('Battle Fury'))).toBe(false);
  });

  it('selecting an unlock entry spends XP through the engine and applies the node', () => {
    const engine = makeDivineCryptGame();
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);
    const hpBefore = engine.world.entities['player'].resources.hp;

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const baseCount = buildActionList(engine.world).length;
    const unlockIndex = extras.findIndex((a) => a.label === 'Unlock Toughened (10 xp)');
    expect(unlockIndex).toBeGreaterThanOrEqual(0);

    const result = handlePlayerInput(engine, String(baseCount + unlockIndex + 1), {
      log: vi.fn(),
      extras,
    });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'progression.node.unlocked')).toBe(true);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(10); // 20 - 10 spent
    expect(engine.world.entities['player'].resources.hp).toBe(hpBefore + 5); // toughened
  });

  it('no trees → no unlock entries', () => {
    const engine = makeDivineCryptGame();
    expect(buildUnlockActions(engine.world, [])).toEqual([]);
  });
});

describe('renderExtraActions + parseExtraSelection (F1d)', () => {
  const extras = [
    { verb: 'use-ability', parameters: { abilityId: 'a' }, label: 'Alpha', group: 'ability' as const },
    { verb: 'unlock', parameters: { treeId: 't', nodeId: 'n' }, label: 'Beta', group: 'advance' as const },
  ];

  it('numbers continue the base menu and groups are visually separated', () => {
    const rendered = renderExtraActions(extras, 6);
    expect(rendered).toContain('[7] Alpha');
    expect(rendered).toContain('[8] Beta');
    expect(rendered).toContain('\n\n'); // group separator
  });

  it('parses only numbers inside the extras range', () => {
    expect(parseExtraSelection('7', 6, extras)).toBe(extras[0]);
    expect(parseExtraSelection('8', 6, extras)).toBe(extras[1]);
    expect(parseExtraSelection('6', 6, extras)).toBeNull(); // base menu's number
    expect(parseExtraSelection('9', 6, extras)).toBeNull(); // beyond range
    expect(parseExtraSelection('attack', 6, extras)).toBeNull();
    expect(parseExtraSelection('7 extra words', 6, extras)).toBeNull();
  });

  it('renders nothing when there are no extras', () => {
    expect(renderExtraActions([], 6)).toBe('');
  });

  it('base-menu numbers still route to the base menu when extras are present (control)', () => {
    const engine = makeDivineCryptGame();
    const extrasLive = buildExtraActions(engine, [combatMasteryTree]);
    const result = handlePlayerInput(engine, '1', { log: vi.fn(), extras: extrasLive });
    expect(result).toEqual({ kind: 'action', via: 'menu' });
  });
});

describe('buildHudWorld (F1d) — XP/level in the HUD', () => {
  it('decorates the display player with xp and level without touching live state', () => {
    const engine = makeDivineCryptGame();
    addCurrency(engine.store.state, 'player', 'xp', 15, engine.tick);

    const hud = buildHudWorld(engine.world, [combatMasteryTree]);
    expect(hud.entities['player'].resources.xp).toBe(15);
    expect(hud.entities['player'].resources.level).toBe(1);
    // Live state is untouched — a save after rendering is identical to before.
    expect(engine.world.entities['player'].resources.xp).toBeUndefined();
    expect(engine.world.entities['player'].resources.level).toBeUndefined();
  });

  it('level rises with unlocked progression nodes', () => {
    const engine = makeDivineCryptGame();
    addCurrency(engine.store.state, 'player', 'xp', 30, engine.tick);
    engine.submitAction('unlock', { parameters: { treeId: 'combat-mastery', nodeId: 'toughened' } });

    const hud = buildHudWorld(engine.world, [combatMasteryTree]);
    expect(hud.entities['player'].resources.level).toBe(2);
    expect(hud.entities['player'].resources.xp).toBe(20); // 30 - 10 spent
  });

  it('a world without progression-core still renders (xp 0, level 1)', () => {
    const engine = makeDivineCryptGame();
    delete engine.store.state.modules['progression-core'];
    const hud = buildHudWorld(engine.world, []);
    expect(hud.entities['player'].resources.xp).toBe(0);
    expect(hud.entities['player'].resources.level).toBe(1);
  });

  it('derivePlayerLevel is the single level authority: 1 + unlocked nodes', () => {
    const engine = makeDivineCryptGame();
    expect(derivePlayerLevel(engine.world)).toBe(1);
    addCurrency(engine.store.state, 'player', 'xp', 30, engine.tick);
    engine.submitAction('unlock', { parameters: { treeId: 'combat-mastery', nodeId: 'toughened' } });
    expect(derivePlayerLevel(engine.world)).toBe(2);
    expect(buildHudWorld(engine.world, [combatMasteryTree]).entities['player'].resources.level).toBe(2);
  });
});

// F-ENG006 — the engine's registered inspectors (Engine.getInspectors, until
// now consumer-less) become reachable through an env-gated debug menu entry.
describe('debug inspector entry (F-ENG006)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the debug entry is HIDDEN without AI_RPG_DEBUG=1 (player surface stays clean)', () => {
    vi.stubEnv('AI_RPG_DEBUG', '');
    const engine = createGame(42); // no divine tag, no xp → no ability/unlock extras
    // Only the always-on Director's Ledger remains — no debug entry.
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras).toHaveLength(1);
    expect(extras[0].group).toBe('director');
    expect(extras.some((e) => e.group === 'debug')).toBe(false);
    expect(buildDebugActions({})).toEqual([]);
    expect(buildDebugActions({ AI_RPG_DEBUG: '0' })).toEqual([]);
  });

  it('AI_RPG_DEBUG=1 appends the debug entry last, and it renders in the extras section', () => {
    vi.stubEnv('AI_RPG_DEBUG', '1');
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras).toHaveLength(2); // director (always) + debug (env-gated)
    expect(extras[0].group).toBe('director');
    expect(extras[1].group).toBe('debug');
    expect(extras[1].label).toBe(DEBUG_MENU_LABEL);

    const rendered = renderExtraActions(extras, 6);
    expect(rendered).toContain(`[7] ${DIRECTOR_MENU_LABEL}`);
    expect(rendered).toContain(`[8] ${DEBUG_MENU_LABEL}`);
  });

  it('the debug entry appends AFTER ability and unlock entries', () => {
    vi.stubEnv('AI_RPG_DEBUG', '1');
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.tags = [...player.tags, 'divine'];
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras.length).toBeGreaterThan(1);
    expect(extras[extras.length - 1].group).toBe('debug');
    expect(extras.slice(0, -1).every((e) => e.group !== 'debug')).toBe(true);
  });

  it('renderInspectorReport renders every inspector title + real content from a starter engine', () => {
    const engine = createGame(42);
    const inspectors = engine.getInspectors();
    // starter-fantasy registers the simulation-inspector suite (10) plus the
    // ability/combat observer inspectors — a real roster, not a stub.
    expect(inspectors.length).toBeGreaterThanOrEqual(10);

    const report = renderInspectorReport(engine);
    expect(report).toContain(`DEBUG — SIMULATION INSPECTORS (${inspectors.length})`);
    for (const inspector of inspectors) {
      expect(report).toContain(`── ${inspector.label} (${inspector.id}) ──`);
    }
    // Real state flows through: the faction inspector shows the starter's faction.
    expect(report).toContain('chapel-undead');
  });

  it('a throwing inspector degrades to ONE bounded line and its siblings still render', () => {
    const engine = createGame(42);
    const fake = {
      world: engine.world,
      getInspectors: () => [
        { id: 'ok-a', label: 'OK A', inspect: () => ({ fine: true }) },
        {
          id: 'boom',
          label: 'Boom',
          inspect: (): unknown => {
            throw new Error('kaboom\n'.repeat(100)); // multiline + pathological length
          },
        },
        { id: 'ok-b', label: 'OK B', inspect: () => 'still here' },
      ],
    };

    const report = renderInspectorReport(fake);
    expect(report).toContain('"fine": true'); // first sibling rendered
    expect(report).toContain('still here'); // sibling AFTER the thrower rendered — session survives

    const failLines = report.split('\n').filter((l) => l.includes('[inspector failed:'));
    expect(failLines).toHaveLength(1); // one line, not a stack
    expect(failLines[0]).toContain('kaboom');
    expect(failLines[0].length).toBeLessThan(280); // bounded (describeActionError caps the reason)
  });

  it('an unserializable (circular) inspector return is caught by the same guard', () => {
    const engine = createGame(42);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const fake = {
      world: engine.world,
      getInspectors: () => [{ id: 'cyc', label: 'Cyclic', inspect: () => circular }],
    };
    const report = renderInspectorReport(fake);
    expect(report).toContain('── Cyclic (cyc) ──');
    expect(report).toContain('[inspector failed:');
  });

  it('an engine with no inspectors says so instead of rendering an empty report', () => {
    const engine = createGame(42);
    const fake = { world: engine.world, getInspectors: () => [] };
    const report = renderInspectorReport(fake);
    expect(report).toContain('DEBUG — SIMULATION INSPECTORS (0)');
    expect(report).toContain('No debug inspectors are registered for this pack.');
  });
});

describe("director's ledger entry (F-ENG005)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the entry is ALWAYS present — no env gate, it is a player surface', () => {
    vi.stubEnv('AI_RPG_DEBUG', '');
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const director = extras.filter((e) => e.group === 'director');
    expect(director).toHaveLength(1);
    expect(director[0].label).toBe(DIRECTOR_MENU_LABEL);
    expect(director[0].verb).toBe(DIRECTOR_MENU_VERB);
    expect(buildDirectorActions()).toEqual([
      { verb: DIRECTOR_MENU_VERB, label: DIRECTOR_MENU_LABEL, group: 'director' },
    ]);
  });

  it('the label reads in the menu voice and is pinned', () => {
    expect(DIRECTOR_MENU_LABEL).toBe("Director's Ledger — the strategic picture");
    expect(DIRECTOR_MENU_VERB).toBe('director-ledger');
  });

  it('selecting its number resolves to the director group (the routing key — the sentinel verb never reaches the engine)', () => {
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const rendered = renderExtraActions(extras, 6);
    expect(rendered).toContain(`[7] ${DIRECTOR_MENU_LABEL}`);

    const selected = parseExtraSelection('7', 6, extras);
    expect(selected).not.toBeNull();
    expect(selected?.group).toBe('director');
    expect(selected?.verb).toBe(DIRECTOR_MENU_VERB);
    expect(selected?.targetIds).toBeUndefined();
    expect(selected?.parameters).toBeUndefined();
  });

  it('the entry sits after ability/unlock entries and BEFORE the debug entry (operator surface stays last)', () => {
    vi.stubEnv('AI_RPG_DEBUG', '1');
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.tags = [...player.tags, 'divine'];
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const directorIdx = extras.findIndex((e) => e.group === 'director');
    const debugIdx = extras.findIndex((e) => e.group === 'debug');
    expect(directorIdx).toBeGreaterThan(0); // abilities/unlocks come first
    expect(debugIdx).toBe(extras.length - 1);
    expect(directorIdx).toBe(debugIdx - 1);
    expect(
      extras.slice(0, directorIdx).every((e) => e.group === 'ability' || e.group === 'advance'),
    ).toBe(true);
  });
});
