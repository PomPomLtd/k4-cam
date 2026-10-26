import { useState } from "react";
import { useDispatch } from "react-redux";
import { CornersButton } from "../common";
import { gameResetFen, gameResetMoves, gameResetStart } from "../../slices/gameSlice";
import type { CanvasRef, CornersRef, ModelRefs, SetStringArray, VideoRef } from "../../types";
import type { Sender, SenderStatus } from "../../utils/k4/sender";
import { type GameChoice, STEP_TITLES, type ScanResult, type Step, gameChoices, gameLine } from "../../utils/k4/setup";
import CameraSelect from "./cameraSelect";
import LensControl from "./lensControl";
import ScanPanel from "./scanPanel";

// Setting up, one step at a time (live-boards Phase E, 26 Oct 2026, Sam:
// "as intuitive as possible"): 1 place the phone, 2 find the board, 3 where
// the game stands, 4 start. A step shows its own controls; the ones before
// it show what they settled and can be reopened; the ones after wait.

const SETUP_LINE = "On a stand beside the board, all four corners in view, a king on the far side.";
export const PORTRAIT_LINE = "Turn the phone to landscape to film.";

const SetupSteps = ({
  piecesModelRef,
  xcornersModelRef,
  videoRef,
  canvasRef,
  cornersRef,
  setText,
  text,
  found,
  isPortrait,
  hasMoves,
  fromPosition,
  startFen,
  nextMove,
  status,
  sender,
  onStart,
}: {
  piecesModelRef: ModelRefs["piecesModelRef"];
  xcornersModelRef: ModelRefs["xcornersModelRef"];
  videoRef: VideoRef;
  canvasRef: CanvasRef;
  cornersRef: CornersRef;
  setText: SetStringArray;
  text: string[];
  found: boolean;
  isPortrait: boolean;
  /** The record holds moves (stored or just read). */
  hasMoves: boolean;
  /** The record starts from a scanned position. */
  fromPosition: boolean;
  startFen: string | null;
  /** The move to be played next. */
  nextMove: number;
  status: SenderStatus;
  sender: Sender | null;
  onStart: () => void;
}) => {
  const dispatch = useDispatch();
  const [step, setStep] = useState<Step>(1);
  const [choice, setChoice] = useState<GameChoice>(hasMoves ? "continue" : "fresh");
  const [scan, setScan] = useState<ScanResult | null>(null);

  const finderTrouble = !found && text[0] && !text[0].startsWith("FPS") ? text.join(". ") : null;
  const startReason = status.phase === "stopped" ? "Stopped." : isPortrait ? PORTRAIT_LINE : !found ? "Find the board first." : null;

  const settle3 = (): boolean => {
    if (choice === "fresh" && (hasMoves || fromPosition)) {
      if (!window.confirm("Start from move 1? The moves recorded so far are dropped.")) return false;
      dispatch(gameResetStart());
      dispatch(gameResetFen());
      dispatch(gameResetMoves());
      sender?.restart();
    }
    if (choice === "scan" && scan?.kind === "ok") {
      if (scan.fen === null) sender?.restart();
      else sender?.setStart(scan.fen);
    }
    return true;
  };

  const next = (from: Step) => {
    if (from === 3 && !settle3()) return;
    setStep((from + 1) as Step);
  };

  const done = (n: Step): string | null => {
    if (n >= step) return null;
    if (n === 1) return "In place.";
    if (n === 2) return "Board found.";
    return gameLine(choice, nextMove, startFen, scan);
  };

  const content = (n: Step) => {
    if (n !== step) return null;
    if (n === 1) {
      return (
        <>
          <div className="k4-small k4-muted">{SETUP_LINE}</div>
          <LensControl videoRef={videoRef} />
          <CameraSelect videoRef={videoRef} />
          {isPortrait && <div className="k4-small">{PORTRAIT_LINE}</div>}
          <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={isPortrait} onClick={() => next(1)}>
            Next
          </button>
        </>
      );
    }
    if (n === 2) {
      return (
        <>
          <CornersButton piecesModelRef={piecesModelRef} xcornersModelRef={xcornersModelRef} videoRef={videoRef} canvasRef={canvasRef} setText={setText} label={found ? "Find the board again" : "Find the board"} />
          {found && <div className="k4-small k4-muted">Board found. Drag a corner if one is off.</div>}
          {finderTrouble && <div className="k4-small k4-signal">{finderTrouble}</div>}
          <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={!found} onClick={() => next(2)}>
            Next
          </button>
          {!found && <div className="k4-small k4-muted">The camera needs the four corners before it can follow the pieces.</div>}
        </>
      );
    }
    if (n === 3) {
      const choices = gameChoices(hasMoves, nextMove);
      const ready = choice !== "scan" || scan?.kind === "ok";
      return (
        <>
          <div className="k4-choices" role="group" aria-label="Where the game stands">
            {choices.map((c) => (
              <button key={c.key} type="button" className="k4-choices__item" aria-pressed={choice === c.key} onClick={() => setChoice(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          {choice === "scan" && <ScanPanel piecesModelRef={piecesModelRef} videoRef={videoRef} canvasRef={canvasRef} cornersRef={cornersRef} result={scan} onResult={setScan} />}
          {choice === "fresh" && (hasMoves || fromPosition) && <div className="k4-small k4-muted">The moves recorded so far are dropped.</div>}
          <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={!ready} onClick={() => next(3)}>
            Next
          </button>
        </>
      );
    }
    return (
      <>
        <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={startReason !== null} onClick={onStart}>
          Start filming
        </button>
        {startReason !== null && <div className="k4-small k4-muted">{startReason}</div>}
        <div className="k4-small k4-muted">Then don't touch the phone until the game is over.</div>
      </>
    );
  };

  return (
    <ol className="k4-steps">
      {STEP_TITLES.map((title, i) => {
        const n = (i + 1) as Step;
        const settled = done(n);
        return (
          <li key={title} className={`k4-steps__item${n === step ? " k4-steps__item--current" : n < step ? " k4-steps__item--done" : ""}`} aria-current={n === step ? "step" : undefined}>
            <span className="k4-steps__n" aria-hidden="true">
              {n}
            </span>
            <div className="k4-steps__body">
              <div className="k4-steps__title">{title}</div>
              {settled && (
                <div className="k4-small k4-muted k4-steps__settled">
                  <span>{settled}</span>{" "}
                  <button type="button" className="k4-button k4-button--quiet k4-steps__change" onClick={() => setStep(n)}>
                    Change
                  </button>
                </div>
              )}
              {content(n)}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default SetupSteps;
