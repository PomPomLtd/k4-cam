import { describe, expect, test } from "vitest";
import { gameChoices, gameLine } from "../setup";

describe("step 3, where the game stands", () => {
  test("continuing is offered only where the record has moves", () => {
    expect(gameChoices(false, 1).map((c) => c.key)).toEqual(["fresh", "scan"]);
    expect(gameChoices(true, 12).map((c) => c.label)).toEqual(["Continue at move 12", "From move 1", "A game already under way"]);
  });

  test("what it settled, read back by step 4", () => {
    expect(gameLine("continue", 12, null, null)).toBe("Continuing at move 12.");
    expect(gameLine("fresh", 1, null, null)).toBe("From move 1.");
    expect(gameLine("scan", 1, null, { kind: "ok", summary: "White to move at move 23, 30 pieces on the board.", fen: "x" })).toBe("From a scanned position: White to move at move 23, 30 pieces on the board.");
    expect(gameLine("scan", 1, null, { kind: "error", reason: "no" })).toBe("The position is not scanned yet.");
    expect(gameLine("fresh", 1, "8/8/8/4k3/8/8/4K3/8 w - - 0 40", null)).toBe("From a scanned position: White to move at move 40, 2 pieces on the board.");
  });
});
