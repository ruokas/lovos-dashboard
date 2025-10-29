import { describe, it, expect } from 'vitest';
import { BedData } from '../models/bedData.js';

describe('BedData.updateOccupancy', () => {
  it('nustato užimtumą į occupied net kai ankstesnė būsena nežinoma', () => {
    const bed = new BedData('1');
    bed.occupancyStatus = 'unknown';

    const timestamp = '2024-01-01T10:00:00.000Z';
    bed.updateOccupancy({ status: 'occupied', timestamp });

    expect(bed.occupancyStatus).toBe('occupied');
    expect(bed.lastOccupiedTime?.toISOString()).toBe(timestamp);
  });

  it('atnaujina laisvos lovos laiką ir būseną', () => {
    const bed = new BedData('2');
    bed.occupancyStatus = 'occupied';

    const timestamp = '2024-01-01T12:00:00.000Z';
    bed.updateOccupancy({ status: 'free', timestamp });

    expect(bed.occupancyStatus).toBe('free');
    expect(bed.lastFreedTime?.toISOString()).toBe(timestamp);
  });

  it('žymi valomą lovą kaip cleaning ir fiksuoja laiką', () => {
    const bed = new BedData('3');
    const timestamp = '2024-01-01T13:15:00.000Z';

    bed.updateOccupancy({ status: 'cleaning', timestamp });

    expect(bed.occupancyStatus).toBe('cleaning');
    expect(bed.lastFreedTime?.toISOString()).toBe(timestamp);
  });
});
