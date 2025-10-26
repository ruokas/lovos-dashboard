import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { SupabaseAuthManager } from '../auth/supabaseAuth.js';
import { t, texts } from '../texts.js';

describe('SupabaseAuthManager', () => {
  function createDom() {
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <div id="authStatus" class="hidden"><span id="authStatusText"></span><button id="authSignOutBtn" class="hidden"></button></div>
    </body>`);
    return dom;
  }

  it('grąžina offline būseną kai klientas nepateiktas', async () => {
    const dom = createDom();
    const manager = new SupabaseAuthManager({ document: dom.window.document });
    const result = await manager.ensureAuthenticated();
    expect(result.status).toBe('offline');
    const statusText = dom.window.document.getElementById('authStatusText').textContent;
    expect(statusText).toBe(t(texts.auth.offline));
  });

  it('rodo prisijungusį naudotoją kai sesija aktyvi', async () => {
    const dom = createDom();
    const fakeClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { email: 'nurse@example.com' } } },
          error: null,
        }),
      },
    };

    const manager = new SupabaseAuthManager({ document: dom.window.document, client: fakeClient });
    const result = await manager.ensureAuthenticated();

    expect(result.status).toBe('authenticated');
    const statusText = dom.window.document.getElementById('authStatusText').textContent;
    expect(statusText).toBe(`${t(texts.auth.signedInAs)} nurse@example.com`);
    const signOutHidden = dom.window.document.getElementById('authSignOutBtn').classList.contains('hidden');
    expect(signOutHidden).toBe(false);
  });

  it('prenumeruoja ir reaguoja į Supabase auth įvykius', async () => {
    const dom = createDom();
    const unsubscribe = vi.fn();
    let handler;
    const onAuthStateChanged = vi.fn();
    const fakeClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockImplementation((cb) => {
          handler = cb;
          return { data: { subscription: { unsubscribe } }, error: null };
        }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'nurse@example.com' } }, error: null }),
      },
    };

    const manager = new SupabaseAuthManager({
      document: dom.window.document,
      client: fakeClient,
      onAuthStateChanged,
    });

    expect(fakeClient.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(typeof handler).toBe('function');

    const session = { user: { email: 'nurse@example.com' } };
    await handler('SIGNED_IN', session);

    expect(onAuthStateChanged).toHaveBeenCalledWith(session, expect.objectContaining({
      reason: 'auth-event',
      event: 'SIGNED_IN',
    }));
    const signOutHidden = dom.window.document.getElementById('authSignOutBtn').classList.contains('hidden');
    expect(signOutHidden).toBe(false);

    await handler('SIGNED_OUT', null);
    expect(onAuthStateChanged).toHaveBeenCalledWith(null, expect.objectContaining({
      reason: 'auth-event',
      event: 'SIGNED_OUT',
    }));
    const signOutHiddenAfter = dom.window.document.getElementById('authSignOutBtn').classList.contains('hidden');
    expect(signOutHiddenAfter).toBe(true);

    manager.setClient(null);
    expect(unsubscribe).toHaveBeenCalled();
    const statusText = dom.window.document.getElementById('authStatusText').textContent;
    expect(statusText).toBe(t(texts.auth.offline));
  });
});
