import { describe, it, expect } from 'vitest';
import { BedDataManager, STATUS_OPTIONS } from '../models/bedData.js';

describe('BedDataManager.applyAggregatedState', () => {
  it('atnaujina lovos būseną ir pranešimus pagal suvestinę', () => {
    const manager = new BedDataManager();
    const statusTimestamp = '2024-01-05T10:00:00.000Z';
    const occupancyTimestamp = '2024-01-05T09:30:00.000Z';

    manager.applyAggregatedState([
      {
        bedId: 'IT1',
        status: STATUS_OPTIONS.MESSY_BED,
        statusNotes: 'Reikia tvarkyti',
        statusReportedBy: 'nurse@example.com',
        statusCreatedAt: statusTimestamp,
        occupancyState: 'occupied',
        occupancyCreatedAt: occupancyTimestamp,
      },
    ]);

    const bed = manager.beds.get('IT1');
    expect(bed.currentStatus).toBe(STATUS_OPTIONS.MESSY_BED);
    expect(bed.problemDescription).toBe('Reikia tvarkyti');
    expect(bed.lastCheckedTime?.toISOString()).toBe(statusTimestamp);
    expect(bed.lastCheckedEmail).toBe('nurse@example.com');
    expect(bed.occupancyStatus).toBe('occupied');
    expect(bed.lastOccupiedTime?.toISOString()).toBe(occupancyTimestamp);
    expect(bed.notifications.some((n) => n.type === 'messy_bed')).toBe(true);
    expect(manager.formResponses).toHaveLength(0);
    expect(manager.occupancyData).toHaveLength(0);
  });

  it('numato laisvą lovą kai nėra užimtumo įrašo', () => {
    const manager = new BedDataManager();

    manager.applyAggregatedState([
      {
        bedId: 'IT2',
        status: STATUS_OPTIONS.CLEAN,
        statusCreatedAt: '2024-01-05T07:00:00.000Z',
        statusReportedBy: 'nurse@example.com',
      },
    ]);

    const bed = manager.beds.get('IT2');
    expect(bed.occupancyStatus).toBe('free');
    expect(bed.lastFreedTime).toBeNull();
    expect(bed.notifications).toHaveLength(0);
  });
});
