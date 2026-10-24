import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement layout APIs.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* no-op in jsdom */
  };
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // storage unavailable in this environment
  }
});
