import { getSupabaseClient } from '../persistence/supabaseClient.js';
import { t, texts } from '../texts.js';

/**
 * Centralizuotas naudotojo veiksmų žurnalas Supabase ir lokaliam režimui.
 */
export class UserInteractionLogger {
  constructor(options = {}) {
    this.document = options.document;
    this.client = options.client ?? this.#createClient(options.document);
    this.cachedUserEmail = null;
    this.emailLookupAttempted = false;
  }

  #createClient(doc) {
    try {
      return getSupabaseClient(doc);
    } catch (error) {
      console.info('Nuotolinės paslaugos klientas nepasiekiamas, žurnalas veikia offline režimu.', error);
      return null;
    }
  }

  setClient(client) {
    this.client = client ?? null;
    this.resetCachedEmail();
  }

  /**
   * Užfiksuoja naudotojo veiksmą. Klaidos neužkerta kelio naudotojo darbui.
   * @param {string} action
   * @param {Record<string, any>} [metadata]
   * @returns {Promise<{stored: boolean, error?: Error}>}
   */
  async logInteraction(interactionType, metadata = {}) {
    const payloadMetadata = metadata ?? {};
    const performedBy = await this.#resolvePerformedBy();
    const basePayload = {
      interaction_type: interactionType,
      bed_id: payloadMetadata.bedUuid ?? payloadMetadata.bedId ?? null,
      tag_code:
        payloadMetadata.tagCode ??
        payloadMetadata.tag_code ??
        payloadMetadata.tag ??
        payloadMetadata.payload?.tag ??
        null,
      payload: payloadMetadata.payload ?? payloadMetadata,
      performed_by: performedBy,
    };

    if (!this.client) {
      console.info('[Offline log]', interactionType, basePayload);
      return { stored: false, message: t(texts.logger.offline) };
    }

    if (!basePayload.performed_by) {
      console.info('[Offline log]', interactionType, basePayload);
      console.warn(
        'Nuotolinės paslaugos naudotojo el. paštas nerastas – veiksmas išsaugotas tik vietoje. Prisijunkite prie sistemos ir bandykite dar kartą.'
      );
      return { stored: false, message: t(texts.logger.offline), missingEmail: true };
    }

    try {
      const { error } = await this.client.from('user_interactions').insert(basePayload);
      if (error) {
        if (this.#isMissingColumnError(error, 'interaction_type')) {
          await this.#insertLegacySchema(interactionType, payloadMetadata, basePayload.performed_by);
          return { stored: true, downgraded: true };
        }
        if (this.#isMissingColumnError(error, 'tag_code')) {
          const { error: retryError } = await this.client
            .from('user_interactions')
            .insert(this.#stripUndefined({ ...basePayload, tag_code: undefined }));
          if (retryError) {
            throw retryError;
          }
          return { stored: true, downgraded: true };
        }
        if (this.#isRlsViolation(error)) {
          console.warn('Nuotolinės paslaugos RLS atmetė naudotojo veiksmo įrašą:', error);
          return { stored: false, error, rlsViolation: true };
        }
        throw error;
      }
      return { stored: true };
    } catch (error) {
      if (this.#isMissingColumnError(error, 'interaction_type')) {
        try {
          await this.#insertLegacySchema(interactionType, payloadMetadata, basePayload.performed_by);
          return { stored: true, downgraded: true };
        } catch (legacyError) {
          console.error('Nepavyko įrašyti naudotojo veiksmo (legacy schema) į nuotolinę paslaugą:', legacyError);
          return { stored: false, error: legacyError };
        }
      }
      if (this.#isRlsViolation(error)) {
        console.warn('Nuotolinės paslaugos RLS atmetė naudotojo veiksmo įrašą:', error);
        return { stored: false, error, rlsViolation: true };
      }
      console.error('Nepavyko įrašyti naudotojo veiksmo į nuotolinę paslaugą:', error);
      return { stored: false, error };
    }
  }

  async #resolvePerformedBy() {
    return this.#getAuthenticatedEmail();
  }

  async #getAuthenticatedEmail() {
    if (!this.client) {
      return null;
    }

    if (this.emailLookupAttempted) {
      return this.cachedUserEmail;
    }

    this.emailLookupAttempted = true;
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error) {
        throw error;
      }
      this.cachedUserEmail = data?.user?.email ?? null;
    } catch (error) {
      if (this.#isMissingAuthSession(error)) {
        console.info(
          'Nuotolinės paslaugos naudotojo sesija nerasta. Veiksmai bus žymimi kaip vietiniai, kol neprisijungsite.',
          error
        );
      } else {
        console.warn('Nepavyko nustatyti prisijungusio naudotojo el. pašto nuotolinės paslaugos kliente:', error);
      }
      this.cachedUserEmail = null;
    }
    return this.cachedUserEmail;
  }

  resetCachedEmail() {
    this.cachedUserEmail = null;
    this.emailLookupAttempted = false;
  }

  #isMissingColumnError(error, columnName) {
    const message = error?.message ?? '';
    return error?.code === 'PGRST204' && message.includes(`'${columnName}'`);
  }

  #isRlsViolation(error) {
    return error?.code === '42501';
  }

  #isMissingAuthSession(error) {
    if (!error) {
      return false;
    }
    const message = String(error?.message ?? '').toLowerCase();
    return error?.name === 'AuthSessionMissingError' || message.includes('auth session missing');
  }

  async #insertLegacySchema(action, metadata, performedBy) {
    const legacyPayload = this.#stripUndefined({
      action,
      bed_id: metadata?.bedUuid ?? metadata?.bedId ?? null,
      payload: metadata?.payload ?? metadata,
      performed_by: performedBy ?? metadata?.email ?? metadata?.user ?? metadata?.createdBy ?? null,
    });

    const { error } = await this.client.from('user_interactions').insert(legacyPayload);
    if (error) {
      throw error;
    }
  }

  #stripUndefined(record) {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== undefined)
    );
  }
}

let sharedLogger;

export function getUserInteractionLogger(options = {}) {
  if (!sharedLogger) {
    sharedLogger = new UserInteractionLogger(options);
  } else if (options.client) {
    sharedLogger.setClient(options.client);
  }
  return sharedLogger;
}
