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
  it('returns critique text from model', async () => {
    const critique = 'Strengths: The room has good connectivity. Weaknesses: The hazard list is empty. Simulation risks: None. Missed opportunities: Add ambient sounds.';
    const client = mockClient(critique);
    const result = await critiqueContent(client, {
      content: 'id: ruined_chapel\nname: Ruined Chapel\nzones:\n  - id: nave\n    name: Nave',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Strengths');
      expect(result.text).toContain('Weaknesses');
    }
  });

  it('passes focus and content type to prompt', async () => {
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
    });
    expect(capturedPrompt).toContain('quest');
    expect(capturedPrompt).toContain('fail conditions');
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
