import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toJsonSchema, contentPackSchemaPath, CONTENT_PACK_JSON_SCHEMA_ID } from './json-schema.js';

describe('toJsonSchema (F-fad5db9d)', () => {
  it('returns Draft 2020-12 ContentPack schema from the checked-in artifact', () => {
    const schema = toJsonSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe(CONTENT_PACK_JSON_SCHEMA_ID);
    expect(schema.title).toBe('ContentPack');
    expect(schema.type).toBe('object');
    const defs = schema.$defs as Record<string, unknown>;
    for (const key of [
      'EntityBlueprint',
      'ZoneDefinition',
      'DialogueDefinition',
      'QuestDefinition',
      'AbilityDefinition',
      'StatusDefinition',
      'DistrictDefinition',
      'EntityPlacementRecord',
      'EncounterAnchorRecord',
      'HazardSpec',
      'ItemDefinition',
      'ProgressionTreeDefinition',
      'ItemPlacementRecord',
      'EntityAiState',
      'RuleProfile',
      'RulesetDefinition',
      'PackMetadata',
      'GameManifest',
    ]) {
      expect(defs[key], `missing $defs.${key}`).toBeDefined();
    }
    const props = schema.properties as Record<string, unknown>;
    for (const key of [
      'entities',
      'zones',
      'placements',
      'encounterAnchors',
      'hazardDefinitions',
      'districts',
      'items',
      'itemPlacements',
      'entityAi',
      'ruleset',
      'ruleProfiles',
      'meta',
      'manifest',
      'factions',
    ]) {
      expect(props[key], `missing properties.${key}`).toBeDefined();
    }
  });

  it('contentPackSchemaPath points at the checked-in file', () => {
    const p = contentPackSchemaPath();
    expect(p.replace(/\\/g, '/')).toMatch(/schema\/content-pack\.schema\.json$/);
    const fromFile = JSON.parse(readFileSync(p, 'utf8'));
    expect(fromFile).toEqual(toJsonSchema());
  });

  it('EntityBlueprint uses type, DialogueDefinition uses entryNodeId, StatusDefinition.duration is an object', () => {
    const schema = toJsonSchema();
    const defs = schema.$defs as Record<string, { required?: string[]; properties?: Record<string, { type?: string }> }>;
    expect(defs.EntityBlueprint.required).toContain('type');
    expect(defs.EntityBlueprint.properties).not.toHaveProperty('kind');
    expect(defs.EntityBlueprint.properties).toHaveProperty('relations');
    expect(defs.EntityBlueprint.properties).toHaveProperty('custom');
    expect(defs.EntityBlueprint.properties).toHaveProperty('resistances');
    expect(defs.EntityBlueprint.properties).toHaveProperty('faction');
    expect(defs.EntityBlueprint.properties).toHaveProperty('ruleProfileId');
    expect(defs.DialogueDefinition.required).toContain('entryNodeId');
    expect(defs.DialogueDefinition.properties).not.toHaveProperty('startNode');
    expect(defs.StatusDefinition.properties?.duration?.type).toBe('object');
  });

  it('the in-package schema file matches toJsonSchema()', () => {
    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const raw = readFileSync(join(pkgRoot, 'schema', 'content-pack.schema.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual(toJsonSchema());
  });
});
