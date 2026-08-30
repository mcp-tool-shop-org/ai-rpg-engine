// Validation helpers for campaign memory types

import type {
  CampaignRecord,
  RelationshipAxes,
} from './types.js';
import { VALID_CATEGORIES, VALID_CONSOLIDATIONS } from './types.js';

export type ValidationError = { field: string; message: string };

/** Human-readable label for a numeric value that failed a finite check. */
export function describeNumeric(value: unknown): string {
  if (typeof value !== 'number') return value === null ? 'null' : typeof value;
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return String(value);
}

function requireFiniteInRange(
  errors: ValidationError[],
  field: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({
      field,
      message: `must be a finite number between ${min} and ${max} (got ${describeNumeric(value)})`,
    });
    return;
  }
  if (value < min || value > max) {
    errors.push({
      field,
      message: `must be a finite number between ${min} and ${max} (got ${value})`,
    });
  }
}

function requireFiniteNonNegative(errors: ValidationError[], field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push({
      field,
      message: `must be a finite non-negative number (got ${describeNumeric(value)})`,
    });
  }
}

export function validateCampaignRecord(record: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!record || typeof record !== 'object') {
    return [{ field: 'root', message: 'must be an object' }];
  }
  const r = record as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) {
    errors.push({ field: 'id', message: 'must be a non-empty string' });
  }
  // F-0ed561bd: NaN fails every < / > comparison, so `typeof === 'number' && tick >= 0`
  // admitted NaN (and Infinity). Name the field when it is non-finite.
  requireFiniteNonNegative(errors, 'tick', r.tick);
  if (!(VALID_CATEGORIES as readonly string[]).includes(r.category as string)) {
    errors.push({ field: 'category', message: `must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (typeof r.actorId !== 'string' || r.actorId.length === 0) {
    errors.push({ field: 'actorId', message: 'must be a non-empty string' });
  }
  if (typeof r.description !== 'string') {
    errors.push({ field: 'description', message: 'must be a string' });
  }
  requireFiniteInRange(errors, 'significance', r.significance, 0, 1);
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

  requireFiniteInRange(errors, 'trust', a.trust, -1, 1);
  requireFiniteInRange(errors, 'fear', a.fear, 0, 1);
  requireFiniteInRange(errors, 'admiration', a.admiration, -1, 1);
  requireFiniteInRange(errors, 'familiarity', a.familiarity, 0, 1);

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
  requireFiniteInRange(errors, 'salience', f.salience, 0, 1);
  requireFiniteInRange(errors, 'emotionalCharge', f.emotionalCharge, -1, 1);
  if (!(VALID_CONSOLIDATIONS as readonly string[]).includes(f.consolidation as string)) {
    errors.push({ field: 'consolidation', message: `must be one of: ${VALID_CONSOLIDATIONS.join(', ')}` });
  }
  // F-0ed561bd: MemoryFragment.tick is the decay clock in consolidate/recall
  // withinTicks. Missing or non-finite tick used to load, then currentTick -
  // undefined produced NaN salience.
  requireFiniteNonNegative(errors, 'tick', f.tick);

  return errors;
}

export function isValidCampaignRecord(record: unknown): record is CampaignRecord {
  return validateCampaignRecord(record).length === 0;
}

export function isValidRelationshipAxes(axes: unknown): axes is RelationshipAxes {
  return validateRelationshipAxes(axes).length === 0;
}
