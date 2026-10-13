// The camera link of the K4 mode (live-boards spec §7.2, T3):
// https://cam.skk4.ch/k4#v=1&api=https%3A%2F%2Fevents.skk4.ch&t=<token>
// The token travels in the fragment, which never reaches a server. This file
// mirrors the app's src/lib/live/links.ts; both keep the spec's example link
// as a test. Pure, apart from the two sessionStorage helpers.

export const LIVE_API_VERSION = 1;

export interface CameraFragment {
  v: number;
  api: string;
  token: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The fragment of a camera link read back ("#v=1&api=…&t=…", with or without
 * the "#", or the whole link). Null unless it carries a version, an http(s)
 * origin and a uuid token.
 */
export const readCameraFragment = (hashOrLink: string): CameraFragment | null => {
  const hashAt = hashOrLink.indexOf("#");
  const raw = hashAt === -1 ? hashOrLink : hashOrLink.slice(hashAt + 1);
  const params = new URLSearchParams(raw);
  const v = Number(params.get("v"));
  const api = params.get("api") ?? "";
  const token = params.get("t") ?? "";
  if (!Number.isInteger(v) || v < 1) return null;
  if (!/^https?:\/\/[^/?#]+$/i.test(api)) return null;
  if (!UUID_RE.test(token)) return null;
  return { v, api, token };
};

/** Where the app lives in production; the build's allowlist starts here. */
export const DEFAULT_API_ORIGINS: readonly string[] = ["https://events.skk4.ch"];
/** The app's dev servers, allowed in development builds only. */
export const DEV_API_ORIGINS: readonly string[] = ["http://localhost:3000", "http://localhost:3901"];

/**
 * The origins a link may name as its API: VITE_K4_API_ORIGINS (comma-separated),
 * else the production app; a development build adds the dev servers.
 */
export const apiOrigins = (env: { VITE_K4_API_ORIGINS?: string; DEV?: boolean }): string[] => {
  const configured = (env.VITE_K4_API_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const base = configured.length > 0 ? configured : [...DEFAULT_API_ORIGINS];
  return env.DEV ? [...base, ...DEV_API_ORIGINS] : base;
};

/**
 * Is this API origin allowed? An entry matches exactly, or, as "https://*.vercel.app",
 * any host under that suffix with the same scheme (preview-to-preview checks).
 */
export const allowedApi = (api: string, allowlist: readonly string[]): boolean => {
  let url: URL;
  try {
    url = new URL(api);
  } catch {
    return false;
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return false;
  const origin = url.origin.toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.trim().toLowerCase();
    const star = e.indexOf("://*.");
    if (star === -1) return e === origin;
    const scheme = e.slice(0, star + 3);
    const suffix = e.slice(star + 4); // ".vercel.app"
    return origin.startsWith(scheme) && url.hostname.endsWith(suffix) && url.hostname.length > suffix.length;
  });
};

export const INVALID_LINK = "This camera link isn't valid. Ask the organiser for a new one.";

export const LINK_KEY = "k4:link";

/** Keeps the link for this tab, so a reload resumes (sessionStorage: gone with the tab). */
export const rememberLink = (storage: Pick<Storage, "setItem">, fragment: CameraFragment): void => {
  try {
    storage.setItem(LINK_KEY, JSON.stringify(fragment));
  } catch {
    // Nowhere to keep it: a reload will ask for the link again.
  }
};

export const recallLink = (storage: Pick<Storage, "getItem">): CameraFragment | null => {
  try {
    const raw = storage.getItem(LINK_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, api, token } = parsed as Record<string, unknown>;
    if (typeof v !== "number" || typeof api !== "string" || typeof token !== "string") return null;
    return readCameraFragment(`#${new URLSearchParams({ v: String(v), api, t: token }).toString()}`);
  } catch {
    return null;
  }
};

export const forgetLink = (storage: Pick<Storage, "removeItem">): void => {
  try {
    storage.removeItem(LINK_KEY);
  } catch {
    // Nothing to forget.
  }
};

export type LinkReading = { kind: "ok"; fragment: CameraFragment } | { kind: "invalid"; reason: "none" | "shape" | "api" | "version" };

/**
 * The link for this page: the fragment of the address first (a fresh scan),
 * else what this tab remembered (a reload). An unknown API or a bad shape is
 * invalid; a version above ours is too (the app moved on; T9).
 */
export const readLink = (input: { hash: string; stored: CameraFragment | null; allowlist: readonly string[] }): LinkReading => {
  const fromHash = input.hash === "" || input.hash === "#" ? null : readCameraFragment(input.hash);
  if (input.hash !== "" && input.hash !== "#" && fromHash === null) return { kind: "invalid", reason: "shape" };
  const fragment = fromHash ?? input.stored;
  if (fragment === null) return { kind: "invalid", reason: "none" };
  if (fragment.v > LIVE_API_VERSION) return { kind: "invalid", reason: "version" };
  if (!allowedApi(fragment.api, input.allowlist)) return { kind: "invalid", reason: "api" };
  return { kind: "ok", fragment };
};

/** Takes the token out of the address bar once read (T3). */
export const clearFragment = (): void => {
  if (typeof history === "undefined" || typeof location === "undefined") return;
  if (location.hash === "") return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
};
