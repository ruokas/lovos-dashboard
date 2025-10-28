import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

const { createClient } = await import('@supabase/supabase-js');
const { getSupabaseConfig } = await import('../config/supabaseConfig.js');
const { getSupabaseClient, resetSupabaseClient } = await import('../persistence/supabaseClient.js');

describe('Supabase config ir klientas', () => {
  beforeEach(() => {
    resetSupabaseClient();
    vi.clearAllMocks();
  });

  it('perskaito URL ir raktą iš data atributų', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockRoot = {
      dataset: {
        supabaseUrl: 'https://test-project.supabase.co',
        supabaseKey: 'anon-key',
      },
    };
    const mockDocument = {
      querySelector: vi.fn(() => mockRoot),
    };

    const config = getSupabaseConfig(mockDocument);

    expect(config).toEqual({
      url: 'https://test-project.supabase.co',
      key: 'anon-key',
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sukuria vieną Supabase klientą ir naudoja perskaitytą konfigūraciją', () => {
    const mockRoot = {
      dataset: {
        supabaseUrl: 'https://test-project.supabase.co',
        supabaseKey: 'anon-key',
      },
    };
    const mockDocument = {
      querySelector: vi.fn(() => mockRoot),
    };

    const first = getSupabaseClient(mockDocument);
    const second = getSupabaseClient(mockDocument);

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://test-project.supabase.co', 'anon-key', {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'lovos_dashboard_supabase',
      },
    });
  });

  it('mėgina sukurti klientą be konfigūracijos ir meta aiškią klaidą', () => {
    const mockDocument = {
      querySelector: vi.fn(() => null),
    };

    expect(() => getSupabaseClient(mockDocument)).toThrow(
      'Nuotolinės paslaugos URL arba anon raktas nerastas. Patikrinkite `data-*` atributus ar aplinkos kintamuosius.'
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});
