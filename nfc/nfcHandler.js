import { t, texts } from '../texts.js';

/**
 * Atsakingas už NFC žymų ir URL parametrų apdorojimą.
 */
export class NfcHandler {
  constructor(options) {
    this.form = options?.bedStatusForm;
    this.client = options?.client ?? null;
    this.logger = options?.logger ?? null;
  }

  async processCurrentTag() {
    const tag = this.#readTagFromUrl();
    if (!tag) {
      return;
    }

    await this.logger?.logInteraction?.('nfc_tag_detected', { payload: { tag } });

    if (!this.client) {
      this.form?.show(null, { trigger: 'nfc' });
      this.form?.showFeedback(t(texts.nfc.offlineMode), 'info');
      return;
    }

    try {
      const { data, error } = await this.client
        .from('nfc_tags')
        .select('bed_id, bed:bed_id(label)')
        .eq('tag_uid', tag)
        .limit(1);

      if (error) {
        throw error;
      }

      const record = Array.isArray(data) ? data[0] : null;
      if (!record || !record.bed?.label) {
        this.form?.show(null, { trigger: 'nfc' });
        this.form?.showFeedback(t(texts.nfc.tagNotFound), 'error');
        await this.logger?.logInteraction?.('nfc_tag_unmatched', { payload: { tag } });
        return;
      }

      const bedLabel = record.bed.label;
      this.form?.show(bedLabel, { trigger: 'nfc' });
      this.form?.showFeedback(t(texts.forms.prefilledFromNfc), 'success');
      await this.logger?.logInteraction?.('nfc_tag_matched', {
        bedUuid: record.bed_id,
        payload: { tag, bedLabel },
      });
    } catch (error) {
      console.error('NFC žymos apdorojimo klaida:', error);
      this.form?.show(null, { trigger: 'nfc' });
      this.form?.showFeedback(t(texts.nfc.lookupFailed), 'error');
      await this.logger?.logInteraction?.('nfc_tag_error', { payload: { tag, error: error.message } });
    } finally {
      this.#clearTagParam();
    }
  }

  #readTagFromUrl() {
    if (typeof window === 'undefined') {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('tag');
  }

  #clearTagParam() {
    if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('tag');
    const title = typeof document !== 'undefined' ? document.title : '';
    window.history.replaceState({}, title, url.toString());
  }
}
