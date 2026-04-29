import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

afterEach(() => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage?.clear === 'function') {
      window.localStorage.clear();
    }
  } catch {
    // ignore: Node 25's experimental localStorage may shadow jsdom's
  }
});
