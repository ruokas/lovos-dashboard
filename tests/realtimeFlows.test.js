import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BedDataManager, DEFAULT_SETTINGS, STATUS_OPTIONS } from '../models/bedData.js';
import { NotificationManager } from '../notifications/notificationManager.js';

class FakeSettingsManager {
  constructor(overrides = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...overrides };
    this.listeners = [];
  }

  addListener(listener) {
    this.listeners.push(listener);
    listener(this.settings);
  }

  getSettings() {
    return this.settings;
  }
}

describe('Realaus laiko srautai', () => {
  let bedDataManager;
  let notificationManager;
  let dom;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><body></body>`, { url: 'http://localhost' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Notification = class {
      static permission = 'granted';
      constructor() {}
      static requestPermission() {
        return Promise.resolve('granted');
      }
    };

    bedDataManager = new BedDataManager();
    document.body.innerHTML = `
      <div id="notificationSummary"></div>
      <div id="alerts" class="hidden"></div>
    `;
    notificationManager = new NotificationManager(new FakeSettingsManager({
      soundEnabled: false,
      notificationsEnabled: false,
    }));
    vi.spyOn(notificationManager, 'showNotifications').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.Notification;
  });

  it('neleidžia dubliuoti realaus laiko būsenos įvykių pagal ID', () => {
    const timestamp = new Date().toISOString();
    const payload = {
      id: 'evt-1',
      timestamp,
      bedId: '1',
      status: STATUS_OPTIONS.MESSY_BED,
      email: 'nurse@example.com',
      description: 'Reikia sutvarkyti lovą',
    };

    const firstInsert = bedDataManager.addFormResponse(payload);
    const duplicateInsert = bedDataManager.addFormResponse(payload);

    expect(firstInsert).toBe(true);
    expect(duplicateInsert).toBe(false);
    expect(bedDataManager.formResponses).toHaveLength(1);
  });

  it('leidžia atnaujinti esamą būsenos įvykį', () => {
    const timestamp = new Date().toISOString();
    const payload = {
      id: 'evt-2',
      timestamp,
      bedId: '2',
      status: STATUS_OPTIONS.MESSY_BED,
      email: 'nurse@example.com',
      description: 'Pradinis įrašas',
    };

    const updatePayload = {
      ...payload,
      status: STATUS_OPTIONS.MISSING_EQUIPMENT,
      description: 'Trūksta lašelinės',
    };

    const firstInsert = bedDataManager.addFormResponse(payload);
    const updateResult = bedDataManager.addFormResponse(updatePayload, { allowUpdate: true });

    expect(firstInsert).toBe(true);
    expect(updateResult).toBe(true);
    expect(bedDataManager.formResponses).toHaveLength(1);
    expect(bedDataManager.formResponses[0].status).toBe(STATUS_OPTIONS.MISSING_EQUIPMENT);
  });

  it('sukuria pranešimą kai lova atlaisvinama realiu laiku', () => {
    const now = new Date().toISOString();
    bedDataManager.addOccupancyData({
      id: 'occ-1',
      bedId: '3',
      timestamp: now,
      status: 'occupied',
      createdBy: 'nurse@example.com',
      patientCode: 'PX-1',
    });

    bedDataManager.addOccupancyData({
      id: 'occ-2',
      bedId: '3',
      timestamp: now,
      status: 'free',
      createdBy: 'nurse@example.com',
      patientCode: '',
    });

    notificationManager.updateNotifications(bedDataManager.getAllBeds(), [], { suppressAlerts: true });
    const stats = notificationManager.getNotificationStats(bedDataManager.getAllBeds());

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.low).toBeGreaterThanOrEqual(1);
  });

  it('kai nėra būsenos, realaus laiko įrašai naudoja occupancy lauką užimtumui nustatyti', () => {
    const occupiedAt = new Date('2024-03-01T10:00:00.000Z').toISOString();
    bedDataManager.addOccupancyData({
      id: 'occ-3',
      bedId: '5',
      timestamp: occupiedAt,
      status: '',
      occupancy: true,
      patientCode: '',
      createdBy: 'nurse.alpha@example.com',
      metadata: {},
    });

    const bed = bedDataManager.beds.get('5');
    expect(bed.occupancyStatus).toBe('occupied');
    expect(bed.currentPatientCode).toBeNull();
    expect(bed.occupancyAssignedNurse).toBe('nurse.alpha@example.com');
  });

  it('kai occupancy reikšmė false, lova tampa laisva net jei statusas neperduotas', () => {
    const freedAt = new Date('2024-03-01T12:00:00.000Z').toISOString();
    bedDataManager.addOccupancyData({
      id: 'occ-4',
      bedId: '6',
      timestamp: freedAt,
      status: '',
      occupancy: false,
      patientCode: 'LEGACY',
      createdBy: 'nurse.beta@example.com',
      metadata: {},
    });

    const bed = bedDataManager.beds.get('6');
    expect(bed.occupancyStatus).toBe('free');
    expect(bed.currentPatientCode).toBeNull();
    expect(bed.occupancyAssignedNurse).toBe('nurse.beta@example.com');
  });
});
