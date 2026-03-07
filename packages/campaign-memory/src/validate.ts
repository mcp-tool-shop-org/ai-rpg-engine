// Validation helpers for campaign memory types

import type {
  CampaignRecord,
  RelationshipAxes,
  MemoryFragment,
  NpcMemoryState,
} from './types.js';
import { VALID_CATEGORIES, VALID_CONSOLIDATIONS } from './types.js';

export type ValidationError = { field: string; message: string };

export function validateCampaignRecord(record: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!record || typeof record !== 'object') {
    return [{ field: 'root', message: 'must be an object' }];
  }
  const r = record as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) {
    errors.push({ field: 'id', message: 'must be a non-empty string' });
  }
  if (typeof r.tick !== 'number' || r.tick < 0) {
    errors.push({ field: 'tick', message: 'must be a non-negative number' });
  }
  if (!VALID_CATEGORIES.includes(r.category as any)) {
    errors.push({ field: 'category', message: `must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (typeof r.actorId !== 'string' || r.actorId.length === 0) {
    errors.push({ field: 'actorId', message: 'must be a non-empty string' });
  }
  if (typeof r.description !== 'string') {
    errors.push({ field: 'description', message: 'must be a string' });
  }
  if (typeof r.significance !== 'number' || r.significance < 0 || r.significance > 1) {
    errors.push({ field: 'significance', message: 'must be a number between 0 and 1' });
  }
  if (!Array.isArray(r.witnesses)) {
    errors.push({ field: 'witnesses', message: 'must be an array' });
  }

  return errors;
}

export function validateRelationshipAxes(axes: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!axes || typeof axes !== 'object') {
    return [{ field: 'root', message: 'must be an object' }];
  }
  const a = axes as Record<string, unknown>;

  if (typeof a.trust !== 'number' || a.trust < -1 || a.trust > 1) {
    errors.push({ field: 'trust', message: 'must be a number between -1 and 1' });
  }
  if (typeof a.fear !== 'number' || a.fear < 0 || a.fear > 1) {
    errors.push({ field: 'fear', message: 'must be a number between 0 and 1' });
  }
  if (typeof a.admiration !== 'number' || a.admiration < -1 || a.admiration > 1) {
    errors.push({ field: 'admiration', message: 'must be a number between -1 and 1' });
  }
  if (typeof a.familiarity !== 'number' || a.familiarity < 0 || a.familiarity > 1) {
    errors.push({ field: 'familiarity', message: 'must be a number between 0 and 1' });
  }

  return errors;
}

export function validateMemoryFragment(fragment: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!fragment || typeof fragment !== 'object') {
    return [{ field: 'root', message: 'must be an object' }];
  }
  const f = fragment as Record<string, unknown>;

  if (typeof f.recordId !== 'string' || f.recordId.length === 0) {
    errors.push({ field: 'recordId', message: 'must be a non-empty string' });
  }
  if (typeof f.salience !== 'number' || f.salience < 0 || f.salience > 1) {
    errors.push({ field: 'salience', message: 'must be a number between 0 and 1' });
  }
  if (typeof f.emotionalCharge !== 'number' || f.emotionalCharge < -1 || f.emotionalCharge > 1) {
    errors.push({ field: 'emotionalCharge', message: 'must be a number between -1 and 1' });
  }
  if (!VALID_CONSOLIDATIONS.includes(f.consolidation as any)) {
    errors.push({ field: 'consolidation', message: `must be one of: ${VALID_CONSOLIDATIONS.join(', ')}` });
  }

  return errors;
}

export function isValidCampaignRecord(record: unknown): record is CampaignRecord {
  return validateCampaignRecord(record).length === 0;
}

export function isValidRelationshipAxes(axes: unknown): axes is RelationshipAxes {
  return validateRelationshipAxes(axes).length === 0;
}
