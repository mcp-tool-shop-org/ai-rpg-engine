// CampaignJournal — persistent record of significant campaign events

import type { CampaignRecord, RecordCategory, SerializedJournal } from './types.js';
import { CAMPAIGN_MEMORY_VERSION } from './types.js';
import { validateCampaignRecord } from './validate.js';

export type JournalQueryFilters = {
  actorId?: string;
  targetId?: string;
  category?: RecordCategory;
  minSignificance?: number;
  afterTick?: number;
};

export class CampaignJournal {
  private records: Map<string, CampaignRecord> = new Map();
  /**
   * Per-instance ID counter. Record IDs depend only on (this journal's history),
   * never on cross-instance order — see CP-01. Two journals number independently.
   */
  private nextRecordId = 1;

  private generateId(): string {
    return `cr_${this.nextRecordId++}`;
  }

  /** Record a significant event. Returns the created record with generated ID. */
  record(entry: Omit<CampaignRecord, 'id'>): CampaignRecord {
    const record: CampaignRecord = { id: this.generateId(), ...entry };
    this.records.set(record.id, record);
    return record;
  }

  /** Get a specific record by ID */
  get(id: string): CampaignRecord | undefined {
    return this.records.get(id);
  }

  /** Query records by filters. All filters are ANDed together. */
  query(filters: JournalQueryFilters): CampaignRecord[] {
    let results = Array.from(this.records.values());

    if (filters.actorId !== undefined) {
      results = results.filter((r) => r.actorId === filters.actorId);
    }
    if (filters.targetId !== undefined) {
      results = results.filter((r) => r.targetId === filters.targetId);
    }
    if (filters.category !== undefined) {
      results = results.filter((r) => r.category === filters.category);
    }
    if (filters.minSignificance !== undefined) {
      results = results.filter((r) => r.significance >= filters.minSignificance!);
    }
    if (filters.afterTick !== undefined) {
      results = results.filter((r) => r.tick > filters.afterTick!);
    }

    return results.sort((a, b) => a.tick - b.tick);
  }

  /** Get all records involving an entity (as actor or target) */
  getInvolving(entityId: string): CampaignRecord[] {
    return Array.from(this.records.values())
      .filter((r) => r.actorId === entityId || r.targetId === entityId)
      .sort((a, b) => a.tick - b.tick);
  }

  /** Number of records in the journal */
  size(): number {
    return this.records.size;
  }

  /**
   * Serializable state for persistence, wrapped in a versioned envelope (CM-01)
   * so a future record-schema change has a number to migrate on.
   */
  serialize(): SerializedJournal {
    return {
      version: CAMPAIGN_MEMORY_VERSION,
      records: Array.from(this.records.values()).sort((a, b) => a.tick - b.tick),
    };
  }

  /**
   * Restore from serialized state. Accepts the versioned envelope written by
   * `serialize()` AND the legacy bare-array format (saves written before
   * CAMPAIGN_MEMORY_VERSION existed) — legacy saves upgrade to the envelope on
   * their next serialize().
   *
   * CA-06: guards malformed input with a clear, actionable error instead of letting a raw
   * TypeError escape ("records is not iterable", "cannot read 'id' of null"). The thrown
   * Error names the offending element index/field and how to fix it.
   *
   * CM-01 extends the guard below the top level: an envelope stamped with a
   * NEWER schema version is rejected (upgrade the package), and every record is
   * validated field-by-field (tick, category, significance, witnesses, …) so a
   * corrupt record fails HERE instead of NaN-sorting inside query() or throwing
   * deep in buildFinaleOutline().
   */
  static deserialize(input: SerializedJournal | CampaignRecord[]): CampaignJournal {
    let records: unknown[];
    if (Array.isArray(input)) {
      // Legacy pre-versioning format: a bare array of records.
      records = input;
    } else if (typeof input === 'object' && input !== null) {
      const version = (input as { version?: unknown }).version;
      if (typeof version !== 'number' || !Number.isFinite(version)) {
        throw new Error(
          `CampaignJournal.deserialize: envelope version must be a number (got ${typeof version}) — expected the { version, records } value returned by serialize(), or a legacy array of records`,
        );
      }
      if (version > CAMPAIGN_MEMORY_VERSION) {
        throw new Error(
          `CampaignJournal.deserialize: save version ${version} is newer than supported version ${CAMPAIGN_MEMORY_VERSION} — upgrade @ai-rpg-engine/campaign-memory to load this save`,
        );
      }
      const envRecords = (input as { records?: unknown }).records;
      if (!Array.isArray(envRecords)) {
        throw new Error(
          `CampaignJournal.deserialize: envelope records must be an array (got ${envRecords === null ? 'null' : typeof envRecords})`,
        );
      }
      records = envRecords;
    } else {
      throw new Error(
        `CampaignJournal.deserialize: expected an array of records or a { version, records } envelope (got ${input === null ? 'null' : typeof input}) — pass the value returned by serialize()`,
      );
    }

    const journal = new CampaignJournal();
    const restored: CampaignRecord[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (typeof record !== 'object' || record === null) {
        throw new Error(
          `CampaignJournal.deserialize: record[${i}] must be an object (got ${record === null ? 'null' : typeof record})`,
        );
      }
      if (typeof (record as { id?: unknown }).id !== 'string') {
        throw new Error(
          `CampaignJournal.deserialize: record[${i}] is missing a string "id" — each record needs an id like "cr_1"`,
        );
      }
      // CM-01: full per-record substructure validation (tick, category,
      // significance, witnesses, …) via the shared validator.
      const errors = validateCampaignRecord(record);
      if (errors.length > 0) {
        const detail = errors.map((e) => `${e.field} ${e.message}`).join('; ');
        throw new Error(
          `CampaignJournal.deserialize: record[${i}] is invalid — ${detail}`,
        );
      }
      const valid = record as CampaignRecord;
      journal.records.set(valid.id, valid);
      restored.push(valid);
    }
    // Advance THIS instance's counter past the highest restored id (CP-01).
    let maxNum = 0;
    for (const r of restored) {
      const match = r.id.match(/^cr_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    journal.nextRecordId = maxNum + 1;
    return journal;
  }
}
