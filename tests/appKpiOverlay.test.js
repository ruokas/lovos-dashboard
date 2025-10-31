// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BedManagementApp } from '../app.js';

describe('BedManagementApp KPI overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="loadingIndicator" class="hidden"></div>
      <div id="reportingNotice" class="hidden"></div>
      <div id="kpis"></div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('naudoja vietinius CSV duomenis užimtumo kortelei, kai Supabase grąžina 0', async () => {
    const app = new BedManagementApp();
    app.usingCsvOccupancy = true;

    vi.spyOn(app.reportingService, 'fetchKpiSnapshot').mockResolvedValue({
      source: 'supabase',
      generatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      totals: {
        totalBeds: 0,
        occupiedBeds: 0,
        freeBeds: 0,
      },
    });

    vi.spyOn(app.bedDataManager, 'getStatistics').mockReturnValue({
      totalBeds: 12,
      cleanBeds: 0,
      messyBeds: 0,
      missingEquipment: 0,
      otherProblems: 0,
      occupiedBeds: 5,
      freeBeds: 7,
      bedsNeedingCheck: 1,
      recentlyFreedBeds: 0,
    });

    await app.renderKPIs();

    const occupiedCard = document.querySelector('[data-variant="occupied"] .kpi-card__value');
    expect(occupiedCard?.textContent).toBe('5');

    const notice = document.getElementById('reportingNotice');
    expect(notice?.textContent).toBe('Supabase KPI duomenys nepilni – rodome CSV pagrįstą suvestinę.');
  });

  it('rodo ką tik atlaisvintų lovų skaičių "Reikia sutvarkyti" kortelėje', async () => {
    const app = new BedManagementApp();

    vi.spyOn(app.reportingService, 'fetchKpiSnapshot').mockResolvedValue({
      source: 'supabase',
      generatedAt: new Date('2024-02-01T00:00:00Z').toISOString(),
      totals: {
        totalBeds: 10,
        cleanBeds: 4,
        occupiedBeds: 5,
        recentlyFreedBeds: 3,
        attentionBeds: 7,
      },
    });

    vi.spyOn(app.bedDataManager, 'getStatistics').mockReturnValue({
      totalBeds: 10,
      cleanBeds: 4,
      messyBeds: 0,
      missingEquipment: 0,
      otherProblems: 0,
      occupiedBeds: 5,
      freeBeds: 5,
      bedsNeedingCheck: 0,
      recentlyFreedBeds: 3,
    });

    await app.renderKPIs();

    const cleaningCard = document.querySelector('[data-variant="attention"] .kpi-card__value');
    expect(cleaningCard?.textContent).toBe('3');
  });
});

