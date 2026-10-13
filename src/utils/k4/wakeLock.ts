// The screen stays on while filming (live-boards spec §7.4): the Screen Wake
// Lock where the browser has it, asked for again whenever the page comes back
// into view (a lock is released when the tab is hidden). Where it is missing,
// the sentence the sidebar shows instead.

export const WAKE_LOCK_FALLBACK = "Keep this screen on: set Auto-Lock to Never while filming.";

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

export interface WakeLockHandle {
  /** The sentence to show when the browser cannot keep the screen on; null when it can. */
  fallback: string | null;
  release: () => void;
}

/** Keeps the screen on until released. Never throws: a refused lock is the fallback sentence. */
export const keepAwake = async (nav: WakeLockNavigator = navigator, doc: Document = document): Promise<WakeLockHandle> => {
  const api = nav.wakeLock;
  if (!api) return { fallback: WAKE_LOCK_FALLBACK, release: () => {} };

  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  const request = async () => {
    if (released) return;
    try {
      sentinel = await api.request("screen");
    } catch {
      sentinel = null;
    }
  };
  const onVisible = () => {
    if (doc.visibilityState === "visible") void request();
  };
  doc.addEventListener("visibilitychange", onVisible);
  await request();
  return {
    fallback: sentinel === null ? WAKE_LOCK_FALLBACK : null,
    release: () => {
      released = true;
      doc.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
  };
};
