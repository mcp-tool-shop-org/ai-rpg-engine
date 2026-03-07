// Validation helpers for rumor system types

import type { Rumor, RumorQuery } from './types.js';
import { VALID_STATUSES, VALID_MUTATION_TYPES } from './types.js';

export type ValidationError = { field: string; message: string };

export function validateRumor(rumor: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!rumor || typeof rumor !== 'object') {
    return [{ field: 'root', message: 'must be an object' }];
  }
  const r = rumor as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) {
    errors.push({ field: 'id', message: 'must be a non-empty string' });
  }
  if (typeof r.claim !== 'string' || r.claim.length === 0) {
    errors.push({ field: 'claim', message: 'must be a non-empty string' });
  }
  if (typeof r.subject !== 'string' || r.subject.length === 0) {
    errors.push({ field: 'subject', message: 'must be a non-empty string' });
  }
  if (typeof r.key !== 'string' || r.key.length === 0) {
    errors.push({ field: 'key', message: 'must be a non-empty string' });
  }
  if (typeof r.sourceId !== 'string' || r.sourceId.length === 0) {
    errors.push({ field: 'sourceId', message: 'must be a non-empty string' });
  }
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) {
    errors.push({ field: 'confidence', message: 'must be a number between 0 and 1' });
  }
  if (typeof r.emotionalCharge !== 'number' || r.emotionalCharge < -1 || r.emotionalCharge > 1) {
    errors.push({ field: 'emotionalCharge', message: 'must be a number between -1 and 1' });
  }
  if (!Array.isArray(r.spreadPath)) {
    errors.push({ field: 'spreadPath', message: 'must be an array' });
  }
  if (typeof r.mutationCount !== 'number' || r.mutationCount < 0) {
    errors.push({ field: 'mutationCount', message: 'must be a non-negative number' });
  }
  if (!Array.isArray(r.factionUptake)) {
    errors.push({ field: 'factionUptake', message: 'must be an array' });
  }
  if (!VALID_STATUSES.includes(r.status as any)) {
    errors.push({ field: 'status', message: `must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  return errors;
}

export function isValidRumor(rumor: unknown): rumor is Rumor {
  return validateRumor(rumor).length === 0;
}
