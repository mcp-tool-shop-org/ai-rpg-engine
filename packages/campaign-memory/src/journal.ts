// CampaignJournal — persistent record of significant campaign events

import type { CampaignRecord, RecordCategory } from './types.js';

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

  /** Serializable state for persistence */
  serialize(): CampaignRecord[] {
    return Array.from(this.records.values()).sort((a, b) => a.tick - b.tick);
  }

  /**
   * Restore from serialized state.
   *
   * CA-06: guards malformed input with a clear, actionable error instead of letting a raw
   * TypeError escape ("records is not iterable", "cannot read 'id' of null"). The thrown
   * Error names the offending element index/field and how to fix it.
   */
  static deserialize(records: CampaignRecord[]): CampaignJournal {
    if (!Array.isArray(records)) {
      throw new Error(
        `CampaignJournal.deserialize: expected an array of records (got ${records === null ? 'null' : typeof records}) — pass the value returned by serialize()`,
      );
    }
    const journal = new CampaignJournal();
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
      journal.records.set(record.id, record);
    }
    // Advance THIS instance's counter past the highest restored id (CP-01).
    let maxNum = 0;
    for (const r of records) {
      const match = r.id.match(/^cr_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    journal.nextRecordId = maxNum + 1;
    return journal;
  }
}
