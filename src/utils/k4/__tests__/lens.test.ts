import { describe, expect, test } from "vitest";
import { lensSteps, readLens, rememberLens, startingLens } from "../lens";

describe("the lens choices", () => {
  test("an iPhone's track: the minimum is the ultra-wide, the start the wide, twice that the close", () => {
    expect(lensSteps({ min: 1, max: 16 }, 2)).toEqual([
      { key: "wide", zoom: 1 },
      { key: "normal", zoom: 2 },
      { key: "close", zoom: 4 },
    ]);
  });

  test("a phone whose start is the minimum has no wider lens", () => {
    expect(lensSteps({ min: 1, max: 8 }, 1)).toEqual([
      { key: "normal", zoom: 1 },
      { key: "close", zoom: 2 },
    ]);
  });

  test("a short range has no close; no range has no choices; an unknown start is the minimum", () => {
    expect(lensSteps({ min: 1, max: 1.5 }, 1)).toEqual([{ key: "normal", zoom: 1 }]);
    expect(lensSteps(null, 1)).toEqual([]);
    expect(lensSteps({ min: 1, max: 1 }, 1)).toEqual([]);
    expect(lensSteps({ min: 0.5, max: 3 }, undefined)).toEqual([
      { key: "normal", zoom: 0.5 },
      { key: "close", zoom: 1 },
    ]);
  });

  test("the choice is remembered by name and applied where the track has it", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readLens(storage)).toBeNull();
    rememberLens(storage, "close");
    expect(readLens(storage)).toBe("close");
    const steps = lensSteps({ min: 1, max: 16 }, 2);
    expect(startingLens(steps, "close")).toEqual({ key: "close", zoom: 4 });
    expect(startingLens(steps, "wide")).toEqual({ key: "wide", zoom: 1 });
    expect(startingLens(steps, null)).toEqual({ key: "normal", zoom: 2 });
    expect(startingLens([{ key: "normal", zoom: 1 }], "wide")).toEqual({ key: "normal", zoom: 1 });
    expect(startingLens([], "wide")).toBeNull();
    store.set("k4:lens", "huge");
    expect(readLens(storage)).toBeNull();
    const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(readLens(broken)).toBeNull();
    expect(() => rememberLens(broken, "wide")).not.toThrow();
  });
});
