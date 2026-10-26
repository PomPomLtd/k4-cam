import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import type { Color } from "chessops/types";
import { useId, useState } from "react";
import { useDispatch } from "react-redux";
import { gameResetMoves, gameSetFen, gameSetStart } from "../../slices/gameSlice";
import type { CanvasRef, CornersRef, ModelRefs, VideoRef } from "../../types";
import { findFen } from "../../utils/findFen";
import { positionSummary, scannedStart } from "../../utils/k4/position";
import type { ScanResult } from "../../utils/k4/setup";

// Scanning the position (live-boards Phase E, §6.13): for a game the camera
// joins under way, the third set-up step's form. Upstream's piece reader
// (findFen) reads every square; the player says who is to move and the move
// number; position.ts fills in the rest and checks it. The reader's own
// dispatch is captured, so a scan that fails leaves the game as it was.

const ScanPanel = ({
  piecesModelRef,
  videoRef,
  canvasRef,
  cornersRef,
  result,
  onResult,
}: {
  piecesModelRef: ModelRefs["piecesModelRef"];
  videoRef: VideoRef;
  canvasRef: CanvasRef;
  cornersRef: CornersRef;
  /** The last scan's outcome, held by the step so it survives a step change. */
  result: ScanResult | null;
  /** A scan ended: its summary and the start position (null: the initial position, a plain game from move 1), or its reason. */
  onResult: (result: ScanResult) => void;
}) => {
  const dispatch = useDispatch();
  const id = useId();
  const [turn, setTurn] = useState<Color>("white");
  const [moveNumber, setMoveNumber] = useState("1");
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);

  const scan = async () => {
    setBusy(true);
    let boardFen: string | null = null;
    let readerText: string[] = [];
    const capture: Dispatch<UnknownAction> = (action) => {
      if (action.type === gameSetStart.type && typeof action.payload === "string") boardFen = action.payload;
      return action;
    };
    try {
      await findFen({
        piecesModelRef,
        videoRef,
        cornersRef,
        canvasRef,
        dispatch: capture,
        setText: (t) => {
          readerText = typeof t === "function" ? t(readerText) : t;
        },
        color: turn,
      });
    } catch (error) {
      console.error("The scan failed", error);
      setBusy(false);
      onResult({ kind: "error", reason: "The scan failed. Try again." });
      return;
    }
    setBusy(false);
    if (boardFen === null) {
      onResult({ kind: "error", reason: readerText[1] ? `${readerText[1]}. Check who is to move, then scan again.` : "The board couldn't be read. Scan again." });
      return;
    }
    const scanned = scannedStart(boardFen, turn, Number(moveNumber));
    if (!scanned.ok) {
      onResult({ kind: "error", reason: scanned.reason });
      return;
    }
    dispatch(gameSetStart(scanned.fen));
    dispatch(gameSetFen(scanned.fen));
    dispatch(gameResetMoves());
    setAgain(false);
    onResult({
      kind: "ok",
      summary: scanned.initial ? "That is the starting position: the game begins at move 1." : positionSummary(scanned.fen),
      fen: scanned.initial ? null : scanned.fen,
    });
  };

  if (result?.kind === "ok" && !again) {
    return (
      <div className="k4-field">
        <div className="k4-small">{result.summary}</div>
        <button type="button" className="k4-button k4-button--quiet" onClick={() => setAgain(true)}>
          Scan again
        </button>
      </div>
    );
  }

  return (
    <div className="k4-field">
      <div className="k4-small k4-muted" id={`${id}-turn`}>
        Who is to move?
      </div>
      <div className="k4-segmented" role="group" aria-labelledby={`${id}-turn`}>
        <button type="button" className="k4-segmented__item" aria-pressed={turn === "white"} onClick={() => setTurn("white")}>
          White
        </button>
        <button type="button" className="k4-segmented__item" aria-pressed={turn === "black"} onClick={() => setTurn("black")}>
          Black
        </button>
      </div>
      <label className="k4-small k4-muted" htmlFor={`${id}-move`}>
        Move number
      </label>
      <input id={`${id}-move`} className="k4-input" type="number" inputMode="numeric" min={1} max={300} value={moveNumber} onChange={(e) => setMoveNumber(e.target.value)} />
      <div className="k4-small k4-muted">Every piece in view, nothing in the way.</div>
      <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={busy} onClick={() => void scan()}>
        {busy ? "Scanning…" : "Scan"}
      </button>
      {result?.kind === "error" && <div className="k4-small k4-signal">{result.reason}</div>}
    </div>
  );
};

export default ScanPanel;
