// Unit tests — parsers, validators, config, prompt assembly, CLI dispatch
// No live Ollama needed. Client is mocked.

import { describe, it, expect } from 'vitest';
import { extractYaml, extractJson, extractText, parseCritiqueOutput, parseSuggestNextOutput, parsePlanOutput, parseCompareOutput } from './parsers.js';

describe('extractYaml', () => {
  it('extracts from fenced yaml block', () => {
    const raw = 'Here is the room:\n```yaml\nid: chapel\nname: Chapel\n```\nDone.';
    expect(extractYaml(raw)).toBe('id: chapel\nname: Chapel');
  });

  it('extracts from fenced yml block', () => {
    const raw = '```yml\nid: crypt\n```';
    expect(extractYaml(raw)).toBe('id: crypt');
  });

  it('strips leading prose and finds YAML start', () => {
    const raw = 'Sure, here is your room:\n\nid: chapel\nname: Ruined Chapel';
    expect(extractYaml(raw)).toBe('id: chapel\nname: Ruined Chapel');
  });

  it('returns raw when no YAML detected', () => {
    expect(extractYaml('just plain text')).toBe('just plain text');
  });
});

describe('extractJson', () => {
  it('extracts from fenced json block', () => {
    const raw = '```json\n{"id":"chapel"}\n```';
    expect(extractJson(raw)).toBe('{"id":"chapel"}');
  });

  it('extracts bare JSON object', () => {
    const raw = 'Result: {"id": "chapel", "name": "Chapel"}. Done.';
    expect(extractJson(raw)).toBe('{"id": "chapel", "name": "Chapel"}');
  });

  it('extracts JSON array', () => {
    const raw = 'Errors: [{"path":"a","message":"b"}]';
    expect(extractJson(raw)).toBe('[{"path":"a","message":"b"}]');
  });

  it('returns raw when no JSON found', () => {
    expect(extractJson('no json here')).toBe('no json here');
  });
});

describe('extractText', () => {
  it('strips markdown fences', () => {
    const raw = '```\nplain content\n```';
    expect(extractText(raw)).toBe('plain content');
  });

  it('returns raw when no fences', () => {
    expect(extractText('hello world')).toBe('hello world');
  });
});

describe('parseCritiqueOutput', () => {
  it('extracts prose and structured findings from dual output', () => {
    const raw = [
      'Strengths: Good zone connectivity.',
      '',
      'Weaknesses: No hazards.',
      '',
      '```yaml',
      'issues:',
      '  - code: no_hazards',
      '    severity: high',
      '    location: rooms.chapel.hazards',
      '    summary: Room has no hazards.',
      '    simulation_impact: Alert pressure stays flat.',
      'suggestions:',
      '  - code: add_trap',
      '    priority: high',
      '    action: Add a crumbling_ceiling hazard.',
      'summary: >',
      '  Needs more mechanical depth.',
      '```',
    ].join('\n');

    const { prose, structured } = parseCritiqueOutput(raw);
    expect(prose).toContain('Strengths');
    expect(prose).not.toContain('issues:');

    expect(structured.issues).toHaveLength(1);
    expect(structured.issues[0].code).toBe('no_hazards');
    expect(structured.issues[0].severity).toBe('high');
    expect(structured.issues[0].location).toBe('rooms.chapel.hazards');
    expect(structured.issues[0].simulation_impact).toContain('Alert pressure');

    expect(structured.suggestions).toHaveLength(1);
    expect(structured.suggestions[0].code).toBe('add_trap');
    expect(structured.suggestions[0].priority).toBe('high');

    expect(structured.summary).toContain('mechanical depth');
  });

  it('handles multiple issues and suggestions', () => {
    const raw = [
      'Review text here.',
      '',
      '```yaml',
      'issues:',
      '  - code: issue_one',
      '    severity: low',
      '    location: factions.pilgrims',
      '    summary: First issue.',
      '    simulation_impact: Minor.',
      '  - code: issue_two',
      '    severity: high',
      '    location: districts.chapel',
      '    summary: Second issue.',
      '    simulation_impact: Major.',
      'suggestions:',
      '  - code: fix_one',
      '    priority: low',
      '    action: Do thing one.',
      '  - code: fix_two',
      '    priority: high',
      '    action: Do thing two.',
      'summary: Two issues found.',
      '```',
    ].join('\n');

    const { structured } = parseCritiqueOutput(raw);
    expect(structured.issues).toHaveLength(2);
    expect(structured.issues[0].code).toBe('issue_one');
    expect(structured.issues[1].code).toBe('issue_two');
    expect(structured.suggestions).toHaveLength(2);
    expect(structured.summary).toBe('Two issues found.');
  });

  it('degrades gracefully with no YAML block', () => {
    const raw = 'Just prose, no structured block.';
    const { prose, structured } = parseCritiqueOutput(raw);
    expect(prose).toBe('Just prose, no structured block.');
    expect(structured.issues).toHaveLength(0);
    expect(structured.suggestions).toHaveLength(0);
    expect(structured.summary).toBe('');
  });

  it('handles JSON inside yaml fences', () => {
    const raw = [
      'Review.',
      '',
      '```yaml',
      '{"issues":[{"code":"test","severity":"medium","location":"x","summary":"y","simulation_impact":"z"}],"suggestions":[],"summary":"ok"}',
      '```',
    ].join('\n');

    const { structured } = parseCritiqueOutput(raw);
    expect(structured.issues).toHaveLength(1);
    expect(structured.issues[0].code).toBe('test');
    expect(structured.summary).toBe('ok');
  });

  it('defaults unknown severity/priority to medium', () => {
    const raw = [
      'Text.',
      '',
      '```yaml',
      'issues:',
      '  - code: bad_severity',
      '    severity: critical',
      '    location: x',
      '    summary: Bad sev.',
      '    simulation_impact: Unknown.',
      'suggestions:',
      '  - code: bad_priority',
      '    priority: urgent',
      '    action: Do something.',
      'summary: Test.',
      '```',
    ].join('\n');

    const { structured } = parseCritiqueOutput(raw);
    expect(structured.issues[0].severity).toBe('medium');
    expect(structured.suggestions[0].priority).toBe('medium');
  });
});

describe('parseSuggestNextOutput', () => {
  it('extracts prose and structured actions from dual output', () => {
    const raw = [
      'Your session has good district coverage but no quests yet.',
      '',
      '```yaml',
      'actions:',
      '  - priority: high',
      '    command: "create-quest --theme smuggling"',
      '    reason: "No quests exist, factions have no goals."',
      '  - priority: medium',
      '    command: "critique-content < old_quarter.yaml"',
      '    reason: "District was never critiqued."',
      '  - priority: low',
      '    command: "normalize-content < chapel.yaml"',
      '    reason: "Minor style issues in room definitions."',
      'summary: "Focus on quest creation to activate faction dynamics."',
      '```',
    ].join('\n');

    const { prose, structured } = parseSuggestNextOutput(raw);
    expect(prose).toContain('good district coverage');
    expect(prose).not.toContain('actions:');

    expect(structured.actions).toHaveLength(3);
    expect(structured.actions[0].priority).toBe('high');
    expect(structured.actions[0].command).toContain('create-quest');
    expect(structured.actions[0].reason).toContain('No quests');
    expect(structured.actions[1].priority).toBe('medium');
    expect(structured.actions[2].priority).toBe('low');

    expect(structured.summary).toContain('quest creation');
  });

  it('degrades gracefully with no YAML block', () => {
    const raw = 'Just prose recommendations, no structured block.';
    const { prose, structured } = parseSuggestNextOutput(raw);
    expect(prose).toBe('Just prose recommendations, no structured block.');
    expect(structured.actions).toHaveLength(0);
    expect(structured.summary).toBe('');
  });

  it('handles JSON inside yaml fences', () => {
    const raw = [
      'Assessment.',
      '',
      '```yaml',
      '{"actions":[{"priority":"high","command":"create-room --theme crypt","reason":"Missing rooms"}],"summary":"ok"}',
      '```',
    ].join('\n');

    const { structured } = parseSuggestNextOutput(raw);
    expect(structured.actions).toHaveLength(1);
    expect(structured.actions[0].command).toContain('create-room');
    expect(structured.summary).toBe('ok');
  });

  it('defaults unknown priority to medium', () => {
    const raw = [
      'Text.',
      '',
      '```yaml',
      'actions:',
      '  - priority: critical',
      '    command: "create-room --theme lab"',
      '    reason: "Missing room."',
      'summary: Test.',
      '```',
    ].join('\n');

    const { structured } = parseSuggestNextOutput(raw);
    expect(structured.actions[0].priority).toBe('medium');
  });
});

describe('parsePlanOutput', () => {
  it('extracts prose and structured steps from dual output', () => {
    const raw = [
      'This plan builds a thieves quarter with hidden passages.',
      '',
      '```yaml',
      'steps:',
      '  - order: 1',
      '    command: "create-district --theme thieves_quarter"',
      '    produces: "district definition"',
      '    description: "Foundation district with underworld flavor"',
      '  - order: 2',
      '    command: "create-faction --theme thieves_guild"',
      '    produces: "faction config"',
      '    description: "Controlling faction for district"',
      '    dependsOn: [1]',
      '  - order: 3',
      '    command: "create-room --theme hidden_passage --district thieves_quarter"',
      '    produces: "room definition"',
      '    description: "Secret route between zones"',
      '    dependsOn: [1, 2]',
      'rationale: "Start with structure, add faction, then fill rooms."',
      '```',
    ].join('\n');

    const { prose, structured } = parsePlanOutput(raw);
    expect(prose).toContain('thieves quarter');
    expect(prose).not.toContain('steps:');

    expect(structured.steps).toHaveLength(3);
    expect(structured.steps[0].order).toBe(1);
    expect(structured.steps[0].command).toContain('create-district');
    expect(structured.steps[0].dependsOn).toHaveLength(0);
    expect(structured.steps[1].dependsOn).toEqual([1]);
    expect(structured.steps[2].dependsOn).toEqual([1, 2]);

    expect(structured.rationale).toContain('structure');
  });

  it('degrades gracefully with no YAML block', () => {
    const raw = 'Just a text plan without structure.';
    const { prose, structured } = parsePlanOutput(raw);
    expect(prose).toBe('Just a text plan without structure.');
    expect(structured.steps).toHaveLength(0);
    expect(structured.rationale).toBe('');
  });

  it('handles JSON inside yaml fences', () => {
    const raw = [
      'Plan.',
      '',
      '```yaml',
      '{"steps":[{"order":1,"command":"create-district --theme market","produces":"district","description":"Market district"}],"rationale":"ok"}',
      '```',
    ].join('\n');

    const { structured } = parsePlanOutput(raw);
    expect(structured.steps).toHaveLength(1);
    expect(structured.steps[0].command).toContain('create-district');
    expect(structured.rationale).toBe('ok');
  });
});

describe('parseCompareOutput', () => {
  it('extracts prose and structured comparison from dual output', () => {
    const raw = [
      'After the revision, rumor propagation improved significantly.',
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

    const { prose, structured } = parseCompareOutput(raw);
    expect(prose).toContain('rumor propagation improved');
    expect(prose).not.toContain('improvements:');

    expect(structured.improvements).toHaveLength(2);
    expect(structured.improvements[0].area).toBe('old_quarter');
    expect(structured.improvements[1].area).toBe('thieves_guild');

    expect(structured.regressions).toHaveLength(1);
    expect(structured.regressions[0].area).toBe('chapel');

    expect(structured.unchanged).toHaveLength(1);
    expect(structured.unchanged[0].area).toBe('merchants_guild');

    expect(structured.verdict).toBe('improved');
    expect(structured.summary).toContain('Net improvement');
  });

  it('degrades gracefully with no YAML block', () => {
    const raw = 'Both runs look the same.';
    const { prose, structured } = parseCompareOutput(raw);
    expect(prose).toBe('Both runs look the same.');
    expect(structured.improvements).toHaveLength(0);
    expect(structured.regressions).toHaveLength(0);
    expect(structured.unchanged).toHaveLength(0);
    expect(structured.verdict).toBe('neutral');
    expect(structured.summary).toBe('');
  });

  it('handles JSON inside yaml fences', () => {
    const raw = [
      'Comparison.',
      '',
      '```yaml',
      '{"improvements":[{"area":"global","description":"better"}],"regressions":[],"unchanged":[],"verdict":"improved","summary":"ok"}',
      '```',
    ].join('\n');

    const { structured } = parseCompareOutput(raw);
    expect(structured.improvements).toHaveLength(1);
    expect(structured.verdict).toBe('improved');
    expect(structured.summary).toBe('ok');
  });
});
