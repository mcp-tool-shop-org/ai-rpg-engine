import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAuditContent, loadAuditContentFile, buildContentAuditReport } from './audit-content.js';

// V3-DIR-2: `ai-rpg-engine audit-content <file.json>` is a DEV tool exposing six
// content-audit format*ForDirector formatters (combat-roles.ts's
// formatEncounterForDirector; combat-summary.ts's formatEncounterDetailForDirector /
// formatBossProfileForDirector / formatCombatSummaryForDirector /
// formatRegionCombatForDirector / formatAuditForDirector) that renderDirectorLedger
// (the PLAYER-facing Ledger) never reads. Mirrors validate.test.ts's harness and the
// runValidate/runProfile/runInspectSave "return the exit code, accept an injected
// logger" contract.

function capture() {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines, text: () => lines.join('\n') };
}

describe('runAuditContent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-audit-content-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name: string, contents: unknown): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf-8');
    return p;
  }

  // ---------------------------------------------------------------------
  // Usage / boundary errors — mirrors validate.test.ts's boundary coverage
  // ---------------------------------------------------------------------

  it('--help prints audit-content usage and exits 0', () => {
    const out = capture();
    const code = runAuditContent(['--help'], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text().toLowerCase()).toContain('audit-content');
    expect(out.text()).toContain('entities');
  });

  it('exits nonzero with usage when no file argument is given', () => {
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/usage|file|provide/);
  });

  it('exits nonzero with a structured error when the file is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([path.join(tmpDir, 'nope.json')], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/read|not found|exist|file/);
  });

  it('exits nonzero with a structured error when the JSON is malformed', () => {
    const file = writeFile('broken.json', '{ "entities": [ ');
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('json');
  });

  it('exits nonzero when the top-level value is not a plain object', () => {
    const file = writeFile('array.json', ['not', 'an', 'object']);
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('plain object');
  });

  it('exits nonzero when "entities" is missing or empty', () => {
    const file = writeFile('no-entities.json', { entities: [] });
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('entities');
  });

  it('exits nonzero when "encounters" is present but not an array', () => {
    const file = writeFile('bad-encounters.json', {
      entities: [{ id: 'hero', tags: ['player'] }],
      encounters: { not: 'an array' },
    });
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('encounters');
  });

  it('exits nonzero when an entity is missing a non-empty string id', () => {
    const file = writeFile('bad-entity.json', { entities: [{ name: 'Nameless' }] });
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text())).toContain('entities[0]');
  });

  it('exits nonzero when no player entity resolves (no playerId, no "player" tag)', () => {
    const file = writeFile('no-player.json', {
      entities: [{ id: 'goblin', tags: ['enemy'] }],
    });
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('player');
  });

  it('exits nonzero when an explicit playerId does not match any supplied entity', () => {
    const file = writeFile('bad-player-id.json', {
      entities: [{ id: 'goblin', tags: ['enemy'] }],
      playerId: 'nonexistent',
    });
    const out = capture();
    const errOut = capture();
    const code = runAuditContent([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text())).toContain('nonexistent');
  });

  it('uses the default console logger when no deps are injected (no throw)', () => {
    const file = writeFile('minimal.json', { entities: [{ id: 'hero', tags: ['player'] }] });
    expect(() => {
      const code = runAuditContent([file]);
      expect(code).toBe(0);
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Minimal success: entities-only input degrades gracefully (no invented
  // regions/bosses/encounters), mirroring director.ts's own Rule 1.
  // ---------------------------------------------------------------------

  it('a minimal (entities-only) file loads and reports zeroed SUMMARY/PROJECT AUDIT with no invented sections', () => {
    const file = writeFile('minimal.json', {
      entities: [{ id: 'hero', tags: ['player'], stats: { vigor: 5 }, resources: { hp: 20, maxHp: 20 } }],
    });
    const out = capture();
    const code = runAuditContent([file], { log: out.log, error: out.log });
    expect(code).toBe(0);

    const text = out.text();
    expect(text).toContain('CONTENT AUDIT REPORT');
    expect(text).toContain('Entities: 1 | Encounters: 0 | Boss defs: 0 | Districts: 0');
    expect(text).toContain('Combat Content Summary');
    expect(text).toContain('  Encounters: 0');
    expect(text).toContain('Combat Audit: 0 encounters, 0 warnings, 0 advisories');
    // No invented sections for content that was never supplied.
    expect(text).not.toContain('REGIONS');
    expect(text).not.toContain('ENCOUNTER ANALYSIS');
    expect(text).not.toContain('ENCOUNTER DETAIL');
    expect(text).not.toContain('BOSSES');
  });

  it('auto-resolves the player from a "player"-tagged entity when playerId is omitted', () => {
    const file = writeFile('auto-player.json', {
      entities: [
        { id: 'goblin', tags: ['enemy'] },
        { id: 'wanderer', tags: ['player'] },
      ],
    });
    const loaded = loadAuditContentFile(file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.player.id).toBe('wanderer');
  });

  // ---------------------------------------------------------------------
  // Full sample pack: exercises all six content-audit formatters end to end.
  // ---------------------------------------------------------------------

  function samplePack() {
    return {
      entities: [
        { id: 'hero', name: 'Hero', tags: ['player'], stats: { vigor: 5, instinct: 4, will: 3 }, resources: { hp: 20, maxHp: 20 } },
        { id: 'goblin-1', name: 'Goblin', tags: ['enemy', 'role:skirmisher'], stats: { vigor: 2 }, resources: { hp: 6 } },
        { id: 'goblin-2', name: 'Goblin', tags: ['enemy', 'role:skirmisher'], stats: { vigor: 2 }, resources: { hp: 6 } },
        { id: 'goblin-3', name: 'Goblin', tags: ['enemy', 'role:skirmisher'], stats: { vigor: 2 }, resources: { hp: 6 } },
        { id: 'bandit-king', name: 'Bandit King', tags: ['enemy', 'role:boss'], stats: { vigor: 6 }, resources: { hp: 30, maxHp: 30 } },
        { id: 'bandit-thug', name: 'Bandit Thug', tags: ['enemy', 'role:minion'], stats: { vigor: 2 }, resources: { hp: 8 } },
      ],
      encounters: [
        {
          id: 'goblin-ambush',
          name: 'Goblin Ambush',
          composition: 'patrol',
          validZoneIds: ['forest-path'],
          participants: [
            { entityId: 'goblin-1', role: 'skirmisher' },
            { entityId: 'goblin-2', role: 'skirmisher' },
            { entityId: 'goblin-3', role: 'skirmisher' },
          ],
        },
        {
          id: 'bandit-showdown',
          name: 'Bandit Showdown',
          composition: 'boss-fight',
          validZoneIds: ['bandit-camp'],
          participants: [
            { entityId: 'bandit-king', role: 'boss' },
            { entityId: 'bandit-thug', role: 'minion' },
          ],
        },
      ],
      bossDefinitions: [
        {
          entityId: 'bandit-king',
          phases: [{ hpThreshold: 0.5, narrativeKey: 'enraged', addTags: ['enraged'] }],
        },
      ],
      districts: [{ id: 'wilds', name: 'The Wilds', zoneIds: ['forest-path', 'bandit-camp'], tags: ['frontier'] }],
    };
  }

  it('renders all six sections for a full sample pack, with real (not invented) content', () => {
    const file = writeFile('sample.json', samplePack());
    const out = capture();
    const code = runAuditContent([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text();

    // Counts line
    expect(text).toContain('Entities: 6 | Encounters: 2 | Boss defs: 1 | Districts: 1');

    // 1. SUMMARY — summarizeCombatContent -> formatCombatSummaryForDirector
    expect(text).toContain('Combat Content Summary');
    expect(text).toContain('  Encounters: 2');
    expect(text).toContain('  Unique entities: 5');
    expect(text).toContain('  Avg participants: 2.5');
    expect(text).toContain('    skirmisher: 3');
    expect(text).toContain('    boss: 1');
    expect(text).toContain('    minion: 1');
    expect(text).toContain('    patrol: 1');
    expect(text).toContain('    boss-fight: 1');
    expect(text).toContain('Bandit King in "Bandit Showdown"');
    expect(text).toContain("Role 'skirmisher' is used in 3/5 assignments (>50%)");

    // 2. PROJECT AUDIT — auditProjectCombat -> formatAuditForDirector
    expect(text).toContain('Combat Audit: 2 encounters, 1 warnings, 2 advisories');
    expect(text).toContain("All 3 participants have role 'skirmisher' — consider varying roles");
    expect(text).toContain("Role 'skirmisher' represents 3/5 assignments (>50%) — consider diversifying");

    // 3. REGIONS — summarizeRegionCombat -> formatRegionCombatForDirector
    expect(text).toContain('-- REGIONS --');
    expect(text).toContain('Region: The Wilds (wilds)');
    expect(text).toContain('Dominant roles: skirmisher, boss');

    // 4. ENCOUNTER ANALYSIS — analyzeEncounter -> formatEncounterForDirector
    expect(text).toContain('-- ENCOUNTER ANALYSIS --');
    expect(text).toContain('Encounter: Goblin Ambush (goblin-ambush)');
    expect(text).toContain('Encounter: Bandit Showdown (bandit-showdown)');
    expect(text).toContain('All participants have the same role: skirmisher');

    // 5. ENCOUNTER DETAIL — buildEncounterDetail -> formatEncounterDetailForDirector
    expect(text).toContain('-- ENCOUNTER DETAIL --');
    expect(text).toContain('District: The Wilds');

    // 6. BOSSES — getEncounterBosses -> formatBossProfileForDirector
    expect(text).toContain('-- BOSSES --');
    expect(text).toContain('Boss: Bandit King (bandit-king)');
    expect(text).toContain('Standard boss encounter');
    expect(text).toContain('Current HP: 100%');
    expect(text).toContain('@50% HP → enraged +[enraged]');
  });

  it('gates BOSSES off when bossDefinitions is supplied but no encounter participant matches it', () => {
    const file = writeFile('no-boss-match.json', {
      ...samplePack(),
      bossDefinitions: [{ entityId: 'nobody-here', phases: [{ hpThreshold: 0.5, narrativeKey: 'x' }] }],
    });
    const out = capture();
    const code = runAuditContent([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).not.toContain('-- BOSSES --');
  });

  it('gates REGIONS off when no districts are supplied, even with real encounters', () => {
    const { districts: _omit, ...noDistricts } = samplePack();
    const file = writeFile('no-districts.json', noDistricts);
    const out = capture();
    const code = runAuditContent([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).not.toContain('-- REGIONS --');
  });

  it('buildContentAuditReport is a pure function of its input (deterministic, byte-identical on repeat calls)', () => {
    const file = writeFile('sample2.json', samplePack());
    const loaded = loadAuditContentFile(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const first = buildContentAuditReport(loaded);
    const second = buildContentAuditReport(loaded);
    expect(first).toBe(second);
  });
});
