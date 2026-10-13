// The sender of the K4 mode (live-boards spec §7.4, T2, T6, T7, T10): what to
// send, when, and what each answer means. The pure parts (settling, the time
// of each ply, the backoff, the sentences) are tested on their own; the
// runner glues them to timers and fetch, and is tested with fakes of both.

import { type ApiResult, type StateAnswer, type StateRefusal, type StateRequest, putState, resultLabel } from "./api";
import { INVALID_LINK, LIVE_API_VERSION } from "./link";

/** "1. e4 e5 2. Nf3" → ["e4", "e5", "Nf3"]: the fork's movetext as the app's SAN list. */
export const sansOf = (movetext: string): string[] =>
  movetext
    .split(/\s+/)
    .filter((token) => token !== "" && !/^\d+\.(\.\.)?$/.test(token))
    .map((token) => token.replace(/^\d+\.(\.\.)?/, ""))
    .filter((token) => token !== "");

/** The game as the camera has seen it: each ply and when it was first seen (T10). */
export interface Seen {
  sans: string[];
  at: number[];
}

export const NOTHING_SEEN: Seen = { sans: [], at: [] };

/** How many plies two games share from the start. */
export const commonPrefixLength = (a: readonly string[], b: readonly string[]): number => {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
};

/**
 * The next sighting list: the common prefix keeps its first times (a move taken
 * back and played again as the same move keeps its time), every new ply takes
 * `at` (a pair takes the pair's time), a shorter game drops the rest.
 */
export const nextSeen = (prev: Seen, sans: readonly string[], at: number): Seen => {
  const keep = commonPrefixLength(prev.sans, sans);
  return {
    sans: [...sans],
    at: [...prev.at.slice(0, keep), ...sans.slice(keep).map(() => at)],
  };
};

/**
 * Settled moves only (T6): a greedy last ply is held back until it has stood
 * `settleMs`, or until the next update no longer calls it greedy (a pair
 * confirmed it). Returns the list to send and when to look again, if ever.
 */
export const settle = (seen: Seen, greedy: boolean, now: number, settleMs: number): { seen: Seen; recheckAt: number | null } => {
  const n = seen.sans.length;
  if (!greedy || n === 0) return { seen, recheckAt: null };
  const since = now - seen.at[n - 1];
  if (since >= settleMs) return { seen, recheckAt: null };
  return { seen: { sans: seen.sans.slice(0, n - 1), at: seen.at.slice(0, n - 1) }, recheckAt: seen.at[n - 1] + settleMs };
};

/** 1, 2, 4, 8, 15, 30 s, then 30 s for good (§7.4). */
export const backoffMs = (attempt: number): number => {
  const steps = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
  return steps[Math.min(Math.max(attempt, 0), steps.length - 1)];
};

/** What a refusal means for the camera: a final stop with its sentence, or something to show and go on. */
export type Outcome =
  | { kind: "stop"; sentence: string }
  | { kind: "taken"; sentence: string }
  | { kind: "retry"; afterMs: number; sentence: string | null }
  | { kind: "illegal"; sentence: string };

export const outcomeOf = (refusal: StateRefusal): Outcome => {
  switch (refusal.error) {
    case "finished":
      return { kind: "stop", sentence: refusal.result ? `Game over: ${resultLabel(refusal.result)}.` : "Game over." };
    case "round-closed":
      return { kind: "stop", sentence: "The round is over." };
    case "not-started":
      return { kind: "stop", sentence: "The round hasn't started." };
    case "off":
      return { kind: "stop", sentence: "Live boards are switched off for this event." };
    case "revoked":
      return { kind: "stop", sentence: "This camera was switched off by the organiser." };
    case "unknown-camera":
      return { kind: "stop", sentence: INVALID_LINK };
    case "taken":
      return { kind: "taken", sentence: "Another camera is filming this game." };
    case "illegal":
      return { kind: "illegal", sentence: "A move was refused; the board may be out of step. Find the board again." };
    case "slow-down":
      return { kind: "retry", afterMs: Math.max(1, refusal.retryAfterSeconds) * 1_000, sentence: null };
    case "invalid":
      return { kind: "retry", afterMs: backoffMs(2), sentence: null };
  }
};

/** The sentence of a session state other than live, for the Connecting screen (§7.3). */
export const stateSentence = (state: Exclude<import("./api").CameraState, "live">, result: string | null): string => {
  switch (state) {
    case "finished":
      return result ? `This game is over: ${resultLabel(result)}.` : "This game is over.";
    case "round-closed":
      return "The round is over.";
    case "not-started":
      return "The round hasn't started.";
    case "off":
      return "Live boards are switched off for this event.";
    case "revoked":
      return "This camera was switched off by the organiser.";
  }
};

export const OFFLINE_SENTENCE = "Offline: moves are kept and sent when the connection is back.";

export interface SenderStatus {
  phase: "idle" | "live" | "offline" | "taken" | "stopped";
  /** Plies the app holds, from its last answer. */
  sentPlies: number;
  /** When the app last answered 200, on this clock. */
  lastOkAt: number | null;
  /** A sentence to show beside the status: offline, taken, a refused move, the stop reason. */
  sentence: string | null;
}

export interface SenderDeps {
  api: string;
  token: string;
  sessionId: string;
  heartbeatMs: number;
  settleMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface Sender {
  /** The camera's whole game as the detection loop now has it, and when its newest move was played. */
  update: (sans: readonly string[], greedy: boolean, at: number) => void;
  /** Resume from the app's stored game (GET session), with the times already on this clock. */
  resume: (sans: readonly string[], times: readonly number[]) => void;
  setFps: (fps: number | null) => void;
  /** The one request with takeOver: true (T8). */
  takeOver: () => void;
  /** Stops for good (the player pressed Stop, or the page is leaving). */
  stop: () => void;
  onStatus: (cb: (status: SenderStatus) => void) => () => void;
  getStatus: () => SenderStatus;
}

/**
 * Sends a PUT when the settled list changes and every `heartbeatMs` otherwise,
 * `seq` increasing, only the newest state ever in flight; on a network
 * failure the state is kept and sent again after a backoff. A final refusal
 * stops; "taken" waits for Take over.
 */
export const createSender = (deps: SenderDeps): Sender => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let seen: Seen = NOTHING_SEEN;
  let greedy = false;
  /** Nothing goes out before `resume` set the baseline: an empty game sent first would wipe the app's record (T2). */
  let started = false;
  let fps: number | null = null;
  let seq = 0;
  let attempt = 0;
  let inFlight = false;
  let again = false;
  let takeOverOnce = false;
  let lastSent: string | null = null;
  let timer: unknown = null;
  /** A backoff or retry-after timer is armed: new moves wait for it rather than hammering. */
  let retryPending = false;
  let status: SenderStatus = { phase: "idle", sentPlies: 0, lastOkAt: null, sentence: null };
  const listeners = new Set<(s: SenderStatus) => void>();

  const setStatus = (patch: Partial<SenderStatus>) => {
    status = { ...status, ...patch };
    for (const cb of listeners) cb(status);
  };
  // Read through a call: `status` changes under an await, which a narrowed `let` would hide.
  const stopped = () => status.phase === "stopped";

  const armTimer = (fn: () => void, ms: number, retry = false) => {
    if (timer !== null) clearTimer(timer);
    retryPending = retry;
    timer = setTimer(() => {
      timer = null;
      retryPending = false;
      fn();
    }, ms);
  };

  const settledNow = () => settle(seen, greedy, now(), deps.settleMs);

  const send = async () => {
    if (stopped() || !started) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    const { seen: toSend } = settledNow();
    const body: StateRequest = {
      v: LIVE_API_VERSION,
      sessionId: deps.sessionId,
      seq: ++seq,
      moves: toSend.sans,
      times: toSend.at,
      sentAt: now(),
      ...(takeOverOnce ? { takeOver: true } : {}),
      ...(fps !== null ? { fps } : {}),
    };
    takeOverOnce = false;
    const res: ApiResult<StateAnswer> = await putState(deps.api, deps.token, body, fetchImpl);
    inFlight = false;
    if (stopped()) return;
    handle(res, toSend);
  };

  const handle = (res: ApiResult<StateAnswer>, sent: Seen) => {
    if (res.kind === "ok") {
      attempt = 0;
      lastSent = sent.sans.join(" ");
      setStatus({ phase: "live", sentPlies: res.answer.plies, lastOkAt: now(), sentence: null });
      schedule();
      return;
    }
    if (res.kind === "network") {
      setStatus({ phase: "offline", sentence: OFFLINE_SENTENCE });
      again = false;
      armTimer(() => void send(), backoffMs(attempt++), true);
      return;
    }
    const outcome = outcomeOf(res.refusal);
    switch (outcome.kind) {
      case "stop":
        stop(outcome.sentence);
        return;
      case "taken":
        again = false;
        setStatus({ phase: "taken", sentence: outcome.sentence });
        return;
      case "retry":
        again = false;
        armTimer(() => void send(), outcome.afterMs, true);
        return;
      case "illegal":
        // The app refused the game; keep going with what the board says next, and say so.
        attempt = 0;
        lastSent = sent.sans.join(" ");
        setStatus({ phase: "live", sentence: outcome.sentence });
        schedule();
        return;
    }
  };

  /** Something changed, or a timer fired: send now, or arm the next moment to look again. */
  const schedule = () => {
    if (stopped() || status.phase === "taken" || !started) return;
    // The retry timer sends whatever is newest when it fires.
    if (retryPending) return;
    if (inFlight) {
      again = true;
      return;
    }
    const { seen: settled, recheckAt } = settledNow();
    const changed = settled.sans.join(" ") !== lastSent;
    if (changed || again) {
      again = false;
      void send();
      return;
    }
    const heartbeatAt = (status.lastOkAt ?? now()) + deps.heartbeatMs;
    const nextAt = recheckAt === null ? heartbeatAt : Math.min(recheckAt, heartbeatAt);
    armTimer(() => void send(), Math.max(0, nextAt - now()));
  };

  const stop = (sentence: string | null = null) => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    setStatus({ phase: "stopped", sentence });
  };

  return {
    update: (sans, isGreedy, at) => {
      seen = nextSeen(seen, sans, at);
      greedy = isGreedy;
      schedule();
    },
    resume: (sans, times) => {
      seen = { sans: [...sans], at: [...times] };
      greedy = false;
      started = true;
      schedule();
    },
    setFps: (value) => {
      fps = value;
    },
    takeOver: () => {
      if (status.phase !== "taken") return;
      takeOverOnce = true;
      setStatus({ phase: "live", sentence: null });
      void send();
    },
    stop: () => stop(null),
    onStatus: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getStatus: () => status,
  };
};
