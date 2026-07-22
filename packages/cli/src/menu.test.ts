// F1d — abilities & XP reachable. The numbered menu gains ability entries
// (finally producing use-ability's parameters.abilityId) and XP-affordable
// unlock entries; the HUD the renderer receives gains xp/level.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, combatMasteryTree } from '@ai-rpg-engine/starter-fantasy';
import { addCurrency, getCurrency, giveItem, ABILITY_CATALOG_FORMULA } from '@ai-rpg-engine/modules';
import { buildActionList, renderFullScreen, SCREEN_WIDTH } from '@ai-rpg-engine/terminal-ui';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import {
  buildAbilityActions,
  buildUnlockActions,
  buildSellActions,
  buildExtraActions,
  parseExtraSelection,
  buildHudWorld,
  buildDebugActions,
  buildDirectorActions,
  buildJournalActions,
  renderInspectorReport,
  renderJournal,
  derivePlayerLevel,
  DEBUG_MENU_LABEL,
  DIRECTOR_MENU_LABEL,
  DIRECTOR_MENU_VERB,
  JOURNAL_MENU_LABEL,
  JOURNAL_MENU_VERB,
  type ExtraAction,
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

  // F-2fe4be26 — menuTargetable's ally branch: "offensive entries only
  // against enemy/hostile-tagged targets, support entries only for
  // self/ally/companion". Before this wave nothing ever wrote the
  // 'companion' tag, so a support ability could never list a party member —
  // starter-fantasy's own support abilities (Purify/Divine Light) are
  // self-only and never exercise this branch, so a small ally-targeted
  // ability proves the READ side directly (buildAbilityActions takes any
  // catalog, not just the pack's own).
  it('a recruited companion becomes a valid target for an ally-affiliated support ability (menuTargetable)', () => {
    const engine = createGame(42); // sister-maren starts in the player's own zone (chapel-entrance)
    const recruited = engine.submitAction('recruit', { targetIds: ['sister-maren'] });
    expect(recruited.some((e) => e.type === 'companion.recruited')).toBe(true);

    const healAlly: AbilityDefinition = {
      id: 'test-mend',
      name: 'Mend',
      verb: 'use-ability',
      tags: ['support', 'heal'],
      costs: [],
      target: { type: 'single', affiliation: 'ally' },
      effects: [{ type: 'heal', target: 'target', params: { amount: 3 } }],
    };
    const actions = buildAbilityActions(engine.world, [healAlly]);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain('Mend → Sister Maren');
  });

  it('an UNrecruited friendly NPC is NOT offered as an ally-targeted support target (mere presence in the zone is not enough — recruiting is)', () => {
    const engine = createGame(42); // sister-maren present but never recruited
    const healAlly: AbilityDefinition = {
      id: 'test-mend',
      name: 'Mend',
      verb: 'use-ability',
      tags: ['support', 'heal'],
      costs: [],
      target: { type: 'single', affiliation: 'ally' },
      effects: [{ type: 'heal', target: 'target', params: { amount: 3 } }],
    };
    const actions = buildAbilityActions(engine.world, [healAlly]);
    expect(actions.map((a) => a.label)).not.toContain('Mend → Sister Maren');
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

// F-P9-004: buildSellActions (F-6c3e4fde) had zero direct test coverage.
// Mirrors buildAbilityActions/buildUnlockActions' own coverage above: a real
// engine, a real carried item, a real district/economy read.
describe('buildSellActions (F-6c3e4fde) — trade entries', () => {
  it('lists a carried sellable item as a correctly labeled, parameterized trade entry', () => {
    const engine = createGame(42); // starts at chapel-entrance, inside the chapel-grounds district
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    const actions = buildSellActions(engine.world);
    expect(actions).toEqual([
      { verb: 'sell', targetIds: ['healing-draught'], label: 'Sell healing draught', group: 'trade' },
    ]);
  });

  it('no district/economy at the player\'s zone → no trade entries, even with a sellable item carried', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.zoneId = 'nowhere-zone'; // off the district map entirely
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    expect(buildSellActions(engine.world)).toEqual([]);
  });

  it('sell entries number contiguously in the extras menu, right after ability/unlock — and the numbered entry actually EXECUTES a sale, never an ability', () => {
    const engine = makeDivineCryptGame(); // ready abilities (Holy Smite etc.), inside the crypt-depths district
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick); // Toughened/Keen Eye affordable

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const abilityCount = extras.filter((e) => e.group === 'ability').length;
    const unlockCount = extras.filter((e) => e.group === 'advance').length;
    expect(abilityCount).toBeGreaterThan(0);
    expect(unlockCount).toBeGreaterThan(0);

    // Trade entries land immediately after ability+unlock, no gap and no overlap.
    const tradeIndex = extras.findIndex((e) => e.group === 'trade');
    expect(tradeIndex).toBe(abilityCount + unlockCount);
    expect(extras[tradeIndex]).toMatchObject({ verb: 'sell', label: 'Sell healing draught' });

    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + tradeIndex + 1), {
      log: vi.fn(),
      extras,
    });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'item.sold')).toBe(true);
    // The number resolved to the sale, never to a colliding ability entry.
    expect(engine.world.eventLog.some((e) => e.type === 'ability.used')).toBe(false);
    expect(engine.world.entities['player'].inventory).not.toContain('healing-draught');
  });
});

// F-03f27ace: buildExtraActions' ability/unlock construction ran unguarded on
// every turn — unlike every other per-turn/per-read path in this codebase
// (turns.ts's runNpcTurns, guard.ts's runGuardedAction, director.ts's
// per-section try/catch, this file's own renderInspectorReport). A throw from
// a malformed ability or progression-node definition must degrade to one
// bounded line and contribute no entries from the failing source, not end the
// session on the very next frame render.
describe('buildExtraActions — guarded-degrade on a throwing ability/unlock source (F-03f27ace)', () => {
  it('a throwing ability catalog degrades to one bounded line; unlock/journal/director siblings still render (RED-PROOF: fails pre-fix)', () => {
    const engine = makeDivineCryptGame();
    // Overrides the real ability-core formula with one that blows up —
    // buildAbilityActions (via getAbilityCatalog) is the failure source.
    // { override: true } is the intentional-replacement path (F-09338c0a):
    // ability-core already registered this id during setup, and injecting a
    // throwing double is a deliberate override, not an accidental collision.
    engine.formulas.register(
      ABILITY_CATALOG_FORMULA,
      () => {
        throw new Error('ability catalog blew up\n'.repeat(50)); // multiline + pathological length
      },
      { override: true },
    );
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);
    const log = vi.fn();

    let extras: ExtraAction[] = [];
    expect(() => {
      extras = buildExtraActions(engine, [combatMasteryTree], { log });
    }).not.toThrow();

    // No ability entries — the failing source contributes nothing...
    expect(extras.some((e) => e.group === 'ability')).toBe(false);
    // ...but unlock/journal/director still build normally (siblings survive).
    expect(extras.some((e) => e.group === 'advance')).toBe(true);
    expect(extras.some((e) => e.group === 'journal')).toBe(true);
    expect(extras.some((e) => e.group === 'director')).toBe(true);

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('ability catalog blew up');
    expect(line.length).toBeLessThan(320); // bounded (describeActionError caps the reason at 240) — no raw multiline stack
  });

  it('a throwing unlock computation degrades to one bounded line; ability/journal/director siblings still render', () => {
    const engine = makeDivineCryptGame(); // Holy Smite etc. are ready
    const brokenTree = {
      ...combatMasteryTree,
      // buildUnlockActions iterates tree.nodes — non-array throws immediately.
      nodes: null as unknown as typeof combatMasteryTree.nodes,
    };
    const log = vi.fn();

    let extras: ExtraAction[] = [];
    expect(() => {
      extras = buildExtraActions(engine, [brokenTree], { log });
    }).not.toThrow();

    expect(extras.some((e) => e.group === 'ability')).toBe(true);
    expect(extras.some((e) => e.group === 'advance')).toBe(false);
    expect(extras.some((e) => e.group === 'journal')).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('advancement menu unavailable');
  });

  it('control: no throw means both real sources still contribute exactly as before', () => {
    const engine = makeDivineCryptGame();
    addCurrency(engine.store.state, 'player', 'xp', 20, engine.tick);
    const log = vi.fn();
    const extras = buildExtraActions(engine, [combatMasteryTree], { log });
    expect(extras.some((e) => e.group === 'ability')).toBe(true);
    expect(extras.some((e) => e.group === 'advance')).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });
});

// P8-PS-005: extras render through terminal-ui's frame seam now
// (renderFullScreen's `extraActions` option — see renderer.test.ts for the
// layout pins: inside the closing rule, one shared number width). These tests
// pin the CLI half: the numbers the frame renders are exactly the numbers
// parseExtraSelection resolves.
describe('extras in the frame + parseExtraSelection (F1d / P8-PS-005)', () => {
  const extras: ExtraAction[] = [
    { verb: 'use-ability', parameters: { abilityId: 'a' }, label: 'Alpha', group: 'ability' },
    { verb: 'unlock', parameters: { treeId: 't', nodeId: 'n' }, label: 'Beta', group: 'advance' },
  ];

  it('the frame numbers extras as a continuation of the base menu, inside the closing rule', () => {
    const engine = makeDivineCryptGame();
    const base = buildActionList(engine.world).length;
    const screen = renderFullScreen(engine.world, [], { color: false, extraActions: extras });
    expect(screen).toMatch(new RegExp(`\\[\\s*${base + 1}\\] Alpha`));
    expect(screen).toMatch(new RegExp(`\\[\\s*${base + 2}\\] Beta`));
    const lines = screen.split('\n');
    expect(lines[lines.length - 1]).toBe('─'.repeat(SCREEN_WIDTH));
    expect(lines[lines.length - 2]).toContain('Beta'); // nothing below the extras but the closer
  });

  it('parses only numbers inside the extras range', () => {
    expect(parseExtraSelection('7', 6, extras)).toBe(extras[0]);
    expect(parseExtraSelection('8', 6, extras)).toBe(extras[1]);
    expect(parseExtraSelection('6', 6, extras)).toBeNull(); // base menu's number
    expect(parseExtraSelection('9', 6, extras)).toBeNull(); // beyond range
    expect(parseExtraSelection('attack', 6, extras)).toBeNull();
    expect(parseExtraSelection('7 extra words', 6, extras)).toBeNull();
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
    // Only the always-on player surfaces remain (Journal + Director's
    // Ledger) — no debug entry.
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras).toHaveLength(2);
    expect(extras[0].group).toBe('journal');
    expect(extras[1].group).toBe('director');
    expect(extras.some((e) => e.group === 'debug')).toBe(false);
    expect(buildDebugActions({})).toEqual([]);
    expect(buildDebugActions({ AI_RPG_DEBUG: '0' })).toEqual([]);
  });

  it('AI_RPG_DEBUG=1 appends the debug entry last, and it renders in the frame', () => {
    vi.stubEnv('AI_RPG_DEBUG', '1');
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras).toHaveLength(3); // journal + director (always) + debug (env-gated)
    expect(extras[0].group).toBe('journal');
    expect(extras[1].group).toBe('director');
    expect(extras[2].group).toBe('debug');
    expect(extras[2].label).toBe(DEBUG_MENU_LABEL);

    const base = buildActionList(engine.world).length;
    const screen = renderFullScreen(engine.world, [], { color: false, extraActions: extras });
    expect(screen).toMatch(new RegExp(`\\[\\s*${base + 1}\\] ${JOURNAL_MENU_LABEL}`));
    expect(screen).toMatch(new RegExp(`\\[\\s*${base + 2}\\] ${DIRECTOR_MENU_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(screen).toMatch(new RegExp(`\\[\\s*${base + 3}\\] ${DEBUG_MENU_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
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
    // The Journal (player-personal) reads first; the ledger sits second —
    // parseExtraSelection resolves the same continuation numbers the frame
    // renders (renderer.test.ts pins the rendering half of this contract).
    const selected = parseExtraSelection('8', 6, extras);
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
    const journalIdx = extras.findIndex((e) => e.group === 'journal');
    const directorIdx = extras.findIndex((e) => e.group === 'director');
    const debugIdx = extras.findIndex((e) => e.group === 'debug');
    expect(journalIdx).toBeGreaterThan(0); // abilities/unlocks come first
    expect(debugIdx).toBe(extras.length - 1);
    expect(directorIdx).toBe(debugIdx - 1);
    expect(journalIdx).toBe(directorIdx - 1); // journal, then ledger, then debug
    expect(
      extras.slice(0, journalIdx).every((e) => e.group === 'ability' || e.group === 'advance'),
    ).toBe(true);
  });
});

// F-ENG005-quest-loop-min — the Journal entry: the player's quest book,
// always reachable from the numbered menu, costing no turn.
describe('journal entry (F-ENG005-quest-loop-min)', () => {
  it('the entry is ALWAYS present, its label and sentinel verb pinned', () => {
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const journal = extras.filter((e) => e.group === 'journal');
    expect(journal).toHaveLength(1);
    expect(journal[0].label).toBe(JOURNAL_MENU_LABEL);
    expect(journal[0].verb).toBe(JOURNAL_MENU_VERB);
    expect(buildJournalActions()).toEqual([
      { verb: JOURNAL_MENU_VERB, label: JOURNAL_MENU_LABEL, group: 'journal' },
    ]);
    expect(JOURNAL_MENU_LABEL).toBe('Journal — quests and undertakings');
    expect(JOURNAL_MENU_VERB).toBe('journal');
  });

  it('selecting its number resolves to the journal group (the routing key for bin.ts)', () => {
    const engine = createGame(42);
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const selected = parseExtraSelection('7', 6, extras);
    expect(selected?.group).toBe('journal');
    expect(selected?.verb).toBe(JOURNAL_MENU_VERB);
  });

  it('renders the empty state before the world has asked anything', () => {
    const engine = createGame(42);
    const journal = renderJournal(engine.world);
    expect(journal).toContain('JOURNAL — ACTIVE QUESTS (0) · COMPLETED (0)');
    expect(journal).toContain('Nothing undertaken yet.');
  });

  it('renders an active quest with stage position, progress count, and objectives from live play', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] }); // offers Ashes Below

    let journal = renderJournal(engine.world);
    expect(journal).toContain('JOURNAL — ACTIVE QUESTS (1) · COMPLETED (0)');
    expect(journal).toContain('── Ashes Below ──');
    expect(journal).toContain('Stage 1/2: Cross to the Vestry');
    expect(journal).toContain('• Reach the Vestry Passage');

    engine.submitAction('move', { targetIds: ['vestry-door'] }); // stage 2 begins
    journal = renderJournal(engine.world);
    expect(journal).toContain('Stage 2/2: Lay the Dead to Rest (0/2)');
    expect(journal).toContain('• Destroy two of the risen dead');
  });

  it('lists completed quests by name under the Completed banner', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    // Formatter unit: mark the live instance completed and render.
    engine.store.state.quests['ashes-below'].status = 'completed';
    const journal = renderJournal(engine.world);
    expect(journal).toContain('JOURNAL — ACTIVE QUESTS (0) · COMPLETED (1)');
    expect(journal).toContain('── Completed ──');
    expect(journal).toContain('• Ashes Below');
  });

  it('degrades to raw quest/stage ids when no definitions are registered for the world', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    const foreign = structuredClone(engine.store.state);
    foreign.meta.gameId = 'some-other-pack'; // no registered quest content
    const journal = renderJournal(foreign);
    expect(journal).toContain('── ashes-below ──');
    expect(journal).toContain('Stage: cross-to-the-vestry');
    expect(journal).not.toContain('undefined');
  });

  it('reading the journal never mutates state (a save after rendering is byte-identical)', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    const before = engine.serialize();
    renderJournal(engine.world);
    expect(engine.serialize()).toBe(before);
  });

  // F-470a2a88: renderJournal had no guard around its per-quest-instance
  // processing, unlike its two siblings wired identically in handlePlayerInput's
  // extras dispatch (renderDirectorLedger's per-section try/catch,
  // renderInspectorReport's per-inspector try/catch). A throwing quest-core
  // read (a foreign or content-drifted save) would propagate uncaught through
  // handlePlayerInput into the main interactive loop instead of degrading.
  it('a throwing quest instance degrades to one bounded line instead of crashing renderJournal (RED-PROOF: fails pre-fix)', () => {
    const engine = createGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] }); // real active quest: ashes-below
    const instance = engine.world.quests['ashes-below'];
    // Poison ONE field journalQuestLines reads. `status` stays a normal
    // string so the instance still passes the active-quest filter (that
    // filter is outside this function's own throw surface); `currentStage`
    // throws the moment journalQuestLines reads it — simulating a quest-core
    // read gone bad on drifted content.
    Object.defineProperty(instance, 'currentStage', {
      configurable: true,
      get(): string {
        throw new Error('quest-core read blew up');
      },
    });

    let journal = '';
    expect(() => {
      journal = renderJournal(engine.world);
    }).not.toThrow();
    expect(journal).toContain('  ── ashes-below ──');
    expect(journal).toContain('[quest entry failed:');
    expect(journal).toContain('quest-core read blew up');
  });
});
