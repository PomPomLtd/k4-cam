// The set-up steps' words (live-boards Phase E, 26 Oct 2026): what step 3
// offers and what it settled, as step 4 reads it back. Pure.

import { positionSummary } from "./position";

export const STEP_TITLES = ["Place the phone", "Find the board", "Where the game stands", "Start"] as const;
export type Step = 1 | 2 | 3 | 4;

export type GameChoice = "continue" | "fresh" | "scan";

export type ScanResult = { kind: "ok"; summary: string; fen: string | null } | { kind: "error"; reason: string };

/** The choices of step 3: continuing where the record stands (when it has moves), from move 1, or from a scanned position. */
export const gameChoices = (hasMoves: boolean, nextMove: number): { key: GameChoice; label: string }[] => [
  ...(hasMoves ? [{ key: "continue" as const, label: `Continue at move ${nextMove}` }] : []),
  { key: "fresh", label: "From move 1" },
  { key: "scan", label: "A game already under way" },
];

/** What step 3 settled, as one line. */
export const gameLine = (choice: GameChoice, nextMove: number, startFen: string | null, scan: ScanResult | null): string => {
  if (choice === "continue") return `Continuing at move ${nextMove}.`;
  if (choice === "scan") return scan?.kind === "ok" ? `From a scanned position: ${scan.summary}` : "The position is not scanned yet.";
  return startFen ? `From a scanned position: ${positionSummary(startFen)}` : "From move 1.";
};
