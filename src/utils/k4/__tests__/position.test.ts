import { describe, expect, test } from "vitest";
import { INITIAL_FEN } from "chessops/fen";
import { fullmovesOf, inferRights, positionSummary, scannedStart, startOf } from "../position";

const sq = (s: string) => s.charCodeAt(0) - 97 + (Number(s[1]) - 1) * 8;

describe("a scanned position", () => {
  test("castling rights where king and rook are home, on each side on its own", () => {
    const rights = inferRights("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1");
    expect([sq("a1"), sq("h1"), sq("a8"), sq("h8")].every((s) => rights.has(s))).toBe(true);
    const moved = inferRights("r3k2r/8/8/8/8/8/8/R4RK1 w - - 0 1");
    expect(moved.has(sq("a1"))).toBe(false);
    expect(moved.has(sq("h1"))).toBe(false);
    expect(moved.has(sq("a8"))).toBe(true);
    const noRook = inferRights("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    expect(noRook.has(sq("a1"))).toBe(true);
    expect(noRook.has(sq("h1"))).toBe(false);
  });

  test("the reader's bare board becomes a legal start with the player's two answers", () => {
    const board = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w - - 0 1";
    expect(scannedStart(board, "white", 3)).toEqual({ ok: true, fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", initial: false });
    expect(scannedStart(board, "black", 2)).toMatchObject({ ok: true, fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 2" });
    expect(scannedStart(board, "white", 0)).toMatchObject({ ok: true, fen: expect.stringMatching(/ 0 1$/) });
  });

  test("the initial position is recognised as such", () => {
    expect(scannedStart("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b - - 3 7", "white", 1)).toEqual({ ok: true, fen: INITIAL_FEN, initial: true });
  });

  test("a position that can't be a game is refused with a reason", () => {
    expect(scannedStart("8/8/8/8/8/8/8/4K3 w - - 0 1", "white", 1)).toMatchObject({ ok: false, reason: expect.stringContaining("both kings") });
    // Black to move, but the black king gives check… the white king is attacked by the black rook while Black is to move.
    expect(scannedStart("4k3/8/8/8/8/8/8/r3K3 b - - 0 1", "black", 1)).toMatchObject({ ok: false, reason: expect.stringContaining("not to move is in check") });
    expect(scannedStart("not a fen", "white", 1)).toMatchObject({ ok: false, reason: "The board couldn't be read." });
  });

  test("the summary and the move number", () => {
    expect(positionSummary("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 23")).toBe("Black to move at move 23, 32 pieces on the board.");
    expect(fullmovesOf("8/8/8/4k3/8/8/4K3/8 w - - 0 40")).toBe(40);
    expect(fullmovesOf("junk")).toBe(1);
    expect(startOf("8/8/8/4k3/8/8/4K3/8 b - - 0 40")).toEqual({ move: 40, blackFirst: true });
    expect(startOf(INITIAL_FEN)).toEqual({ move: 1, blackFirst: false });
  });
});
