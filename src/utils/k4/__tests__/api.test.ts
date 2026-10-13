import { describe, expect, test, vi } from "vitest";
import { classifyAnswer, getSession, localTimes, putState, resultLabel, type StateRequest } from "../api";

const TOKEN = "0f1e2d3c-4b5a-4697-8877-66554433aabb";
const API = "https://events.skk4.ch";

const response = (status: number, body: unknown): Response =>
  ({
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe("classifyAnswer", () => {
  test("200 is the answer; a 5xx is treated like no connection", () => {
    expect(classifyAnswer(200, { stored: "updated", plies: 3, heartbeatSeconds: 15 })).toEqual({ kind: "ok", answer: { stored: "updated", plies: 3, heartbeatSeconds: 15 } });
    expect(classifyAnswer(502, "<html>")).toEqual({ kind: "network", error: "server 502" });
  });

  test.each([
    [400, { error: "invalid" }],
    [401, { error: "unknown-camera" }],
    [403, { error: "off" }],
    [409, { error: "taken", heldForSeconds: 12 }],
    [409, { error: "finished", result: "1-0" }],
    [409, { error: "round-closed" }],
    [409, { error: "not-started" }],
    [410, { error: "revoked" }],
    [422, { error: "illegal", ply: 17, san: "Nxe5" }],
    [429, { error: "slow-down", retryAfterSeconds: 20 }],
  ])("%i %j is a refusal with its body", (status, body) => {
    expect(classifyAnswer(status, body)).toEqual({ kind: "refused", status, refusal: body });
  });

  test("a refusal the app never sends, or no body, reads as invalid", () => {
    expect(classifyAnswer(400, { error: "what" })).toEqual({ kind: "refused", status: 400, refusal: { error: "invalid" } });
    expect(classifyAnswer(404, null)).toEqual({ kind: "refused", status: 404, refusal: { error: "invalid" } });
  });
});

describe("the two calls", () => {
  test("GET session: the bearer token in the header, no cookies, the versioned path", async () => {
    const fetchImpl = vi.fn(async () => response(200, { apiVersion: 1, state: "live" }));
    const res = await getSession(API, TOKEN, fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ kind: "ok", answer: { apiVersion: 1, state: "live" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/api/live/v1/session`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
  });

  test("PUT state: the body as JSON; a refusal comes back typed; a thrown fetch is the network", async () => {
    const body: StateRequest = { v: 1, sessionId: "s", seq: 1, moves: ["e4"], times: [1], sentAt: 2, fps: 6 };
    const fetchImpl = vi.fn(async () => response(409, { error: "taken", heldForSeconds: 40 }));
    const res = await putState(API, TOKEN, body, fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ kind: "refused", status: 409, refusal: { error: "taken", heldForSeconds: 40 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/api/live/v1/state`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await putState(API, TOKEN, body, down as unknown as typeof fetch)).toEqual({ kind: "network", error: "Failed to fetch" });
  });
});

describe("clocks and labels", () => {
  test("the server's times move by the difference of the two clocks", () => {
    expect(localTimes([1000, 2000], 5000, 5300)).toEqual([1300, 2300]);
    expect(localTimes([], 5000, 4000)).toEqual([]);
  });

  test("a result as the app prints it", () => {
    expect(resultLabel("1-0")).toBe("1–0");
    expect(resultLabel("0-1")).toBe("0–1");
    expect(resultLabel("1/2-1/2")).toBe("½–½");
  });
});
