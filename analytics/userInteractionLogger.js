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
  async logInteraction(action, metadata = {}) {
    const payload = {
      action,
      bed_id: metadata.bedUuid ?? null,
      payload: metadata.payload ?? metadata,
      performed_by: metadata.email ?? metadata.user ?? metadata.createdBy ?? null,
    };

    if (!this.client) {
      console.info('[Offline log]', action, payload);
      return { stored: false, message: t(texts.logger.offline) };
    }

    try {
      const { error } = await this.client.from('user_interactions').insert(payload);
      if (error) {
        throw error;
      }
      return { stored: true };
    } catch (error) {
      console.error('Nepavyko įrašyti naudotojo veiksmo į Supabase:', error);
      return { stored: false, error };
    }
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
