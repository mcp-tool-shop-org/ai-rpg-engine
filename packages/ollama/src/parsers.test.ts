// Unit tests — parsers, validators, config, prompt assembly, CLI dispatch
// No live Ollama needed. Client is mocked.

import { describe, it, expect } from 'vitest';
import { extractYaml, extractJson, extractText, parseCritiqueOutput } from './parsers.js';

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
