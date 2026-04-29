import { describe, expect, it } from 'vitest';

import { cacheWeek } from '../sw/cache-week';

describe('cacheWeek', () => {
  it('produces 7 days × selected hours of API URLs', async () => {
    // No service worker is registered in tests; cacheWeek will fall back to fetch().
    // We patch fetch to a no-op resolved response and assert URL shape.
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === 'string' ? input : (input as URL).toString());
      return new Response('', { status: 200 });
    }) as typeof fetch;
    try {
      const { urls } = await cacheWeek({
        start: '2026-04-28',
        version: 'Rubrics 1960 - 1960',
        languages: ['la'],
        orthography: 'version'
      });
      expect(urls).toHaveLength(21);
      expect(urls[0]).toContain('/api/v1/office/2026-04-28/lauds');
      expect(urls[urls.length - 1]).toContain('compline');
    } finally {
      globalThis.fetch = original;
    }
  });
});
