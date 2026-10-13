// The camera API of the K4 app (live-boards spec §6.3, T2, T9): the shapes of
// GET session and PUT state, as the app's src/lib/live/api.ts types them, and
// the two calls. The token goes in the Authorization header, never a URL.

import { LIVE_API_VERSION } from "./link";

export type CameraState = "live" | "revoked" | "off" | "not-started" | "finished" | "round-closed";

/** GET /api/live/v1/session: what this camera films, and where to resume. */
export interface SessionAnswer {
  apiVersion: number;
  state: CameraState;
  event: string;
  round: number;
  board: number;
  white: string;
  black: string;
  /** The stored game, to resume from. */
  moves: string[];
  /** When each ply was first seen, epoch ms on the server's clock. */
  times: number[];
  /** The server's clock, to convert `times`. */
  now: number;
  /** "1-0", "0-1", "1/2-1/2", "0-0" once there is one. */
  result: string | null;
  /** Another camera holds the lease now (T8). */
  otherCamera: boolean;
  heartbeatSeconds: number;
  settleSeconds: number;
  lichessRoundUrl: string | null;
}

/** PUT /api/live/v1/state: the camera's whole game, and its heartbeat. */
export interface StateRequest {
  v: number;
  sessionId: string;
  seq: number;
  moves: string[];
  /** When the phone first saw each move, in its own epoch ms (T10). */
  times: number[];
  /** The phone's clock when it sent the request. */
  sentAt: number;
  takeOver?: boolean;
  fps?: number;
}

export type StoredKind = "updated" | "unchanged" | "stale";

export interface StateAnswer {
  stored: StoredKind;
  plies: number;
  heartbeatSeconds: number;
}

/** The refusals of §6.3. */
export type StateRefusal =
  | { error: "invalid" }
  | { error: "unknown-camera" }
  | { error: "taken"; heldForSeconds: number }
  | { error: "finished"; result: string | null }
  | { error: "round-closed" }
  | { error: "not-started" }
  | { error: "off" }
  | { error: "revoked" }
  | { error: "illegal"; ply: number; san: string }
  | { error: "slow-down"; retryAfterSeconds: number };

export type ApiResult<T> =
  | { kind: "ok"; answer: T }
  | { kind: "refused"; status: number; refusal: StateRefusal }
  | { kind: "network"; error: string };

const REFUSALS = new Set<string>([
  "invalid",
  "unknown-camera",
  "taken",
  "finished",
  "round-closed",
  "not-started",
  "off",
  "revoked",
  "illegal",
  "slow-down",
]);

/** A response's status and body as one of the three outcomes. A refusal the app never sent reads as "invalid". */
export const classifyAnswer = <T>(status: number, body: unknown): ApiResult<T> => {
  if (status >= 200 && status < 300) return { kind: "ok", answer: body as T };
  if (status >= 500) return { kind: "network", error: `server ${status}` };
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  if (typeof error === "string" && REFUSALS.has(error)) return { kind: "refused", status, refusal: body as StateRefusal };
  return { kind: "refused", status, refusal: { error: "invalid" } };
};

const headers = (token: string, json: boolean): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

const call = async <T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, cache: "no-store", credentials: "omit" });
  } catch (error) {
    return { kind: "network", error: error instanceof Error ? error.message : String(error) };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return classifyAnswer<T>(response.status, body);
};

export const getSession = (api: string, token: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<SessionAnswer>> =>
  call<SessionAnswer>(fetchImpl, `${api}/api/live/v${LIVE_API_VERSION}/session`, { method: "GET", headers: headers(token, false) });

export const putState = (api: string, token: string, body: StateRequest, fetchImpl: typeof fetch = fetch): Promise<ApiResult<StateAnswer>> =>
  call<StateAnswer>(fetchImpl, `${api}/api/live/v${LIVE_API_VERSION}/state`, {
    method: "PUT",
    headers: headers(token, true),
    body: JSON.stringify(body),
  });

/** The server's sighting times on the phone's clock: shifted by the two clocks' difference at the answer. */
export const localTimes = (times: readonly number[], serverNow: number, localNow: number): number[] => {
  const shift = localNow - serverNow;
  return times.map((t) => t + shift);
};

/** "1-0" → "1–0", "1/2-1/2" → "½–½", as the app prints a result. */
export const resultLabel = (token: string): string => (token === "1/2-1/2" ? "½–½" : token.replace("-", "–"));
