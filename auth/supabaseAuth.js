import { t, texts } from '../texts.js';

/**
 * Supabase autentikacijos valdiklis: rūpinasi prisijungimo forma ir būsenos indikatoriumi.
 */
export class SupabaseAuthManager {
  constructor(options = {}) {
    this.client = options.client ?? null;
    this.document = options.document ?? (typeof document !== 'undefined' ? document : null);
    this.onAuthStateChanged = options.onAuthStateChanged ?? null;

    this.session = null;
    this.overlayElement = null;
    this.formElement = null;
    this.messageElement = null;
    this.submitButton = null;
    this.pendingResolve = null;
    this.isSubmitting = false;
    this.signOutListenerAttached = false;
    this.authStateSubscription = null;

    if (this.client) {
      this.#subscribeToAuthChanges();
    }
  }

  setClient(client) {
    if (this.client === client) {
      return;
    }

    this.#cleanupAuthSubscription();
    this.client = client ?? null;
    if (!this.client) {
      this.session = null;
      this.hideOverlay();
      this.updateStatus(t(texts.auth.offline), 'offline');
      return;
    }

    this.#subscribeToAuthChanges();
  }

  async ensureAuthenticated() {
    if (!this.client?.auth) {
      this.updateStatus(t(texts.auth.offline), 'offline');
      return { status: 'offline' };
    }

    this.#subscribeToAuthChanges();

    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) {
        console.warn('Supabase sesijos patikrinimas nepavyko:', error);
        this.updateStatus(t(texts.auth.offline), 'offline');
        return { status: 'offline', error };
      }

      if (data?.session) {
        this.session = data.session;
        const email = this.session.user?.email ?? '';
        this.updateStatus(`${t(texts.auth.signedInAs)} ${email}`, 'authenticated');
        this.bindSignOutButton();
        return { status: 'authenticated', session: this.session };
      }
    } catch (error) {
      console.warn('Supabase sesijos patikrinimas nepavyko:', error);
      this.updateStatus(t(texts.auth.offline), 'offline');
      return { status: 'offline', error };
    }

    this.renderOverlay();
    this.updateStatus(t(texts.auth.loginRequired), 'needs-auth');

    return await new Promise((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  renderOverlay() {
    if (!this.document || this.overlayElement) {
      return;
    }

    const overlay = this.document.createElement('div');
    overlay.id = 'supabaseAuthOverlay';
    overlay.className = 'fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="max-w-sm w-full bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 space-y-4" role="dialog" aria-modal="true">
        <div>
          <h2 class="text-xl font-semibold text-slate-900 dark:text-slate-100">${t(texts.auth.title)}</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">${t(texts.auth.description)}</p>
        </div>
        <form class="space-y-3" id="supabaseAuthForm">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="supabaseAuthEmail">${t(texts.auth.emailLabel)}</label>
            <input type="email" id="supabaseAuthEmail" name="email" required autocomplete="email"
              class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" for="supabaseAuthPassword">${t(texts.auth.passwordLabel)}</label>
            <input type="password" id="supabaseAuthPassword" name="password" required autocomplete="current-password"
              class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div id="supabaseAuthMessage" class="text-sm text-slate-600 dark:text-slate-300" aria-live="polite"></div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="submit" data-auth-submit class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors">
              ${t(texts.auth.submit)}
            </button>
          </div>
        </form>
      </div>
    `;

    this.overlayElement = overlay;
    this.formElement = overlay.querySelector('#supabaseAuthForm');
    this.messageElement = overlay.querySelector('#supabaseAuthMessage');
    this.submitButton = overlay.querySelector('[data-auth-submit]');

    this.formElement.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.isSubmitting) {
        return;
      }
      const formData = new FormData(this.formElement);
      const email = String(formData.get('email') ?? '').trim();
      const password = String(formData.get('password') ?? '').trim();
      void this.handleSignIn(email, password);
    });

    this.document.body.appendChild(overlay);

    const emailInput = overlay.querySelector('#supabaseAuthEmail');
    setTimeout(() => {
      emailInput?.focus();
    }, 0);
  }

  async handleSignIn(email, password) {
    if (!email || !password) {
      this.showMessage(t(texts.auth.missingCredentials), 'error');
      return { success: false, reason: 'validation' };
    }

    if (!this.client?.auth) {
      this.showMessage(t(texts.auth.offline), 'error');
      return { success: false, reason: 'offline' };
    }

    this.setSubmitting(true);
    this.showMessage(t(texts.auth.signingIn), 'info');

    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      this.session = data.session;
      this.hideOverlay();
      this.updateStatus(`${t(texts.auth.signedInAs)} ${email}`, 'authenticated');
      this.bindSignOutButton();

      if (this.pendingResolve) {
        this.pendingResolve({ status: 'authenticated', session: this.session });
        this.pendingResolve = null;
      }

      if (this.onAuthStateChanged) {
        this.onAuthStateChanged(this.session, { reason: 'signin' });
      }

      return { success: true };
    } catch (error) {
      const message = error?.message ? String(error.message) : t(texts.auth.signInError);
      this.showMessage(message, 'error');
      return { success: false, error };
    } finally {
      this.setSubmitting(false);
    }
  }

  async signOut() {
    if (this.isSubmitting) {
      return { success: false };
    }

    if (this.client?.auth) {
      try {
        await this.client.auth.signOut();
      } catch (error) {
        const message = error?.message ? String(error.message) : t(texts.auth.signInError);
        this.showMessage(message, 'error');
        return { success: false, error };
      }
    }

    this.session = null;
    this.renderOverlay();
    this.updateStatus(t(texts.auth.loginRequired), 'needs-auth');
    this.showMessage(t(texts.auth.signOutSuccess), 'info');

    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(null, { reason: 'signout' });
    }

    return { success: true };
  }

  bindSignOutButton() {
    if (!this.document) return;

    const container = this.document.getElementById('authStatus');
    const textElement = this.document.getElementById('authStatusText');
    const signOutButton = this.document.getElementById('authSignOutBtn');

    if (!container || !textElement || !signOutButton) {
      return;
    }

    container.classList.remove('hidden');
    textElement.textContent = `${t(texts.auth.signedInAs)} ${this.session?.user?.email ?? ''}`;
    signOutButton.textContent = t(texts.auth.signOut);
    signOutButton.classList.remove('hidden');

    if (!this.signOutListenerAttached) {
      signOutButton.addEventListener('click', (event) => {
        event.preventDefault();
        void this.signOut();
      });
      this.signOutListenerAttached = true;
    }
  }

  hideOverlay() {
    if (this.overlayElement?.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.formElement = null;
    this.messageElement = null;
    this.submitButton = null;
    this.isSubmitting = false;
  }

  showMessage(message, type = 'info') {
    if (!this.messageElement) return;

    const colorMap = {
      info: 'text-slate-600 dark:text-slate-300',
      error: 'text-red-600 dark:text-red-300',
    };

    this.messageElement.className = `text-sm ${colorMap[type] ?? colorMap.info}`;
    this.messageElement.textContent = message;
  }

  setSubmitting(isSubmitting) {
    this.isSubmitting = isSubmitting;
    if (!this.submitButton) return;

    this.submitButton.disabled = isSubmitting;
    if (isSubmitting) {
      this.submitButton.textContent = t(texts.auth.signingIn);
      this.submitButton.classList.add('opacity-70', 'cursor-wait');
    } else {
      this.submitButton.textContent = t(texts.auth.submit);
      this.submitButton.classList.remove('opacity-70', 'cursor-wait');
    }
  }

  updateStatus(text, state) {
    if (!this.document) return;

    const container = this.document.getElementById('authStatus');
    const textElement = this.document.getElementById('authStatusText');
    const signOutButton = this.document.getElementById('authSignOutBtn');

    if (!container || !textElement || !signOutButton) {
      return;
    }

    textElement.textContent = text;

    if (state === 'authenticated') {
      container.classList.remove('hidden');
      signOutButton.classList.remove('hidden');
      signOutButton.textContent = t(texts.auth.signOut);
    } else if (state === 'offline' || state === 'needs-auth') {
      container.classList.remove('hidden');
      signOutButton.classList.add('hidden');
    }
  }

  #subscribeToAuthChanges() {
    if (!this.client?.auth?.onAuthStateChange || this.authStateSubscription) {
      return;
    }

    try {
      const { data, error } = this.client.auth.onAuthStateChange((event, session) => {
        this.#handleAuthEvent(event, session);
      });

      if (error) {
        console.warn('Supabase auth prenumeratos klaida:', error);
        return;
      }

      this.authStateSubscription = data?.subscription ?? null;
    } catch (error) {
      console.warn('Supabase auth prenumeratos išimtis:', error);
    }
  }

  #handleAuthEvent(event, session) {
    if (session) {
      this.session = session;
      const email = session.user?.email ?? '';
      this.hideOverlay();
      this.updateStatus(`${t(texts.auth.signedInAs)} ${email}`, 'authenticated');
      this.bindSignOutButton();
    } else {
      this.session = null;
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        this.renderOverlay();
      }
      this.updateStatus(t(texts.auth.loginRequired), 'needs-auth');
    }

    if (this.onAuthStateChanged) {
      this.onAuthStateChanged(session ?? null, { reason: 'auth-event', event });
    }
  }

  #cleanupAuthSubscription() {
    try {
      this.authStateSubscription?.unsubscribe?.();
    } catch (error) {
      console.warn('Nepavyko nutraukti Supabase auth prenumeratos:', error);
    }
    this.authStateSubscription = null;
  }
}
