// A position scanned off the board (live-boards Phase E, 26 Oct 2026): what
// the piece reader can't know, filled in from what it saw. Castling rights
// are granted where the king and the rook stand on their home squares (a
// right wrongly granted only adds a legal move the matcher could pick; a
// right wrongly denied makes a real castling unmatchable, which is worse).
// En passant is never assumed. The player says who is to move and the move
// number. Pure: chessops only.

import { Chess } from "chessops/chess";
import { INITIAL_FEN, makeFen, parseFen } from "chessops/fen";
import { SquareSet } from "chessops/squareSet";
import type { Color } from "chessops/types";

const A1 = 0;
const E1 = 4;
const H1 = 7;
const A8 = 56;
const E8 = 60;
const H8 = 63;

const hasPiece = (fen: string, square: number, role: "king" | "rook", color: Color): boolean => {
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const piece = setup.value.board.get(square);
  return piece !== undefined && piece.role === role && piece.color === color;
};

/** The castling rights the pieces' home squares allow, as chessops keeps them (the rooks' squares). */
export const inferRights = (fen: string): SquareSet => {
  let rights = SquareSet.empty();
  if (hasPiece(fen, E1, "king", "white")) {
    if (hasPiece(fen, H1, "rook", "white")) rights = rights.with(H1);
    if (hasPiece(fen, A1, "rook", "white")) rights = rights.with(A1);
  }
  if (hasPiece(fen, E8, "king", "black")) {
    if (hasPiece(fen, H8, "rook", "black")) rights = rights.with(H8);
    if (hasPiece(fen, A8, "rook", "black")) rights = rights.with(A8);
  }
  return rights;
};

export type Scanned = { ok: true; fen: string; initial: boolean } | { ok: false; reason: string };

/**
 * The scanned board as the game's start: the side to move and the move
 * number as the player said, the castling rights inferred, no en passant,
 * and the whole thing checked as a legal position (two kings, the side not
 * to move not in check). The initial position is reported as such, so the
 * game can be a plain one from move 1.
 */
export const scannedStart = (boardFen: string, turn: Color, moveNumber: number): Scanned => {
  const parsed = parseFen(boardFen);
  if (parsed.isErr) return { ok: false, reason: "The board couldn't be read." };
  const setup = parsed.value;
  setup.turn = turn;
  setup.castlingRights = inferRights(boardFen);
  setup.epSquare = undefined;
  setup.halfmoves = 0;
  setup.fullmoves = Number.isInteger(moveNumber) && moveNumber >= 1 ? moveNumber : 1;
  const pos = Chess.fromSetup(setup);
  if (pos.isErr) return { ok: false, reason: positionProblem(pos.error.message) };
  const fen = makeFen(pos.value.toSetup());
  return { ok: true, fen, initial: fen === INITIAL_FEN };
};

const positionProblem = (message: string): string => {
  switch (message) {
    case "ERR_KINGS":
      return "The scan didn't find both kings. Check the board is fully in view, then scan again.";
    case "ERR_OPPOSITE_CHECK":
      return "The side not to move is in check. Check who is to move, then scan again.";
    case "ERR_PAWNS_ON_BACKRANK":
      return "A pawn was read on the first or last rank. Scan again.";
    default:
      return "The position isn't a legal one. Scan again.";
  }
};

/** "White to move at move 23, 31 pieces on the board." */
export const positionSummary = (fen: string): string => {
  const parsed = parseFen(fen);
  if (parsed.isErr) return "";
  const setup = parsed.value;
  const who = setup.turn === "white" ? "White" : "Black";
  const pieces = setup.board.occupied.size();
  return `${who} to move at move ${setup.fullmoves}, ${pieces} pieces on the board.`;
};

/** The full move number a FEN starts at, for "Resuming at move N". */
export const fullmovesOf = (fen: string): number => {
  const parsed = parseFen(fen);
  return parsed.isErr ? 1 : parsed.value.fullmoves;
};

/** Where a game's start stands: the move number and whether Black moves first (for the move list's rows). */
export const startOf = (fen: string): { move: number; blackFirst: boolean } => {
  const parsed = parseFen(fen);
  if (parsed.isErr) return { move: 1, blackFirst: false };
  return { move: parsed.value.fullmoves, blackFirst: parsed.value.turn === "black" };
};
