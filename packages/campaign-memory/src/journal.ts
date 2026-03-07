// CampaignJournal — persistent record of significant campaign events

import type { CampaignRecord, RecordCategory } from './types.js';

let nextRecordId = 1;

function generateId(): string {
  return `cr_${nextRecordId++}`;
}

export type JournalQueryFilters = {
  actorId?: string;
  targetId?: string;
  category?: RecordCategory;
  minSignificance?: number;
  afterTick?: number;
};

export class CampaignJournal {
  private records: Map<string, CampaignRecord> = new Map();

  /** Record a significant event. Returns the created record with generated ID. */
  record(entry: Omit<CampaignRecord, 'id'>): CampaignRecord {
    const record: CampaignRecord = { id: generateId(), ...entry };
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

  /** Restore from serialized state */
  static deserialize(records: CampaignRecord[]): CampaignJournal {
    const journal = new CampaignJournal();
    for (const record of records) {
      journal.records.set(record.id, record);
    }
    // Ensure ID counter is ahead of existing records
    let maxNum = 0;
    for (const r of records) {
      const match = r.id.match(/^cr_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    nextRecordId = maxNum + 1;
    return journal;
  }
}
