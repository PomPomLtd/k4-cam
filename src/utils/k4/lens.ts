// The lens (live-boards Phase E, 26 Oct 2026): which view the phone films
// through. Browsers offer a zoom range on the camera's track; on an iPhone
// the back "camera" is several lenses behind one track, and the zoom picks
// the lens (the smallest value is the ultra-wide). The numbers mean
// different things on different phones, so the choice is kept by name, not
// by value: wide (the smallest zoom), normal (what the phone starts with),
// close (twice that). Pure.

export type LensKey = "wide" | "normal" | "close";

export interface LensStep {
  key: LensKey;
  zoom: number;
}

export const LENS_LABELS: Record<LensKey, string> = { wide: "Wide", normal: "Normal", close: "Close" };

const STORAGE_KEY = "k4:lens";

/** A track's zoom range, as `getCapabilities().zoom` has it where the browser exposes zoom. */
export interface ZoomRange {
  min: number;
  max: number;
}

const round = (z: number) => Math.round(z * 100) / 100;

/**
 * The lens choices a track offers: normal is where the phone starts
 * (`settings.zoom`, the range's minimum when unknown), wide the minimum when
 * it is wider than normal, close twice normal when the range reaches it.
 * No zoom range → no choices (the control stays hidden).
 */
export const lensSteps = (range: ZoomRange | null | undefined, startZoom: number | null | undefined): LensStep[] => {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return [];
  const normal = startZoom !== null && startZoom !== undefined && Number.isFinite(startZoom) ? Math.min(Math.max(startZoom, range.min), range.max) : range.min;
  const steps: LensStep[] = [];
  if (range.min < normal) steps.push({ key: "wide", zoom: round(range.min) });
  steps.push({ key: "normal", zoom: round(normal) });
  const close = normal * 2;
  if (close <= range.max) steps.push({ key: "close", zoom: round(close) });
  return steps;
};

type Storage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

/** The lens chosen last time on this phone, if any. */
export const readLens = (storage: Storage): LensKey | null => {
  let value: string | null = null;
  try {
    value = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return value === "wide" || value === "normal" || value === "close" ? value : null;
};

export const rememberLens = (storage: Storage, key: LensKey): void => {
  try {
    storage.setItem(STORAGE_KEY, key);
  } catch {
    // A private tab or a full store: the choice holds for this page only.
  }
};

/** The step to apply when the stream starts: the remembered lens where the track has it, else normal. */
export const startingLens = (steps: readonly LensStep[], remembered: LensKey | null): LensStep | null => {
  if (steps.length === 0) return null;
  return steps.find((s) => s.key === remembered) ?? steps.find((s) => s.key === "normal") ?? steps[0];
};
