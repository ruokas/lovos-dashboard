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
});
