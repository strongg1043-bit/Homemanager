import { lazy, ComponentType } from 'react';

const RELOAD_FLAG = 'lazyChunkReloaded';

/**
 * Wraps React.lazy() so that a failed dynamic import (the module chunk is gone
 * from the server — happens when a browser has an old cached index.html/app
 * shell open across a deploy, then tries to load a lazy route whose hashed
 * chunk filename no longer exists) triggers one full page reload instead of
 * crashing into the generic error boundary. The reload fetches a fresh
 * index.html referencing the current chunk hashes, which resolves it.
 *
 * Guarded by a sessionStorage flag so a *genuine* load failure (offline, a
 * real 404) reloads once and then surfaces normally instead of loop-reloading.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(() =>
    factory()
      .then((mod) => {
        // A successful load means the current bundle is fresh — clear the
        // flag so a *future* deploy's chunk failure also gets one retry.
        sessionStorage.removeItem(RELOAD_FLAG);
        return mod;
      })
      .catch((err) => {
        const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === 'true';
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, 'true');
          window.location.reload();
          // Never resolves — the reload navigates away before this matters.
          return new Promise<{ default: T }>(() => {});
        }
        throw err;
      }),
  );
}
