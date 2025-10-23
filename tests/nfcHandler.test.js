import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NfcHandler } from '../nfc/nfcHandler.js';

function createQuery(response) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    catch: (reject) => Promise.resolve(response).catch(reject),
    finally: (handler) => Promise.resolve(response).finally(handler),
  };
  return builder;
}

describe('NfcHandler', () => {
  let originalWindow;
  let originalDocument;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }

    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  it('ieško lovos pagal tag_code ir atidaro formą', async () => {
    const url = new URL('https://example.local/dashboard?tag=nfc-a1');
    const replaceState = vi.fn();

    globalThis.window = {
      location: { href: url.href, search: url.search },
      history: { replaceState },
    };
    globalThis.document = { title: 'Test' };

    const response = { data: [{ bed_id: 'uuid-1', bed: { label: 'A1' } }], error: null };
    const builder = createQuery(response);
    const client = { from: vi.fn(() => builder) };
    const form = { show: vi.fn(), showFeedback: vi.fn() };
    const logger = { logInteraction: vi.fn().mockResolvedValue({}) };

    const handler = new NfcHandler({ bedStatusForm: form, client, logger });

    await handler.processCurrentTag();

    expect(client.from).toHaveBeenCalledWith('nfc_tags');
    expect(builder.eq).toHaveBeenCalledWith('tag_code', 'nfc-a1');
    expect(form.show).toHaveBeenCalledWith('A1', { trigger: 'nfc' });
    expect(form.showFeedback).toHaveBeenCalledWith('Lova pasirinkta iš NFC žymos.', 'success');
    expect(replaceState).toHaveBeenCalled();
  });

  it('parodo klaidą, kai žyma nerandama', async () => {
    const url = new URL('https://example.local/dashboard?tag=unknown-tag');
    const replaceState = vi.fn();

    globalThis.window = {
      location: { href: url.href, search: url.search },
      history: { replaceState },
    };
    globalThis.document = { title: 'Test' };

    const response = { data: [], error: null };
    const builder = createQuery(response);
    const client = { from: vi.fn(() => builder) };
    const form = { show: vi.fn(), showFeedback: vi.fn() };
    const logger = { logInteraction: vi.fn().mockResolvedValue({}) };

    const handler = new NfcHandler({ bedStatusForm: form, client, logger });

    await handler.processCurrentTag();

    expect(builder.eq).toHaveBeenCalledWith('tag_code', 'unknown-tag');
    expect(form.show).toHaveBeenCalledWith(null, { trigger: 'nfc' });
    expect(form.showFeedback).toHaveBeenCalledWith('NFC žyma neatpažinta.', 'error');
  });
});
