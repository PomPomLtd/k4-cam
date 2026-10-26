import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import type { Color } from "chessops/types";
import { useId, useState } from "react";
import { useDispatch } from "react-redux";
import { gameResetMoves, gameSetFen, gameSetStart } from "../../slices/gameSlice";
import type { CanvasRef, CornersRef, ModelRefs, VideoRef } from "../../types";
import { findFen } from "../../utils/findFen";
import { positionSummary, scannedStart } from "../../utils/k4/position";

// Scanning the position (live-boards Phase E, §6.13): for a game the camera
// joins under way. Upstream's piece reader (findFen) reads every square; the
// player says who is to move and the move number; position.ts fills in the
// rest and checks it. The reader's own dispatch is captured, so a scan that
// fails leaves the game as it was.

type Result = { kind: "ok"; summary: string } | { kind: "error"; reason: string };

const ScanPanel = ({
  piecesModelRef,
  videoRef,
  canvasRef,
  cornersRef,
  ready,
  onScanned,
}: {
  piecesModelRef: ModelRefs["piecesModelRef"];
  videoRef: VideoRef;
  canvasRef: CanvasRef;
  cornersRef: CornersRef;
  /** The board has been found: the reader needs the corners. */
  ready: boolean;
  /** The game starts from this position now (null: it is the initial position, a plain game from move 1). */
  onScanned: (startFen: string | null) => void;
}) => {
  const dispatch = useDispatch();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [turn, setTurn] = useState<Color>("white");
  const [moveNumber, setMoveNumber] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const scan = async () => {
    setBusy(true);
    setResult(null);
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
      setResult({ kind: "error", reason: "The scan failed. Try again." });
      setBusy(false);
      return;
    }
    setBusy(false);
    if (boardFen === null) {
      setResult({ kind: "error", reason: readerText[1] ? `${readerText[1]}. Check who is to move, then scan again.` : "The board couldn't be read. Scan again." });
      return;
    }
    const scanned = scannedStart(boardFen, turn, Number(moveNumber));
    if (!scanned.ok) {
      setResult({ kind: "error", reason: scanned.reason });
      return;
    }
    dispatch(gameSetStart(scanned.fen));
    dispatch(gameSetFen(scanned.fen));
    dispatch(gameResetMoves());
    setResult({ kind: "ok", summary: scanned.initial ? "That is the starting position: the game begins at move 1." : positionSummary(scanned.fen) });
    setOpen(false);
    onScanned(scanned.initial ? null : scanned.fen);
  };

  if (!open) {
    return (
      <div className="k4-field">
        <button type="button" className="k4-button k4-button--block" disabled={!ready} onClick={() => setOpen(true)}>
          {result?.kind === "ok" ? "Scan the position again" : "Scan the position"}
        </button>
        {!ready && <div className="k4-small k4-muted">For a game already under way. Find the board first.</div>}
        {ready && result === null && <div className="k4-small k4-muted">For a game already under way.</div>}
        {result?.kind === "ok" && <div className="k4-small">{result.summary}</div>}
      </div>
    );
  }

  return (
    <div className="k4-field k4-notice">
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
      <button type="button" className="k4-button k4-button--quiet" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
};

export default ScanPanel;
