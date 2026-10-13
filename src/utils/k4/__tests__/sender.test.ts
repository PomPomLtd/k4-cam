import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { StateRequest } from "../api";
import {
  NOTHING_SEEN,
  OFFLINE_SENTENCE,
  backoffMs,
  commonPrefixLength,
  createSender,
  nextSeen,
  outcomeOf,
  sansOf,
  settle,
  stateSentence,
} from "../sender";

const TOKEN = "0f1e2d3c-4b5a-4697-8877-66554433aabb";
const API = "https://events.skk4.ch";

describe("the pure parts", () => {
  test("sansOf reads the fork's movetext in both of its spellings", () => {
    expect(sansOf("1. e4 e5 2. Nf3")).toEqual(["e4", "e5", "Nf3"]);
    expect(sansOf("1.e4 e5 2.Nf3 Nc6")).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(sansOf("1...e5 2.Nf3")).toEqual(["e5", "Nf3"]);
    expect(sansOf("")).toEqual([]);
  });

  test("nextSeen keeps the first sighting over the common prefix, stamps the new plies, drops the rest", () => {
    const a = nextSeen(NOTHING_SEEN, ["e4", "e5"], 100);
    expect(a).toEqual({ sans: ["e4", "e5"], at: [100, 100] });
    const b = nextSeen(a, ["e4", "e5", "Nf3"], 200);
    expect(b.at).toEqual([100, 100, 200]);
    const c = nextSeen(b, ["e4", "e5"], 300);
    expect(c).toEqual({ sans: ["e4", "e5"], at: [100, 100] });
    const d = nextSeen(b, ["e4", "e5", "Nc3"], 400);
    expect(d.at).toEqual([100, 100, 400]);
    expect(commonPrefixLength(["a", "b"], ["a", "c"])).toBe(1);
  });

  test("settle holds a greedy last ply until it has stood 10 s, and says when to look again", () => {
    const seen = { sans: ["e4", "e5", "Nf3"], at: [0, 0, 5_000] };
    expect(settle(seen, false, 6_000, 10_000)).toEqual({ seen, recheckAt: null });
    expect(settle(seen, true, 6_000, 10_000)).toEqual({ seen: { sans: ["e4", "e5"], at: [0, 0] }, recheckAt: 15_000 });
    expect(settle(seen, true, 15_000, 10_000)).toEqual({ seen, recheckAt: null });
    expect(settle(NOTHING_SEEN, true, 1, 10_000)).toEqual({ seen: NOTHING_SEEN, recheckAt: null });
  });

  test("backoff 1, 2, 4, 8, 15, 30 s, then 30", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(backoffMs)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000]);
  });

  test("every refusal has its outcome and its sentence", () => {
    expect(outcomeOf({ error: "finished", result: "1-0" })).toEqual({ kind: "stop", sentence: "Game over: 1–0." });
    expect(outcomeOf({ error: "finished", result: null })).toEqual({ kind: "stop", sentence: "Game over." });
    expect(outcomeOf({ error: "round-closed" })).toEqual({ kind: "stop", sentence: "The round is over." });
    expect(outcomeOf({ error: "not-started" })).toEqual({ kind: "stop", sentence: "The round hasn't started." });
    expect(outcomeOf({ error: "off" })).toEqual({ kind: "stop", sentence: "Live boards are switched off for this event." });
    expect(outcomeOf({ error: "revoked" })).toEqual({ kind: "stop", sentence: "This camera was switched off by the organiser." });
    expect(outcomeOf({ error: "unknown-camera" })).toEqual({ kind: "stop", sentence: "This camera link isn't valid. Ask the organiser for a new one." });
    expect(outcomeOf({ error: "taken", heldForSeconds: 12 })).toEqual({ kind: "taken", sentence: "Another camera is filming this game." });
    expect(outcomeOf({ error: "illegal", ply: 17, san: "Nxe5" })).toMatchObject({ kind: "illegal" });
    expect(outcomeOf({ error: "slow-down", retryAfterSeconds: 20 })).toEqual({ kind: "retry", afterMs: 20_000, sentence: null });
    expect(outcomeOf({ error: "invalid" })).toEqual({ kind: "retry", afterMs: 4_000, sentence: null });
    expect(stateSentence("finished", "1/2-1/2")).toBe("This game is over: ½–½.");
    expect(stateSentence("revoked", null)).toBe("This camera was switched off by the organiser.");
  });
});

// ── The runner, on fake timers and a fake fetch ───────

type Answer = { status: number; body: unknown } | "down" | "hang";

const makeFetch = () => {
  const queue: Answer[] = [];
  const bodies: StateRequest[] = [];
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as StateRequest);
    const next = queue.length > 0 ? (queue.shift() as Answer) : { status: 200, body: { stored: "updated", plies: bodies[bodies.length - 1].moves.length, heartbeatSeconds: 15 } };
    if (next === "down") throw new TypeError("Failed to fetch");
    if (next === "hang") return new Promise<Response>(() => {});
    return { status: next.status, json: () => Promise.resolve(next.body) } as unknown as Response;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, queue, bodies, calls: () => bodies.length };
};

const make = (fetchImpl: typeof fetch, baseline = true) => {
  const s = createSender({ api: API, token: TOKEN, sessionId: "11111111-2222-4333-8444-555555555555", heartbeatMs: 15_000, settleMs: 10_000, fetchImpl });
  // The page sets the baseline from GET session before the camera reports anything.
  if (baseline) s.resume([], []);
  return s;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-15T19:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const T0 = new Date("2027-01-15T19:00:00Z").getTime();

describe("the sender", () => {
  test("the baseline is the first heartbeat; a pair goes out at once with its time; the heartbeat repeats every 15 s with seq increasing", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    s.setFps(6.2);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(1);
    expect(f.bodies[0]).toMatchObject({ v: 1, seq: 1, moves: [], times: [], sentAt: T0 });
    expect(f.bodies[0]).not.toHaveProperty("takeOver");
    expect(f.bodies[0]).not.toHaveProperty("fps"); // set after the baseline went
    s.update(["e4", "e5"], false, T0);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(2);
    expect(f.bodies[1]).toMatchObject({ seq: 2, moves: ["e4", "e5"], times: [T0, T0], fps: 6.2 });
    expect(s.getStatus()).toMatchObject({ phase: "live", sentPlies: 2, lastOkAt: T0, sentence: null });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls()).toBe(3);
    expect(f.bodies[2]).toMatchObject({ seq: 3, moves: ["e4", "e5"] });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.calls()).toBe(4);
  });

  test("nothing goes out before the baseline: an update first is held, the resume sends it", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl, false);
    s.update(["e4"], false, T0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.calls()).toBe(0);
    s.resume(["e4", "e5"], [T0 - 2_000, T0 - 1_000]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(1);
    expect(f.bodies[0]).toMatchObject({ moves: ["e4", "e5"], times: [T0 - 2_000, T0 - 1_000] });
    s.update(["e4", "e5", "Nf3"], false, T0 + 1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.bodies[1].times).toEqual([T0 - 2_000, T0 - 1_000, T0 + 1_000]);
  });

  test("a greedy move waits 10 s before it goes; the next pair confirms it at once", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(1_000);
    s.update(["e4", "e5", "Nf3"], true, Date.now()); // T0 + 1 s, greedy
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); // T0 + 11 s: it has stood 10 s
    expect(f.calls()).toBe(3);
    expect(f.bodies[2]).toMatchObject({ moves: ["e4", "e5", "Nf3"], times: [T0, T0, T0 + 1_000] });

    await vi.advanceTimersByTimeAsync(1_000); // T0 + 12 s
    s.update(["e4", "e5", "Nf3", "Nc6", "Bb5"], true, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    // Nc6 confirmed Nf3; Bb5 is greedy and waits.
    expect(f.calls()).toBe(4);
    expect(f.bodies[3]).toMatchObject({ moves: ["e4", "e5", "Nf3", "Nc6"], times: [T0, T0, T0 + 1_000, T0 + 12_000] });
    await vi.advanceTimersByTimeAsync(1_000); // T0 + 13 s
    s.update(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(5);
    expect(f.bodies[4].moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    expect(f.bodies[4].times).toEqual([T0, T0, T0 + 1_000, T0 + 12_000, T0 + 12_000, T0 + 13_000]);
  });

  test("a greedy move taken back never goes out; its replacement takes its own time", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(1_000);
    s.update(["e4", "e5", "Nf3"], true, Date.now()); // T0 + 1 s
    await vi.advanceTimersByTimeAsync(5_000); // T0 + 6 s: taken back before it settled
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(6_000); // T0 + 12 s
    expect(f.calls()).toBe(2);
    s.update(["e4", "e5", "Nc3"], true, Date.now());
    await vi.advanceTimersByTimeAsync(10_000); // T0 + 22 s
    expect(f.calls()).toBe(4); // the heartbeat at 15 s with e4 e5, then Nc3 settled at 22 s
    expect(f.bodies[2].moves).toEqual(["e4", "e5"]);
    expect(f.bodies[3]).toMatchObject({ moves: ["e4", "e5", "Nc3"], times: [T0, T0, T0 + 12_000] });
  });

  test("offline: the state is kept and sent again after 1, 2, 4 s; new moves wait for the retry; back online the sentence goes", async () => {
    const f = makeFetch();
    f.queue.push("down", "down", "down");
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(1);
    expect(s.getStatus()).toMatchObject({ phase: "offline", sentence: OFFLINE_SENTENCE });
    s.update(["e4"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(1); // waits for the retry
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.calls()).toBe(2);
    expect(f.bodies[1].moves).toEqual(["e4"]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(500);
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(3_500);
    expect(f.calls()).toBe(4);
    expect(f.bodies[3].moves).toEqual(["e4", "e5"]);
    expect(s.getStatus()).toMatchObject({ phase: "live", sentPlies: 2, sentence: null });
  });

  test("a final refusal stops everything: no request on an update or a heartbeat", async () => {
    const f = makeFetch();
    f.queue.push({ status: 410, body: { error: "revoked" } });
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getStatus()).toEqual({ phase: "stopped", sentPlies: 0, lastOkAt: null, sentence: "This camera was switched off by the organiser." });
    s.update(["e4", "e5"], false, T0 + 1_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.calls()).toBe(1);
  });

  test("taken: waits for Take over, which goes out once; a finished game ends it", async () => {
    const f = makeFetch();
    f.queue.push({ status: 409, body: { error: "taken", heldForSeconds: 40 } });
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getStatus()).toMatchObject({ phase: "taken", sentence: "Another camera is filming this game." });
    s.update(["e4"], false, Date.now());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.calls()).toBe(1);
    s.takeOver();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(2);
    expect(f.bodies[1]).toMatchObject({ takeOver: true, moves: ["e4"] });
    expect(s.getStatus().phase).toBe("live");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.calls()).toBe(3);
    expect(f.bodies[2]).not.toHaveProperty("takeOver");

    f.queue.push({ status: 409, body: { error: "finished", result: "0-1" } });
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getStatus()).toMatchObject({ phase: "stopped", sentence: "Game over: 0–1." });
  });

  test("a refused move is said and the sender keeps going; slow-down waits what it is told", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    f.queue.push({ status: 422, body: { error: "illegal", ply: 2, san: "Ke2" } });
    s.update(["e4", "Ke2"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(2);
    expect(s.getStatus()).toMatchObject({ phase: "live", sentence: expect.stringContaining("A move was refused") });
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(3);
    expect(s.getStatus().sentence).toBeNull();

    f.queue.push({ status: 429, body: { error: "slow-down", retryAfterSeconds: 20 } });
    s.update(["e4", "e5", "Nf3"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(4);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(f.calls()).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls()).toBe(5);
    expect(f.bodies[4].moves).toEqual(["e4", "e5", "Nf3"]);
  });

  test("only the newest state is in flight: updates during a slow request wait for it", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    await vi.advanceTimersByTimeAsync(0);
    f.queue.push("hang");
    s.update(["e4", "e5"], false, Date.now());
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls()).toBe(2);
    s.update(["e4", "e5", "Nf3"], false, Date.now());
    s.update(["e4", "e5", "Nf3", "Nc6"], false, Date.now());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.calls()).toBe(2);
    s.stop();
    expect(s.getStatus().phase).toBe("stopped");
  });

  test("stop: no more requests, and the listeners hear it", async () => {
    const f = makeFetch();
    const s = make(f.fetchImpl);
    const heard: string[] = [];
    const off = s.onStatus((st) => heard.push(st.phase));
    await vi.advanceTimersByTimeAsync(0);
    s.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.calls()).toBe(1);
    expect(heard).toEqual(["live", "stopped"]);
    off();
  });
});
