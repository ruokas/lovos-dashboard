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
        occupancy: true,
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

  it('kai lentelėje nėra būsenos, užimtumą nustato pagal occupancy lauką', () => {
    const manager = new BedDataManager();

    manager.applyAggregatedState([
      {
        bedId: '1',
        occupancyState: null,
        occupancyCreatedAt: '2024-02-01T08:15:00.000Z',
        occupancy: true,
        patientCode: '',
        occupancyCreatedBy: 'slaugytoja@example.com',
      },
    ]);

    const bed = manager.beds.get('1');
    expect(bed.occupancyStatus).toBe('occupied');
    expect(bed.currentPatientCode).toBeNull();
    expect(bed.occupancyAssignedNurse).toBe('slaugytoja@example.com');
  });

  it('kai occupancy reikšmė false, lova laikoma laisva net jei pacientas nenuvalytas', () => {
    const manager = new BedDataManager();

    manager.applyAggregatedState([
      {
        bedId: '3',
        occupancyState: null,
        occupancyCreatedAt: '2024-02-02T10:00:00.000Z',
        occupancy: false,
        patientCode: 'PAC-OLD',
        occupancyCreatedBy: 'nurse.beta@example.com',
      },
    ]);

    const bed = manager.beds.get('3');
    expect(bed.occupancyStatus).toBe('free');
    expect(bed.currentPatientCode).toBeNull();
    expect(bed.occupancyAssignedNurse).toBe('nurse.beta@example.com');
  });

  it('išsaugo atsakingą slaugytoją ir laisvina lovą kai pacientas pašalintas', () => {
    const manager = new BedDataManager();

    manager.applyAggregatedState([
      {
        bedId: '2',
        occupancyState: 'occupied',
        occupancyCreatedAt: '2024-02-01T06:00:00.000Z',
        patientCode: 'PX-9',
        occupancyCreatedBy: 'nurse.one@example.com',
      },
      {
        bedId: '2',
        occupancyState: null,
        occupancyCreatedAt: '2024-02-01T08:00:00.000Z',
        patientCode: '',
        occupancyCreatedBy: 'nurse.two@example.com',
      },
    ]);

    const bed = manager.beds.get('2');
    expect(bed.occupancyStatus).toBe('free');
    expect(bed.occupancyAssignedNurse).toBe('nurse.two@example.com');
    expect(bed.currentPatientCode).toBeNull();
  });
});
