import { getSupabaseClient } from '../persistence/supabaseClient.js';
import { t, texts } from '../texts.js';

/**
 * Centralizuotas naudotojo veiksmų žurnalas Supabase ir lokaliam režimui.
 */
export class UserInteractionLogger {
  constructor(options = {}) {
    this.document = options.document;
    this.client = options.client ?? this.#createClient(options.document);
  }

  #createClient(doc) {
    try {
      return getSupabaseClient(doc);
    } catch (error) {
      console.info('Supabase klientas nepasiekiamas, žurnalas veikia offline režimu.', error);
      return null;
    }
  }

  setClient(client) {
    if (client) {
      this.client = client;
    }
  }

  /**
   * Užfiksuoja naudotojo veiksmą. Klaidos neužkerta kelio naudotojo darbui.
   * @param {string} action
   * @param {Record<string, any>} [metadata]
   * @returns {Promise<{stored: boolean, error?: Error}>}
   */
  async logInteraction(interactionType, metadata = {}) {
    const basePayload = {
      interaction_type: interactionType,
      bed_id: metadata.bedUuid ?? metadata.bedId ?? null,
      tag_code:
        metadata.tagCode ?? metadata.tag_code ?? metadata.tag ?? metadata.payload?.tag ?? null,
      payload: metadata.payload ?? metadata,
      performed_by: metadata.email ?? metadata.user ?? metadata.createdBy ?? null,
    };

    if (!this.client) {
      console.info('[Offline log]', interactionType, basePayload);
      return { stored: false, message: t(texts.logger.offline) };
    }

    try {
      const { error } = await this.client.from('user_interactions').insert(basePayload);
      if (error) {
        if (this.#isMissingColumnError(error, 'interaction_type')) {
          await this.#insertLegacySchema(interactionType, metadata);
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
        throw error;
      }
      return { stored: true };
    } catch (error) {
      if (this.#isMissingColumnError(error, 'interaction_type')) {
        try {
          await this.#insertLegacySchema(interactionType, metadata);
          return { stored: true, downgraded: true };
        } catch (legacyError) {
          console.error('Nepavyko įrašyti naudotojo veiksmo (legacy schema) į Supabase:', legacyError);
          return { stored: false, error: legacyError };
        }
      }
      console.error('Nepavyko įrašyti naudotojo veiksmo į Supabase:', error);
      return { stored: false, error };
    }
  }

  #isMissingColumnError(error, columnName) {
    const message = error?.message ?? '';
    return error?.code === 'PGRST204' && message.includes(`'${columnName}'`);
  }

  async #insertLegacySchema(action, metadata) {
    const legacyPayload = this.#stripUndefined({
      action,
      bed_id: metadata?.bedUuid ?? metadata?.bedId ?? null,
      payload: metadata?.payload ?? metadata,
      performed_by: metadata?.email ?? metadata?.user ?? metadata?.createdBy ?? null,
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
