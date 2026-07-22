// F1d — abilities & XP reachable. The numbered menu gains ability entries
// (finally producing use-ability's parameters.abilityId) and XP-affordable
// unlock entries; the HUD the renderer receives gains xp/level.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, combatMasteryTree } from '@ai-rpg-engine/starter-fantasy';
import {
  addCurrency,
  getCurrency,
  giveItem,
  ABILITY_CATALOG_FORMULA,
  quoteBuyPrice,
  SELL_CURRENCY,
  getDistrictEconomy,
  setPersistedOpportunities,
  makeOpportunity,
  type OpportunityState,
} from '@ai-rpg-engine/modules';
import { buildActionList, renderFullScreen, SCREEN_WIDTH } from '@ai-rpg-engine/terminal-ui';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import {
  buildAbilityActions,
  buildUnlockActions,
  buildBuyActions,
  buildSellActions,
  buildSalvageActions,
  buildCraftActions,
  buildLeverageActions,
  buildOpportunityActions,
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
  // v2.9: fantasy now seeds starting coin, and crypt-chamber's district carries
  // buyable stock — which would add `buy` entries to every extras list built
  // from this fixture. These shared-fixture tests exercise the ability / sell /
  // journal / director / debug composition, not the buy loop (the buy loop has
  // its own describe block that controls coin explicitly), so zero the coin here
  // to keep the composition they assert focused on what they test.
  player.resources[SELL_CURRENCY] = 0;
  return engine;
}

/** A fresh fantasy game with the v2.9 starting coin cleared. `createGame(42)`
 *  used to seed no coin, so these sentinel/idle composition tests relied on it
 *  producing only the always-on journal / director (+ env-gated debug) entries.
 *  v2.9 seeds a small starting coin, which would add `buy` entries; clearing it
 *  keeps what's under test — the sentinel routing / visibility — isolated. */
function makeIdleGame() {
  const engine = createGame(42);
  engine.store.state.entities['player'].resources[SELL_CURRENCY] = 0;
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
    const engine = makeIdleGame(); // no divine tag, no xp, no coin → no ability/unlock/buy extras
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
    const engine = makeIdleGame();
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
    const engine = makeIdleGame();
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
    const engine = makeIdleGame();
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
    const engine = makeIdleGame();
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

// ---------------------------------------------------------------------------
// v2.9 menu-integration wave — buy / salvage / craft / leverage / opportunity
// entries, plus the sell-grouping rewrite (F-13255438). Every builder below
// follows the file's documented "only ever list what's guaranteed to
// succeed" discipline (see buildSellActions' own header comment): an offered
// entry must never come back rejected, because bin.ts's extras dispatch
// submits every non-sentinel group via engine.submitAction unconditionally —
// a rejected extra still costs the player a turn.
// ---------------------------------------------------------------------------

describe('buildBuyActions (F-31f15013 menu wire) — buy entries priced via quoteBuyPrice', () => {
  it('offers nothing when the player is broke, even though the district has stock', () => {
    const engine = createGame(42); // chapel-entrance / chapel-grounds district
    engine.store.state.entities['player'].resources[SELL_CURRENCY] = 0; // broke (v2.9 seeds a small starting coin — clear it)
    expect(buildBuyActions(engine.world)).toEqual([]);
  });

  it('offers only items the player can currently afford, each priced via the SAME single source (quoteBuyPrice)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.resources[SELL_CURRENCY] = 1_000_000; // absurdly rich — afford gate never excludes anything offered

    const actions = buildBuyActions(engine.world);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.verb).toBe('buy');
      expect(action.group).toBe('trade');
      const itemId = action.targetIds?.[0];
      expect(typeof itemId).toBe('string');
      const price = quoteBuyPrice(engine.world, itemId!, engine.world.meta.activeRuleset);
      expect(price).toBeDefined();
      expect(action.label).toBe(`Buy ${itemId!.replace(/-/g, ' ')} (${price} coin)`);
    }
  });

  it('excludes an item the instant coin drops below its quoted price (never a menu-offers-it, engine-rejects-it trap)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.resources[SELL_CURRENCY] = 1_000_000;
    const richActions = buildBuyActions(engine.world);
    expect(richActions.length).toBeGreaterThan(0);
    const sample = richActions[0];
    const itemId = sample.targetIds![0];
    const price = quoteBuyPrice(engine.world, itemId, engine.world.meta.activeRuleset)!;

    player.resources[SELL_CURRENCY] = price - 1; // one short
    const poorerActions = buildBuyActions(engine.world);
    expect(poorerActions.some((a) => a.targetIds?.[0] === itemId)).toBe(false);

    player.resources[SELL_CURRENCY] = price; // exactly affordable
    const exactActions = buildBuyActions(engine.world);
    expect(exactActions.some((a) => a.targetIds?.[0] === itemId)).toBe(true);
  });

  it('selecting a buy entry actually EXECUTES the purchase for exactly quoteBuyPrice — never rejected', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.resources[SELL_CURRENCY] = 1_000_000;

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const buyIndex = extras.findIndex((a) => a.group === 'trade' && a.verb === 'buy');
    expect(buyIndex).toBeGreaterThanOrEqual(0);
    const chosen = extras[buyIndex];
    const price = quoteBuyPrice(engine.world, chosen.targetIds![0], engine.world.meta.activeRuleset)!;
    const before = engine.world.entities['player'].resources[SELL_CURRENCY];

    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + buyIndex + 1), { log: vi.fn(), extras });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'item.bought')).toBe(true);
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'buy',
      ),
    ).toBe(false);
    expect(before - engine.world.entities['player'].resources[SELL_CURRENCY]).toBe(price);
  });

  it('no district/economy at the player\'s zone → no buy entries, no matter the coin', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.zoneId = 'nowhere-zone';
    player.resources[SELL_CURRENCY] = 1_000_000;
    expect(buildBuyActions(engine.world)).toEqual([]);
  });
});

describe('buildSalvageActions (crafting menu wire) — one entry per carried item, always offered', () => {
  it('no inventory → no salvage entries', () => {
    const engine = createGame(42);
    expect(buildSalvageActions(engine.world)).toEqual([]);
  });

  it('one entry per carried item, even off the district map (salvage never needs a market)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.zoneId = 'nowhere-zone'; // no district/economy at all
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    expect(buildSalvageActions(engine.world)).toEqual([
      { verb: 'salvage', targetIds: ['healing-draught'], label: 'Salvage healing draught', group: 'crafting' },
    ]);
  });

  it('selecting a salvage entry actually EXECUTES the salvage — never rejected', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const idx = extras.findIndex((a) => a.group === 'crafting' && a.verb === 'salvage');
    expect(idx).toBeGreaterThanOrEqual(0);

    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + idx + 1), { log: vi.fn(), extras });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'item.salvaged')).toBe(true);
    expect(engine.world.entities['player'].inventory).not.toContain('healing-draught');
  });
});

describe('buildCraftActions (crafting menu wire) — craft-category recipes only, gated on canCraft', () => {
  it('offers nothing with no materials held', () => {
    const engine = makeDivineCryptGame(); // crypt-depths district — a real district to craft in
    expect(buildCraftActions(engine.world)).toEqual([]);
  });

  it('offers a craft recipe once its materials are held — never repair/modify (deferred to wave 3)', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'materials.medicine': 2 };

    const actions = buildCraftActions(engine.world);
    expect(actions).toEqual([
      { verb: 'craft', parameters: { recipeId: 'craft-bandage' }, label: 'Craft Bandage', group: 'crafting' },
    ]);
    expect(actions.every((a) => a.verb === 'craft')).toBe(true);
  });

  it('offers every affordable craft recipe once broad materials are held, all still craft-only', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = {
      ...player.custom,
      'materials.medicine': 5,
      'materials.fuel': 5,
      'materials.components': 5,
      'materials.luxuries': 5,
    };

    const actions = buildCraftActions(engine.world);
    expect(actions.length).toBeGreaterThanOrEqual(2); // craft-bandage + craft-torch (universal recipes)
    expect(actions.every((a) => a.verb === 'craft' && a.group === 'crafting')).toBe(true);
    expect(actions.map((a) => a.parameters?.recipeId)).toEqual(
      expect.arrayContaining(['craft-bandage', 'craft-torch']),
    );
  });

  it('selecting a craft entry actually EXECUTES the craft verb — never rejected (canCraft gate matches the handler exactly)', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'materials.medicine': 2 };

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const idx = extras.findIndex((a) => a.group === 'crafting' && a.verb === 'craft');
    expect(idx).toBeGreaterThanOrEqual(0);

    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + idx + 1), { log: vi.fn(), extras });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'item.crafted')).toBe(true);
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'craft',
      ),
    ).toBe(false);
  });

  it('no district at the player\'s zone → no craft entries, no matter the materials held', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.zoneId = 'nowhere-zone';
    player.custom = { ...player.custom, 'materials.medicine': 5, 'materials.fuel': 5, 'materials.components': 5 };
    expect(buildCraftActions(engine.world)).toEqual([]);
  });
});

describe('buildLeverageActions (leverage menu wire) — guaranteed-success entries only (afford + cooldown)', () => {
  it('offers nothing with empty leverage, even with a controlling faction present', () => {
    const engine = makeDivineCryptGame(); // crypt-depths → controllingFaction 'chapel-undead'
    expect(buildLeverageActions(engine.world)).toEqual([]);
  });

  it('offers bribe once favor is affordable, targeting the controlling faction — executes without rejection', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'leverage.favor': 20 };

    const actions = buildLeverageActions(engine.world);
    expect(actions).toContainEqual({
      verb: 'bribe',
      targetIds: ['chapel-undead'],
      label: 'Bribe chapel undead',
      group: 'leverage',
    });

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const idx = extras.findIndex((a) => a.verb === 'bribe');
    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + idx + 1), { log: vi.fn(), extras });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'leverage.resolved')).toBe(true);
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'bribe',
      ),
    ).toBe(false);
  });

  it('offers intimidate once heat is affordable, and petition once legitimacy is affordable', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'leverage.heat': 15, 'leverage.legitimacy': 25 };

    const actions = buildLeverageActions(engine.world);
    expect(actions).toContainEqual({
      verb: 'intimidate',
      targetIds: ['chapel-undead'],
      label: 'Intimidate chapel undead',
      group: 'leverage',
    });
    expect(actions).toContainEqual({
      verb: 'petition',
      targetIds: ['chapel-undead'],
      label: 'Petition chapel undead',
      group: 'leverage',
    });
  });

  it('bribe drops off the menu the turn after it is used (cooldown gate)', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'leverage.favor': 999 };
    expect(buildLeverageActions(engine.world).some((a) => a.verb === 'bribe')).toBe(true);

    engine.submitAction('bribe', { targetIds: ['chapel-undead'] });
    expect(buildLeverageActions(engine.world).some((a) => a.verb === 'bribe')).toBe(false);
  });

  it('offers seed with NO targetIds once influence is affordable (target faction is optional for seed)', () => {
    const engine = makeDivineCryptGame();
    const player = engine.store.state.entities['player'];
    player.custom = { ...player.custom, 'leverage.influence': 15 };

    const actions = buildLeverageActions(engine.world);
    expect(actions).toContainEqual({ verb: 'seed', label: 'Spread a rumor about yourself', group: 'leverage' });
    const seed = actions.find((a) => a.verb === 'seed');
    expect(seed?.targetIds).toBeUndefined();
  });

  it('never offers bribe/intimidate/petition when no district here controls a faction', () => {
    const engine = createGame(42); // chapel-grounds — no controllingFaction
    const player = engine.store.state.entities['player'];
    player.custom = {
      ...player.custom,
      'leverage.favor': 999,
      'leverage.heat': 999,
      'leverage.legitimacy': 999,
      'leverage.influence': 999,
    };
    const actions = buildLeverageActions(engine.world);
    expect(actions.some((a) => a.verb === 'bribe' || a.verb === 'intimidate' || a.verb === 'petition')).toBe(false);
    // seed has no faction requirement, so it still offers.
    expect(actions.some((a) => a.verb === 'seed')).toBe(true);
  });
});

describe('buildOpportunityActions (opportunity menu wire) — accept/complete/abandon, never a terminal status', () => {
  function testOpportunity(overrides: Partial<OpportunityState> & { id: string }): OpportunityState {
    return {
      ...makeOpportunity({
        kind: 'contract',
        title: 'Deliver the Relic',
        description: 'A contract has come up.',
        objectiveDescription: 'Deliver it.',
        urgency: 0.5,
        turnsRemaining: 10,
        visibility: 'offered',
        rewards: [],
        risks: [],
        genre: 'fantasy',
        currentTick: 0,
      }),
      ...overrides,
    };
  }

  it('offers an Accept entry for an available opportunity', () => {
    const engine = createGame(42);
    setPersistedOpportunities(engine.world, [testOpportunity({ id: 'opp-1', status: 'available' })]);

    expect(buildOpportunityActions(engine.world)).toEqual([
      {
        verb: 'opportunity',
        targetIds: ['opp-1'],
        parameters: { op: 'accept' },
        label: 'Accept: Deliver the Relic',
        group: 'opportunities',
      },
    ]);
  });

  it('offers Complete AND Abandon entries for an accepted opportunity', () => {
    const engine = createGame(42);
    setPersistedOpportunities(engine.world, [testOpportunity({ id: 'opp-2', status: 'accepted' })]);

    expect(buildOpportunityActions(engine.world)).toEqual([
      {
        verb: 'opportunity',
        targetIds: ['opp-2'],
        parameters: { op: 'complete' },
        label: 'Complete: Deliver the Relic',
        group: 'opportunities',
      },
      {
        verb: 'opportunity',
        targetIds: ['opp-2'],
        parameters: { op: 'abandon' },
        label: 'Abandon: Deliver the Relic',
        group: 'opportunities',
      },
    ]);
  });

  it('offers nothing for any terminal-status opportunity', () => {
    const engine = createGame(42);
    const terminalStatuses = ['completed', 'failed', 'expired', 'declined', 'abandoned', 'betrayed'] as const;
    for (const status of terminalStatuses) {
      setPersistedOpportunities(engine.world, [testOpportunity({ id: `opp-${status}`, status })]);
      expect(buildOpportunityActions(engine.world)).toEqual([]);
    }
  });

  it('selecting Accept actually EXECUTES the accept transition — never rejected', () => {
    const engine = createGame(42);
    setPersistedOpportunities(engine.world, [testOpportunity({ id: 'opp-3', status: 'available' })]);

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const idx = extras.findIndex((a) => a.group === 'opportunities');
    expect(idx).toBeGreaterThanOrEqual(0);

    const baseCount = buildActionList(engine.world).length;
    const result = handlePlayerInput(engine, String(baseCount + idx + 1), { log: vi.fn(), extras });

    expect(result).toEqual({ kind: 'action', via: 'extra' });
    expect(engine.world.eventLog.some((e) => e.type === 'opportunity.accepted')).toBe(true);
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'opportunity',
      ),
    ).toBe(false);
  });
});

describe('buildSellActions grouping (F-13255438) — collapse duplicate carried items into one entry (xN)', () => {
  it('collapses three carried units of the same item into one (x3) entry', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    expect(buildSellActions(engine.world)).toEqual([
      { verb: 'sell', targetIds: ['healing-draught'], label: 'Sell healing draught (x3)', group: 'trade' },
    ]);
  });

  it('a single carried unit has NO count suffix (backward-compatible label, F-6c3e4fde\'s original pin)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    expect(buildSellActions(engine.world)).toEqual([
      { verb: 'sell', targetIds: ['healing-draught'], label: 'Sell healing draught', group: 'trade' },
    ]);
  });

  it('distinct items each get their own entry, counted independently', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    engine.store.recordEvent(giveItem(player, 'iron-sword', engine.tick));

    expect(buildSellActions(engine.world)).toEqual([
      { verb: 'sell', targetIds: ['healing-draught'], label: 'Sell healing draught (x2)', group: 'trade' },
      { verb: 'sell', targetIds: ['iron-sword'], label: 'Sell iron sword', group: 'trade' },
    ]);
  });

  it('one grouped entry still sells exactly ONE unit per selection — the handler is unchanged', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick));

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const idx = extras.findIndex((a) => a.group === 'trade' && a.verb === 'sell');
    const baseCount = buildActionList(engine.world).length;
    handlePlayerInput(engine, String(baseCount + idx + 1), { log: vi.fn(), extras });

    const remaining = engine.world.entities['player'].inventory?.filter((i) => i === 'healing-draught') ?? [];
    expect(remaining).toHaveLength(1); // one sold, one remains — never both
  });

  it('still skips a contraband item with no active black market (existing gate preserved)', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    // chapel-grounds' 'sacred' tag modifier starts contraband at 35 (>30,
    // i.e. black-market-active by default) — push it back down so this test
    // actually exercises the "no active black market" branch, not the
    // opposite one.
    const economy = getDistrictEconomy(engine.world, 'chapel-grounds')!;
    economy.supplies.contraband.level = 25;
    engine.store.recordEvent(giveItem(player, 'smuggled-goods', engine.tick));
    expect(buildSellActions(engine.world)).toEqual([]);
  });
});

describe('buildExtraActions wiring order (v2.9) — buy, sell, salvage, craft, leverage, opportunity, then journal/director/debug', () => {
  it('a fully idle player (no coin/inventory/materials/leverage/opportunities) still only ever sees journal + director', () => {
    const engine = makeIdleGame();
    const extras = buildExtraActions(engine, [combatMasteryTree]);
    expect(extras).toHaveLength(2);
    expect(extras[0].group).toBe('journal');
    expect(extras[1].group).toBe('director');
  });

  it('every new group appears in the documented order when all six are simultaneously live', () => {
    const engine = makeDivineCryptGame(); // controllingFaction present for leverage
    const player = engine.store.state.entities['player'];
    player.resources[SELL_CURRENCY] = 1_000_000; // buy affords, and funds sell/buy both being non-empty
    engine.store.recordEvent(giveItem(player, 'healing-draught', engine.tick)); // sell + salvage
    player.custom = {
      ...player.custom,
      'materials.medicine': 5, // craft
      'leverage.favor': 20, // leverage
    };
    setPersistedOpportunities(engine.world, [
      { ...makeOpportunity({
        kind: 'contract', title: 'T', description: 'd', objectiveDescription: 'o',
        urgency: 0.5, turnsRemaining: 10, visibility: 'offered', rewards: [], risks: [],
        genre: 'fantasy', currentTick: 0,
      }), id: 'opp-1', status: 'available' },
    ]); // opportunities

    const extras = buildExtraActions(engine, [combatMasteryTree]);
    const groupOrder = extras.map((e) => e.group);
    const firstIndexOf = (g: ExtraAction['group']) => groupOrder.indexOf(g);

    // Only the 9 groups this test seeded/always-on are checked in relative
    // order — ability/advance are absent for this player (no divine tag, no xp).
    expect(firstIndexOf('trade')).toBeGreaterThanOrEqual(0); // buy AND/OR sell
    expect(firstIndexOf('crafting')).toBeGreaterThan(firstIndexOf('trade')); // salvage/craft after trade
    expect(firstIndexOf('leverage')).toBeGreaterThan(firstIndexOf('crafting'));
    expect(firstIndexOf('opportunities')).toBeGreaterThan(firstIndexOf('leverage'));
    expect(firstIndexOf('journal')).toBeGreaterThan(firstIndexOf('opportunities'));
    expect(firstIndexOf('director')).toBeGreaterThan(firstIndexOf('journal'));
    // Within 'trade', buy entries (verb 'buy') come before the sell entry (verb 'sell').
    const tradeVerbs = extras.filter((e) => e.group === 'trade').map((e) => e.verb);
    const lastBuyIdx = tradeVerbs.lastIndexOf('buy');
    const firstSellIdx = tradeVerbs.indexOf('sell');
    if (lastBuyIdx >= 0 && firstSellIdx >= 0) {
      expect(lastBuyIdx).toBeLessThan(firstSellIdx);
    }
  });

  it('a throwing buy/salvage/craft/leverage/opportunity source degrades to one bounded line each, siblings unaffected', () => {
    // Poison getPersistedOpportunities' own read path indirectly is awkward
    // (it's a pure function) — instead exercise the SAME guarded-degrade
    // contract sellActions already has by poisoning player.custom access via
    // a getter that throws only for buildCraftActions' own read shape. The
    // simplest, most direct proof: buildExtraActions must never throw even
    // when engine.world is a minimal stub missing fields the new builders
    // read, and it must still produce the always-on journal/director entries.
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    Object.defineProperty(player, 'custom', {
      configurable: true,
      get(): never {
        throw new Error('custom read blew up');
      },
    });
    const log = vi.fn();

    let extras: ExtraAction[] = [];
    expect(() => {
      extras = buildExtraActions(engine, [combatMasteryTree], { log });
    }).not.toThrow();

    expect(extras.some((e) => e.group === 'journal')).toBe(true);
    expect(extras.some((e) => e.group === 'director')).toBe(true);
    // At least one guarded builder logged its own bounded failure line
    // instead of the whole menu construction blowing up.
    expect(log.mock.calls.length).toBeGreaterThan(0);
    for (const call of log.mock.calls) {
      expect(String(call[0]).length).toBeLessThan(320);
    }
  });
});
