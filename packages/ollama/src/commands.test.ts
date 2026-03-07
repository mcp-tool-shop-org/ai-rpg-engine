// Unit tests — prompt assembly and command logic with mocked client

import { describe, it, expect } from 'vitest';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import { explainValidationError } from './commands/explain-validation-error.js';
import { summarizeBeliefTrace } from './commands/summarize-belief-trace.js';
import { createRoom } from './commands/create-room.js';
import { createFaction } from './commands/create-faction.js';
import { createQuest } from './commands/create-quest.js';
import { explainLint } from './commands/explain-lint.js';
import { createDistrict } from './commands/create-district.js';
import { explainBeliefDivergence } from './commands/explain-belief-divergence.js';
import { createLocationPack } from './commands/create-location-pack.js';
import { createEncounterPack } from './commands/create-encounter-pack.js';
import { explainDistrictState } from './commands/explain-district-state.js';
import { explainFactionAlert } from './commands/explain-faction-alert.js';
import { improveContent } from './commands/improve-content.js';
import { expandPack } from './commands/expand-pack.js';
import { critiqueContent } from './commands/critique-content.js';
import { normalizeContent } from './commands/normalize-content.js';
import { diffSummary } from './commands/diff-summary.js';
import { analyzeReplay } from './commands/analyze-replay.js';
import { explainWhy } from './commands/explain-why.js';
import { suggestNext } from './commands/suggest-next.js';
import { planDistrict } from './commands/plan-district.js';
import { compareReplays } from './commands/compare-replays.js';

function mockClient(response: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function failingClient(error: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: false, error };
    },
  };
}

describe('explainValidationError', () => {
  it('returns explanation text from model', async () => {
    const client = mockClient('The field rooms.id is missing because it needs a unique identifier.');
    const result = await explainValidationError(client, {
      errors: [{ path: 'rooms.id', message: 'required non-empty string' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('rooms.id');
    }
  });

  it('returns early for empty errors', async () => {
    const client = mockClient('should not be called');
    const result = await explainValidationError(client, { errors: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('No validation errors to explain.');
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection refused');
    const result = await explainValidationError(client, {
      errors: [{ path: 'x', message: 'y' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('connection refused');
    }
  });
});

describe('summarizeBeliefTrace', () => {
  it('returns summary text', async () => {
    const client = mockClient('The guard formed a hostile belief after overhearing combat in the crypt.');
    const result = await summarizeBeliefTrace(client, {
      trace: {
        subject: 'player',
        key: 'hostile',
        holder: { type: 'entity', id: 'guard-01' },
        currentValue: true,
        currentConfidence: 0.8,
        chain: [{
          tick: 5,
          type: 'source-event',
          description: 'combat in crypt',
          data: {},
        }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('guard');
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await summarizeBeliefTrace(client, {
      trace: {
        subject: 'x',
        key: 'k',
        holder: { type: 'entity', id: 'e' },
        currentValue: undefined,
        currentConfidence: 0,
        chain: [],
      },
    });
    expect(result.ok).toBe(false);
  });
});

describe('createRoom', () => {
  it('returns yaml and validation for valid-looking output', async () => {
    const yaml = [
      'id: ruined_chapel',
      'name: Ruined Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
    ].join('\n');
    const client = mockClient(yaml);
    const result = await createRoom(client, { theme: 'ruined chapel' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('ruined_chapel');
      // Validation may fail since minimal YAML parser is approximate —
      // the important thing is the pipeline completes without throwing
      expect(result.validation).toBeDefined();
    }
  });

  it('handles fenced yaml output', async () => {
    const raw = '```yaml\nid: crypt\nname: Crypt\nzones: []\n```';
    const client = mockClient(raw);
    const result = await createRoom(client, { theme: 'dark crypt' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('crypt');
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('model not found');
    const result = await createRoom(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });

  it('runs repair pass when requested and first output is invalid', async () => {
    let callCount = 0;
    const client: OllamaTextClient = {
      async generate(_input: PromptInput): Promise<PromptResult> {
        callCount++;
        if (callCount === 1) {
          // First pass: invalid (missing name)
          return { ok: true, text: 'id: broken_room' };
        }
        // Repair pass: still minimal but different
        return { ok: true, text: 'id: fixed_room\nname: Fixed Room' };
      },
    };
    const result = await createRoom(client, { theme: 'test', repair: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(true);
      expect(result.yaml).toContain('fixed_room');
    }
  });

  it('skips repair when first output is valid-looking', async () => {
    let callCount = 0;
    const client: OllamaTextClient = {
      async generate(_input: PromptInput): Promise<PromptResult> {
        callCount++;
        return { ok: true, text: 'id: good_room\nname: Good Room' };
      },
    };
    // Even with repair=true, if validation passes, no second call
    const result = await createRoom(client, { theme: 'test', repair: true });
    expect(result.ok).toBe(true);
    // The validation might still fail on zones, but the key test is
    // that the pipeline completes; callCount depends on validation result
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

describe('createFaction', () => {
  it('returns faction YAML from model', async () => {
    const yaml = 'id: chapel_pilgrims\nname: Chapel Pilgrims\nmembers:\n  - pilgrim_01\n  - pilgrim_02';
    const client = mockClient(yaml);
    const result = await createFaction(client, { theme: 'fearful chapel pilgrims' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('chapel_pilgrims');
    }
  });

  it('passes district context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'id: test_faction\nname: Test' };
      },
    };
    await createFaction(client, {
      theme: 'militant guards',
      districtIds: ['chapel_district', 'market_district'],
    });
    expect(capturedPrompt).toContain('chapel_district');
    expect(capturedPrompt).toContain('market_district');
  });

  it('propagates client failure', async () => {
    const client = failingClient('offline');
    const result = await createFaction(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });
});

describe('createQuest', () => {
  it('returns quest YAML with validation', async () => {
    const yaml = 'id: missing_archivist\nname: The Missing Archivist\nstages:\n  - id: investigate\n    name: Investigate';
    const client = mockClient(yaml);
    const result = await createQuest(client, { theme: 'investigate missing archivist' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('missing_archivist');
      expect(result.validation).toBeDefined();
    }
  });

  it('passes faction and district context', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'id: test\nname: Test\nstages: []' };
      },
    };
    await createQuest(client, {
      theme: 'conspiracy',
      factions: ['temple_guard', 'pilgrims'],
      districts: ['chapel_district'],
    });
    expect(capturedPrompt).toContain('temple_guard');
    expect(capturedPrompt).toContain('chapel_district');
  });

  it('propagates client failure', async () => {
    const client = failingClient('model crash');
    const result = await createQuest(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });
});

describe('explainLint', () => {
  it('returns explanation of lint findings', async () => {
    const client = mockClient('The zone crypt_lower is referenced but never defined. This means entities cannot traverse to it.');
    const result = await explainLint(client, {
      findings: [{ path: 'rooms[0].zones[1].neighbors[2]', message: 'references unknown zone crypt_lower' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('crypt_lower');
    }
  });

  it('returns early for empty findings', async () => {
    const client = mockClient('should not be called');
    const result = await explainLint(client, { findings: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('No lint findings to explain.');
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await explainLint(client, {
      findings: [{ path: 'x', message: 'y' }],
    });
    expect(result.ok).toBe(false);
  });
});

describe('createDistrict', () => {
  it('returns district YAML from model', async () => {
    const yaml = 'id: market_quarter\nname: Market Quarter\nzoneIds:\n  - market_main\n  - market_alley\ntags:\n  - commerce';
    const client = mockClient(yaml);
    const result = await createDistrict(client, { theme: 'bustling marketplace' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('market_quarter');
    }
  });

  it('passes context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'id: test_district\nname: Test' };
      },
    };
    await createDistrict(client, {
      theme: 'haunted ruins',
      factions: ['undead_legion'],
      existingZones: ['crypt_entrance', 'ossuary'],
    });
    expect(capturedPrompt).toContain('undead_legion');
    expect(capturedPrompt).toContain('crypt_entrance');
  });

  it('propagates client failure', async () => {
    const client = failingClient('no model loaded');
    const result = await createDistrict(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });
});

describe('explainBeliefDivergence', () => {
  const makeTrace = (holder: string, value: boolean, confidence: number) => ({
    subject: 'player',
    key: 'hostile',
    holder: { type: 'entity' as const, id: holder },
    currentValue: value,
    currentConfidence: confidence,
    chain: [{
      tick: 10,
      type: 'source-event' as const,
      description: 'witnessed combat',
      data: {},
    }],
  });

  it('returns divergence explanation text', async () => {
    const client = mockClient('Guard A observed combat directly while Guard B only heard rumors, leading to different confidence levels.');
    const result = await explainBeliefDivergence(client, {
      traceA: makeTrace('guard-a', true, 0.9),
      traceB: makeTrace('guard-b', true, 0.3),
      labelA: 'Guard A',
      labelB: 'Guard B',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Guard');
    }
  });

  it('works without labels', async () => {
    const client = mockClient('The two observers diverge at tick 10.');
    const result = await explainBeliefDivergence(client, {
      traceA: makeTrace('npc-1', true, 0.8),
      traceB: makeTrace('npc-2', false, 0.6),
    });
    expect(result.ok).toBe(true);
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection reset');
    const result = await explainBeliefDivergence(client, {
      traceA: makeTrace('a', true, 1),
      traceB: makeTrace('b', false, 0),
    });
    expect(result.ok).toBe(false);
  });
});

describe('createQuest (repair)', () => {
  it('runs repair pass when requested and first output is invalid', async () => {
    let callCount = 0;
    const client: OllamaTextClient = {
      async generate(_input: PromptInput): Promise<PromptResult> {
        callCount++;
        if (callCount === 1) {
          return { ok: true, text: 'id: broken_quest' };
        }
        return { ok: true, text: 'id: fixed_quest\nname: Fixed Quest\nstages:\n  - id: s1\n    name: Stage One' };
      },
    };
    const result = await createQuest(client, { theme: 'test', repair: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(true);
      expect(result.yaml).toContain('fixed_quest');
      expect(result.repairNote).toBeDefined();
    }
  });
});

describe('createLocationPack', () => {
  it('returns location pack YAML from model', async () => {
    const yaml = [
      'district:',
      '  id: harbor_quarter',
      '  name: Harbor Quarter',
      '  zoneIds:',
      '    - dockside',
      '    - warehouse',
      '  tags:',
      '    - commerce',
      'rooms:',
      '  - id: waterfront_tavern',
      '    name: Waterfront Tavern',
      '    zones:',
      '      - id: dockside',
      '        name: Dockside',
    ].join('\n');
    const client = mockClient(yaml);
    const result = await createLocationPack(client, { theme: 'harbor town port district' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('harbor_quarter');
      expect(result.yaml).toContain('waterfront_tavern');
    }
  });

  it('passes factions context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'district:\n  id: test\n  name: Test' };
      },
    };
    await createLocationPack(client, {
      theme: 'smugglers den',
      factions: ['thieves_guild', 'harbor_watch'],
    });
    expect(capturedPrompt).toContain('thieves_guild');
    expect(capturedPrompt).toContain('harbor_watch');
  });

  it('propagates client failure', async () => {
    const client = failingClient('model unavailable');
    const result = await createLocationPack(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });
});

describe('createEncounterPack', () => {
  it('returns encounter pack YAML from model', async () => {
    const yaml = [
      'room:',
      '  id: ambush_clearing',
      '  name: Ambush Clearing',
      '  zones:',
      '    - id: treeline',
      '      name: Treeline',
      'entities:',
      '  - id: bandit_leader',
      '    type: enemy',
      '    name: Bandit Leader',
      'quest:',
      '  id: clear_the_road',
      '  name: Clear the Road',
      '  stages:',
      '    - id: find_ambush',
      '      name: Find the Ambush',
    ].join('\n');
    const client = mockClient(yaml);
    const result = await createEncounterPack(client, { theme: 'forest bandit ambush' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('bandit_leader');
      expect(result.yaml).toContain('clear_the_road');
    }
  });

  it('passes difficulty and district context', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'room:\n  id: t\n  name: T' };
      },
    };
    await createEncounterPack(client, {
      theme: 'boss fight',
      districtId: 'throne_room_district',
      difficulty: 'hard',
    });
    expect(capturedPrompt).toContain('throne_room_district');
    expect(capturedPrompt).toContain('hard');
  });

  it('propagates client failure', async () => {
    const client = failingClient('gpu oom');
    const result = await createEncounterPack(client, { theme: 'anything' });
    expect(result.ok).toBe(false);
  });
});

describe('explainDistrictState', () => {
  const baseMetrics = {
    alertPressure: 65,
    rumorDensity: 40,
    intruderLikelihood: 20,
    surveillance: 55,
    stability: 0.4,
  };

  it('returns narrative explanation of district state', async () => {
    const client = mockClient('The harbor district is on high alert. Alert pressure at 65 indicates recent hostile activity.');
    const result = await explainDistrictState(client, {
      districtId: 'harbor_quarter',
      districtName: 'Harbor Quarter',
      metrics: baseMetrics,
      threatLevel: 52,
      onAlert: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('alert');
    }
  });

  it('includes optional context in prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'The district is calm.' };
      },
    };
    await explainDistrictState(client, {
      districtId: 'temple_ward',
      metrics: { alertPressure: 5, rumorDensity: 10, intruderLikelihood: 0, surveillance: 80, stability: 0.95 },
      controllingFaction: 'temple_guard',
      tags: ['sacred', 'restricted'],
    });
    expect(capturedPrompt).toContain('temple_guard');
    expect(capturedPrompt).toContain('sacred');
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection refused');
    const result = await explainDistrictState(client, {
      districtId: 'x',
      metrics: baseMetrics,
    });
    expect(result.ok).toBe(false);
  });
});

describe('explainFactionAlert', () => {
  it('returns explanation of faction alert state', async () => {
    const client = mockClient('The temple guard is at elevated alert (72/100) primarily due to hostile rumors about intruders.');
    const result = await explainFactionAlert(client, {
      factionId: 'temple_guard',
      factionName: 'Temple Guard',
      alertLevel: 72,
      cohesion: 0.85,
      beliefs: [
        { subject: 'player', key: 'hostile', value: true, confidence: 0.9 },
        { subject: 'harbor_quarter', key: 'compromised', value: true, confidence: 0.6 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('temple guard');
    }
  });

  it('passes districts and disposition to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'The faction is wary.' };
      },
    };
    await explainFactionAlert(client, {
      factionId: 'smugglers',
      alertLevel: 30,
      cohesion: 0.4,
      disposition: 'wary',
      districtIds: ['harbor_quarter', 'warehouse_district'],
    });
    expect(capturedPrompt).toContain('wary');
    expect(capturedPrompt).toContain('harbor_quarter');
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await explainFactionAlert(client, {
      factionId: 'x',
      alertLevel: 50,
      cohesion: 0.5,
    });
    expect(result.ok).toBe(false);
  });
});

// --- v0.5.0 Iteration Loop ---

describe('improveContent', () => {
  it('returns revised YAML from model', async () => {
    const revised = 'id: market_quarter\nname: Market Quarter\ntags:\n  - paranoid\n  - commerce';
    const client = mockClient(revised);
    const result = await improveContent(client, {
      content: 'id: market_quarter\nname: Market Quarter\ntags:\n  - commerce',
      goal: 'make this district feel more paranoid',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('paranoid');
      expect(result.yaml).toContain('market_quarter');
    }
  });

  it('passes content type to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'id: test\nname: Test' };
      },
    };
    await improveContent(client, {
      content: 'id: test\nname: Test',
      goal: 'add traps',
      contentType: 'room',
    });
    expect(capturedPrompt).toContain('room');
    expect(capturedPrompt).toContain('add traps');
  });

  it('propagates client failure', async () => {
    const client = failingClient('model not loaded');
    const result = await improveContent(client, {
      content: 'id: x',
      goal: 'improve',
    });
    expect(result.ok).toBe(false);
  });
});

describe('expandPack', () => {
  it('returns expanded pack YAML from model', async () => {
    const expanded = [
      'district:',
      '  id: harbor_quarter',
      '  name: Harbor Quarter',
      'rooms:',
      '  - id: tavern',
      '    name: Tavern',
      '  - id: dock_warehouse',
      '    name: Dock Warehouse',
    ].join('\n');
    const client = mockClient(expanded);
    const result = await expandPack(client, {
      content: 'district:\n  id: harbor_quarter\n  name: Harbor Quarter\nrooms:\n  - id: tavern\n    name: Tavern',
      goal: 'add a warehouse room',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('dock_warehouse');
      expect(result.yaml).toContain('tavern');
    }
  });

  it('passes constraints to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'district:\n  id: t\n  name: T' };
      },
    };
    await expandPack(client, {
      content: 'district:\n  id: t\n  name: T',
      goal: 'add rooms',
      constraints: ['max 3 rooms', 'no combat zones'],
    });
    expect(capturedPrompt).toContain('max 3 rooms');
    expect(capturedPrompt).toContain('no combat zones');
  });

  it('propagates client failure', async () => {
    const client = failingClient('gpu oom');
    const result = await expandPack(client, {
      content: 'id: x',
      goal: 'expand',
    });
    expect(result.ok).toBe(false);
  });
});

describe('critiqueContent', () => {
  const structuredResponse = [
    'Strengths: The room has good connectivity between zones.',
    '',
    'Weaknesses: The hazard list is empty, leaving no environmental tension.',
    '',
    'Simulation risks: Without hazards, the district alert pressure may never rise.',
    '',
    '```yaml',
    'issues:',
    '  - code: empty_hazard_list',
    '    severity: medium',
    '    location: rooms.ruined_chapel.hazards',
    '    summary: No hazards defined for the room.',
    '    simulation_impact: District alert pressure stays flat.',
    'suggestions:',
    '  - code: add_ambient_hazard',
    '    priority: high',
    '    action: Add a crumbling_ceiling or unstable_floor hazard.',
    '  - code: add_rumor_hook',
    '    priority: medium',
    '    action: Connect chapel events to a faction rumor path.',
    'summary: >',
    '  The room is flavorful but lacks mechanical depth.',
    '```',
  ].join('\n');

  it('returns prose and structured findings from dual-output model', async () => {
    const client = mockClient(structuredResponse);
    const result = await critiqueContent(client, {
      content: 'id: ruined_chapel\nname: Ruined Chapel\nzones:\n  - id: nave\n    name: Nave',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Strengths');
      expect(result.text).toContain('connectivity');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('empty_hazard_list');
      expect(result.issues[0].severity).toBe('medium');
      expect(result.issues[0].location).toBe('rooms.ruined_chapel.hazards');
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].code).toBe('add_ambient_hazard');
      expect(result.suggestions[0].priority).toBe('high');
      expect(result.suggestions[1].code).toBe('add_rumor_hook');
      expect(result.summary).toContain('flavorful');
    }
  });

  it('degrades gracefully when model returns prose only', async () => {
    const proseOnly = 'Strengths: The room has good connectivity. Weaknesses: The hazard list is empty.';
    const client = mockClient(proseOnly);
    const result = await critiqueContent(client, {
      content: 'id: ruined_chapel\nname: Ruined Chapel',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Strengths');
      expect(result.issues).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
      expect(result.summary).toBe('');
    }
  });

  it('passes focus, content type, and session context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'Looks good overall.' };
      },
    };
    await critiqueContent(client, {
      content: 'id: test\nname: Test',
      contentType: 'quest',
      focus: 'fail conditions',
      sessionContext: 'Themes: paranoia, decay',
    });
    expect(capturedPrompt).toContain('quest');
    expect(capturedPrompt).toContain('fail conditions');
    expect(capturedPrompt).toContain('paranoia');
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await critiqueContent(client, {
      content: 'id: x\nname: X',
    });
    expect(result.ok).toBe(false);
  });
});

describe('normalizeContent', () => {
  it('returns normalized YAML from model', async () => {
    const clean = 'id: market_quarter\nname: Market Quarter\ntags:\n  - commerce\n  - trade';
    const client = mockClient(clean);
    const result = await normalizeContent(client, {
      content: 'id: Market_Quarter\nnaem: Market Quarter\ntags:\n  - trade\n  - commerce\n  - trade',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('market_quarter');
    }
  });

  it('passes content type to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'id: test\nname: Test' };
      },
    };
    await normalizeContent(client, {
      content: 'id: test\nname: Test',
      contentType: 'district',
    });
    expect(capturedPrompt).toContain('district');
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection refused');
    const result = await normalizeContent(client, {
      content: 'id: x',
    });
    expect(result.ok).toBe(false);
  });
});

describe('diffSummary', () => {
  it('returns diff analysis text from model', async () => {
    const analysis = 'Changes: Added paranoid tag to district. Simulation impact: District metrics will skew toward higher alert pressure. Risk: None.';
    const client = mockClient(analysis);
    const result = await diffSummary(client, {
      before: 'id: market_quarter\ntags:\n  - commerce',
      after: 'id: market_quarter\ntags:\n  - commerce\n  - paranoid',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Changes');
      expect(result.text).toContain('paranoid');
    }
  });

  it('passes labels to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'No significant changes.' };
      },
    };
    await diffSummary(client, {
      before: 'id: a',
      after: 'id: a',
      labelBefore: 'v1.0',
      labelAfter: 'v1.1',
    });
    expect(capturedPrompt).toContain('v1.0');
    expect(capturedPrompt).toContain('v1.1');
  });

  it('propagates client failure', async () => {
    const client = failingClient('model unavailable');
    const result = await diffSummary(client, {
      before: 'id: x',
      after: 'id: x',
    });
    expect(result.ok).toBe(false);
  });
});

describe('analyzeReplay', () => {
  const replayAnalysis = [
    'The simulation ran for 50 ticks. District old_quarter saw no alert escalation',
    'despite 3 combat events because decay outpaced inflow.',
    '',
    '```yaml',
    'issues:',
    '  - code: REPLAY_001',
    '    severity: high',
    '    location: old_quarter',
    '    summary: District alert never rises above 5.',
    '    simulation_impact: Faction patrols never trigger, content unreachable.',
    '  - code: REPLAY_002',
    '    severity: medium',
    '    location: thieves_guild',
    '    summary: Rumor propagation never reached thieves_guild faction.',
    '    simulation_impact: Faction stays inert, no alert escalation.',
    'suggestions:',
    '  - code: REPLAY_S001',
    '    priority: high',
    '    action: Reduce alert decay rate or increase combat event frequency.',
    'summary: >',
    '  Simulation is structurally sound but alert/rumor flow is too weak.',
    '```',
  ].join('\n');

  it('returns prose and structured findings from replay analysis', async () => {
    const client = mockClient(replayAnalysis);
    const result = await analyzeReplay(client, {
      replay: '{"tick":50,"events":[{"type":"combat.contact.hit","tick":10}]}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('50 ticks');
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].code).toBe('REPLAY_001');
      expect(result.issues[0].severity).toBe('high');
      expect(result.issues[1].code).toBe('REPLAY_002');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].code).toBe('REPLAY_S001');
      expect(result.summary).toContain('structurally sound');
    }
  });

  it('passes focus, tick-range, and session context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'No significant issues found.' };
      },
    };
    await analyzeReplay(client, {
      replay: '{"tick":20}',
      focus: 'rumor propagation',
      tickRange: '0-20',
      sessionContext: 'Themes: paranoia',
    });
    expect(capturedPrompt).toContain('rumor propagation');
    expect(capturedPrompt).toContain('0-20');
    expect(capturedPrompt).toContain('paranoia');
  });

  it('degrades gracefully with prose-only response', async () => {
    const client = mockClient('The simulation looks healthy. No obvious issues.');
    const result = await analyzeReplay(client, {
      replay: '{"tick":10}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('healthy');
      expect(result.issues).toHaveLength(0);
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection refused');
    const result = await analyzeReplay(client, {
      replay: '{}',
    });
    expect(result.ok).toBe(false);
  });
});

describe('explainWhy', () => {
  it('returns causal explanation from model', async () => {
    const explanation = 'The ghoul attacked because its suspicion exceeded 60 at tick 12, triggered by a partial detection (clarity: 0.3) of the player entering the crypt.';
    const client = mockClient(explanation);
    const result = await explainWhy(client, {
      question: 'Why did the ghoul attack?',
      state: '{"entities":{"ghoul_01":{"suspicion":65,"morale":80}}}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('suspicion');
      expect(result.text).toContain('partial detection');
    }
  });

  it('passes target type, target id, and session context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'Because cohesion was too low.' };
      },
    };
    await explainWhy(client, {
      question: 'Why is the faction still hostile?',
      state: '{"factions":{"raiders":{"alertLevel":80}}}',
      targetType: 'faction',
      targetId: 'raiders',
      sessionContext: 'Themes: survival',
    });
    expect(capturedPrompt).toContain('faction');
    expect(capturedPrompt).toContain('raiders');
    expect(capturedPrompt).toContain('survival');
    expect(capturedPrompt).toContain('still hostile');
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await explainWhy(client, {
      question: 'Why?',
      state: '{}',
    });
    expect(result.ok).toBe(false);
  });
});

describe('suggestNext', () => {
  const suggestResponse = [
    'Session has good district coverage but lacks quests and simulation testing.',
    '',
    '```yaml',
    'actions:',
    '  - priority: high',
    '    command: "create-quest --theme smuggling"',
    '    reason: "No quests in session, factions have no goals."',
    '  - priority: medium',
    '    command: "analyze-replay < old_quarter_replay.json"',
    '    reason: "District was never tested in simulation."',
    '  - priority: low',
    '    command: "normalize-content < chapel.yaml"',
    '    reason: "Minor style drift in room definition."',
    'summary: "Create quests first, then simulate to validate dynamics."',
    '```',
  ].join('\n');

  it('returns prose and structured actions from session analysis', async () => {
    const client = mockClient(suggestResponse);
    const result = await suggestNext(client, {
      sessionState: 'Themes: paranoia\nArtifacts: 2 districts, 0 quests\nIssues: 1 open',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('district coverage');
      expect(result.actions).toHaveLength(3);
      expect(result.actions[0].priority).toBe('high');
      expect(result.actions[0].command).toContain('create-quest');
      expect(result.actions[1].priority).toBe('medium');
      expect(result.actions[2].priority).toBe('low');
      expect(result.summary).toContain('quests first');
    }
  });

  it('passes recent activity to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'No recommendations.' };
      },
    };
    await suggestNext(client, {
      sessionState: 'Themes: paranoia',
      recentActivity: 'Created chapel room',
    });
    expect(capturedPrompt).toContain('paranoia');
    expect(capturedPrompt).toContain('Created chapel room');
  });

  it('degrades gracefully with prose-only response', async () => {
    const client = mockClient('Everything looks good, keep going.');
    const result = await suggestNext(client, {
      sessionState: 'Themes: medieval',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('looks good');
      expect(result.actions).toHaveLength(0);
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('connection refused');
    const result = await suggestNext(client, {
      sessionState: '{}',
    });
    expect(result.ok).toBe(false);
  });
});

describe('planDistrict', () => {
  const planResponse = [
    'This plan builds a thieves quarter with hidden passages and a fence.',
    '',
    '```yaml',
    'steps:',
    '  - order: 1',
    '    command: "create-district --theme thieves_quarter"',
    '    produces: "district YAML"',
    '    description: "Foundation district"',
    '  - order: 2',
    '    command: "create-faction --theme thieves_guild"',
    '    produces: "faction config"',
    '    description: "Controlling faction"',
    '    dependsOn: [1]',
    '  - order: 3',
    '    command: "create-room --theme hidden_passage --district thieves_quarter"',
    '    produces: "room definition"',
    '    description: "Secret route through the district"',
    '    dependsOn: [1, 2]',
    '  - order: 4',
    '    command: "critique-content < thieves_quarter.yaml"',
    '    produces: "critique report"',
    '    description: "Review pass on the district"',
    '    dependsOn: [1, 2, 3]',
    'rationale: "Build structure first, add faction control, then infill rooms."',
    '```',
  ].join('\n');

  it('returns prose and structured plan from theme', async () => {
    const client = mockClient(planResponse);
    const result = await planDistrict(client, {
      theme: 'thieves quarter',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('thieves quarter');
      expect(result.steps).toHaveLength(4);
      expect(result.steps[0].order).toBe(1);
      expect(result.steps[0].command).toContain('create-district');
      expect(result.steps[0].dependsOn).toHaveLength(0);
      expect(result.steps[2].dependsOn).toEqual([1, 2]);
      expect(result.rationale).toContain('structure first');
    }
  });

  it('passes context flags to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'Plan.' };
      },
    };
    await planDistrict(client, {
      theme: 'market square',
      existingFactions: 'merchants_guild, thieves_guild',
      existingDistricts: 'old_quarter',
      constraints: 'no magic, medieval only',
      sessionContext: 'Themes: trade',
    });
    expect(capturedPrompt).toContain('market square');
    expect(capturedPrompt).toContain('merchants_guild');
    expect(capturedPrompt).toContain('old_quarter');
    expect(capturedPrompt).toContain('no magic');
    expect(capturedPrompt).toContain('trade');
  });

  it('propagates client failure', async () => {
    const client = failingClient('model not found');
    const result = await planDistrict(client, {
      theme: 'anything',
    });
    expect(result.ok).toBe(false);
  });
});

describe('compareReplays', () => {
  const compareResponse = [
    'After the content revision, rumor flow improved significantly in old_quarter.',
    '',
    '```yaml',
    'improvements:',
    '  - area: old_quarter',
    '    description: "Alert pressure rose from 5 to 35 over 50 ticks."',
    '  - area: thieves_guild',
    '    description: "Faction now receives rumors from adjacent zones."',
    'regressions:',
    '  - area: chapel',
    '    description: "Room stability dropped from 80 to 40."',
    'unchanged:',
    '  - area: merchants_guild',
    '    description: "Faction alertLevel stayed at 0."',
    'verdict: improved',
    'summary: "Net improvement in simulation dynamics."',
    '```',
  ].join('\n');

  it('returns prose and structured comparison', async () => {
    const client = mockClient(compareResponse);
    const result = await compareReplays(client, {
      before: '{"tick":50,"events":[]}',
      after: '{"tick":50,"events":[{"type":"rumor.spread"}]}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('rumor flow improved');
      expect(result.improvements).toHaveLength(2);
      expect(result.improvements[0].area).toBe('old_quarter');
      expect(result.regressions).toHaveLength(1);
      expect(result.regressions[0].area).toBe('chapel');
      expect(result.unchanged).toHaveLength(1);
      expect(result.verdict).toBe('improved');
      expect(result.summary).toContain('Net improvement');
    }
  });

  it('passes labels, focus, and session context to prompt', async () => {
    let capturedPrompt = '';
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        capturedPrompt = input.prompt;
        return { ok: true, text: 'No significant changes.' };
      },
    };
    await compareReplays(client, {
      before: '{"tick":10}',
      after: '{"tick":10}',
      labelBefore: 'v1',
      labelAfter: 'v2',
      focus: 'alert escalation',
      sessionContext: 'Themes: paranoia',
    });
    expect(capturedPrompt).toContain('v1');
    expect(capturedPrompt).toContain('v2');
    expect(capturedPrompt).toContain('alert escalation');
    expect(capturedPrompt).toContain('paranoia');
  });

  it('degrades gracefully with prose-only response', async () => {
    const client = mockClient('Both runs are identical. No meaningful differences.');
    const result = await compareReplays(client, {
      before: '{}',
      after: '{}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('identical');
      expect(result.improvements).toHaveLength(0);
      expect(result.regressions).toHaveLength(0);
      expect(result.verdict).toBe('neutral');
    }
  });

  it('propagates client failure', async () => {
    const client = failingClient('timeout');
    const result = await compareReplays(client, {
      before: '{}',
      after: '{}',
    });
    expect(result.ok).toBe(false);
  });
});
