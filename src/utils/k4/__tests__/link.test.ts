import { describe, expect, test } from "vitest";
import {
  DEFAULT_API_ORIGINS,
  DEV_API_ORIGINS,
  INVALID_LINK,
  LINK_KEY,
  allowedApi,
  apiOrigins,
  forgetLink,
  readCameraFragment,
  readLink,
  recallLink,
  rememberLink,
} from "../link";

// The spec's example link (§7.2); the app's src/lib/live/links.ts keeps the same one.
const TOKEN = "0f1e2d3c-4b5a-4697-8877-66554433aabb";
const LINK = `https://cam.skk4.ch/k4#v=1&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`;

describe("readCameraFragment", () => {
  test("the spec's link, as a whole link, a hash or a bare fragment", () => {
    const expected = { v: 1, api: "https://events.skk4.ch", token: TOKEN };
    expect(readCameraFragment(LINK)).toEqual(expected);
    expect(readCameraFragment(`#v=1&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`)).toEqual(expected);
    expect(readCameraFragment(`v=1&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`)).toEqual(expected);
  });

  test("a dev server as the api, with its port", () => {
    expect(readCameraFragment(`#v=1&api=http%3A%2F%2Flocalhost%3A3901&t=${TOKEN}`)?.api).toBe("http://localhost:3901");
  });

  test.each([
    ["no version", `#api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`],
    ["version 0", `#v=0&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`],
    ["an api with a path", `#v=1&api=https%3A%2F%2Fevents.skk4.ch%2Fapi&t=${TOKEN}`],
    ["a non-http api", `#v=1&api=ftp%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`],
    ["a token that is not a uuid", "#v=1&api=https%3A%2F%2Fevents.skk4.ch&t=secret"],
    ["no token", "#v=1&api=https%3A%2F%2Fevents.skk4.ch"],
    ["nothing", ""],
  ])("refuses %s", (_, hash) => {
    expect(readCameraFragment(hash)).toBeNull();
  });
});

describe("the allowlist", () => {
  test("production by default; the dev servers only in a development build", () => {
    expect(apiOrigins({})).toEqual([...DEFAULT_API_ORIGINS]);
    expect(apiOrigins({ DEV: true })).toEqual([...DEFAULT_API_ORIGINS, ...DEV_API_ORIGINS]);
    expect(apiOrigins({ VITE_K4_API_ORIGINS: "https://a.example, https://b.example" })).toEqual(["https://a.example", "https://b.example"]);
    expect(apiOrigins({ VITE_K4_API_ORIGINS: " , " })).toEqual([...DEFAULT_API_ORIGINS]);
  });

  test("exact origins, case-insensitive hosts, nothing with a path", () => {
    expect(allowedApi("https://events.skk4.ch", ["https://events.skk4.ch"])).toBe(true);
    expect(allowedApi("https://EVENTS.skk4.ch", ["https://events.skk4.ch"])).toBe(true);
    expect(allowedApi("http://events.skk4.ch", ["https://events.skk4.ch"])).toBe(false);
    expect(allowedApi("https://events.skk4.ch.evil.example", ["https://events.skk4.ch"])).toBe(false);
    expect(allowedApi("https://events.skk4.ch/x", ["https://events.skk4.ch"])).toBe(false);
    expect(allowedApi("not a url", ["https://events.skk4.ch"])).toBe(false);
  });

  test("a *. entry allows any host under the suffix, same scheme (preview to preview)", () => {
    const list = ["https://*.vercel.app"];
    expect(allowedApi("https://k4-swisssystem-git-feat-live-c-links-pompom.vercel.app", list)).toBe(true);
    expect(allowedApi("https://vercel.app", list)).toBe(false);
    expect(allowedApi("https://evil-vercel.app", list)).toBe(false);
    expect(allowedApi("http://x.vercel.app", list)).toBe(false);
  });
});

describe("readLink", () => {
  const allowlist = ["https://events.skk4.ch"];
  const stored = { v: 1, api: "https://events.skk4.ch", token: TOKEN };

  test("the fragment first, then what the tab remembered", () => {
    expect(readLink({ hash: `#v=1&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`, stored: null, allowlist })).toEqual({ kind: "ok", fragment: stored });
    expect(readLink({ hash: "", stored, allowlist })).toEqual({ kind: "ok", fragment: stored });
    expect(readLink({ hash: "#", stored, allowlist })).toEqual({ kind: "ok", fragment: stored });
  });

  test("nothing, a bad shape, a foreign api and a newer version are each invalid", () => {
    expect(readLink({ hash: "", stored: null, allowlist })).toEqual({ kind: "invalid", reason: "none" });
    expect(readLink({ hash: "#v=1&t=nope", stored, allowlist })).toEqual({ kind: "invalid", reason: "shape" });
    expect(readLink({ hash: `#v=1&api=https%3A%2F%2Fevil.example&t=${TOKEN}`, stored: null, allowlist })).toEqual({ kind: "invalid", reason: "api" });
    expect(readLink({ hash: `#v=2&api=https%3A%2F%2Fevents.skk4.ch&t=${TOKEN}`, stored: null, allowlist })).toEqual({ kind: "invalid", reason: "version" });
    expect(INVALID_LINK).toBe("This camera link isn't valid. Ask the organiser for a new one.");
  });
});

describe("remembering the link for the tab", () => {
  const storage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      map: m,
    };
  };

  test("round trip, and gone once forgotten", () => {
    const s = storage();
    const fragment = { v: 1, api: "https://events.skk4.ch", token: TOKEN };
    rememberLink(s, fragment);
    expect(s.map.get(LINK_KEY)).toContain(TOKEN);
    expect(recallLink(s)).toEqual(fragment);
    forgetLink(s);
    expect(recallLink(s)).toBeNull();
  });

  test("junk in storage reads as nothing; a storage that throws is nothing too", () => {
    const s = storage();
    s.map.set(LINK_KEY, "{not json");
    expect(recallLink(s)).toBeNull();
    s.map.set(LINK_KEY, JSON.stringify({ v: 1, api: "https://events.skk4.ch", token: "secret" }));
    expect(recallLink(s)).toBeNull();
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => rememberLink(throwing, { v: 1, api: "https://events.skk4.ch", token: TOKEN })).not.toThrow();
    expect(recallLink(throwing)).toBeNull();
    expect(() => forgetLink(throwing)).not.toThrow();
  });
});
