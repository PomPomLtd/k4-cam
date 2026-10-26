import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useMediaQuery } from "react-responsive";
import { CornersButton } from "../common";
import ChessboardPreview from "../common/chessboardPreview";
import { useCorners } from "../../slices/cornersSlice";
import { gameResetFen, gameResetMoves, gameResetStart, useGame } from "../../slices/gameSlice";
import type { CanvasRef, CornersDict, CornersRef, ModelRefs, SetBoolean, SetStringArray, SidebarRef, VideoRef } from "../../types";
import { START_FEN } from "../../utils/constants";
import { SOURCE_URL, UPSTREAM_AUTHOR, UPSTREAM_NAME } from "../../utils/k4/about";
import { fullmovesOf, positionSummary, startOf } from "../../utils/k4/position";
import { keepAwake, type WakeLockHandle } from "../../utils/k4/wakeLock";
import CameraSelect from "./cameraSelect";
import { useK4 } from "./k4Context";
import K4Status from "./k4Status";
import LensControl from "./lensControl";
import MoveList from "./moveList";
import Nick from "./nick";
import ScanPanel from "./scanPanel";

// The column beside the camera (live-boards spec §7.3, Phase E, 26 Oct
// 2026): who plays on this board; setting up (the lens and the camera, Find
// the board, a scan for a game under way, Start); filming (the status, the
// moves, the small board, Stop). The camera view and the detection loop are
// ChessCam's, untouched.

const SLOW_PHONE = "This phone is slow. Move closer to a Wi-Fi point and close other apps, or use another phone.";
const SETUP_LINE = "Phone on a stand beside the board, all four corners in view, a king on the far side.";
const PORTRAIT_LINE = "Turn the phone to landscape to film.";

/** "FPS: 6.2" from the detection loop's text → 6.2; null before it runs. */
export const parseFps = (text: readonly string[]): number | null => {
  const m = /^FPS:\s*([\d.]+)/.exec(text[0] ?? "");
  if (!m) return null;
  const fps = Number(m[1]);
  return Number.isFinite(fps) ? fps : null;
};

/** "6 frames a second", "1 frame a second". */
export const fpsLabel = (fps: number): string => {
  const n = Math.round(fps);
  return n === 1 ? "1 frame a second" : `${n} frames a second`;
};

/** Upstream's corners before anyone touched them (cornersSlice's initial state): a marker moved by hand counts as placed. */
const UNTOUCHED: CornersDict = { h1: [50, -100], a1: [0, -100], a8: [0, -150], h8: [50, -150] };
export const cornersMoved = (corners: CornersDict): boolean =>
  (Object.keys(UNTOUCHED) as (keyof CornersDict)[]).some((k) => corners[k][0] !== UNTOUCHED[k][0] || corners[k][1] !== UNTOUCHED[k][1]);

/** Find the board succeeded: upstream says so through the text line. */
const FOUND_TEXT = "Found corners";

const K4Sidebar = ({
  piecesModelRef,
  xcornersModelRef,
  videoRef,
  canvasRef,
  cornersRef,
  sidebarRef,
  playing,
  setPlaying,
  text,
  setText,
}: {
  piecesModelRef: ModelRefs["piecesModelRef"];
  xcornersModelRef: ModelRefs["xcornersModelRef"];
  videoRef: VideoRef;
  canvasRef: CanvasRef;
  cornersRef: CornersRef;
  sidebarRef: SidebarRef;
  playing: boolean;
  setPlaying: SetBoolean;
  text: string[];
  setText: SetStringArray;
}) => {
  const { session, sender, status, onStop } = useK4();
  const dispatch = useDispatch();
  const game = useGame();
  const corners = useCorners();
  const isPortrait = useMediaQuery({ orientation: "portrait" });
  const [wakeLock, setWakeLock] = useState<WakeLockHandle | null>(null);
  const [foundOnce, setFoundOnce] = useState(false);
  const fps = playing ? parseFps(text) : null;

  useEffect(() => {
    if (text[0] === FOUND_TEXT) setFoundOnce(true);
  }, [text]);

  // The frame rate rides along with every request (the organiser sees it).
  useEffect(() => {
    sender?.setFps(fps);
  }, [fps, sender]);

  // The screen stays on while filming.
  useEffect(() => {
    if (!playing) return;
    let handle: WakeLockHandle | null = null;
    let gone = false;
    void keepAwake().then((h) => {
      if (gone) {
        h.release();
        return;
      }
      handle = h;
      setWakeLock(h);
    });
    return () => {
      gone = true;
      handle?.release();
      setWakeLock(null);
    };
  }, [playing]);

  const stop = () => {
    if (!window.confirm("Stop filming this board?")) return;
    setPlaying(false);
    sender?.stop();
    onStop();
  };

  const startOver = () => {
    if (!window.confirm("Start from move 1? The moves recorded so far are dropped.")) return;
    dispatch(gameResetStart());
    dispatch(gameResetFen());
    dispatch(gameResetMoves());
    sender?.restart();
  };

  const found = foundOnce || cornersMoved(corners);
  const fromPosition = game.start !== START_FEN;
  const hasMoves = game.moves.trim() !== "";
  const start = startOf(game.start);
  const nextMove = fullmovesOf(game.fen);
  const startReason = status.phase === "stopped" ? "Stopped." : !found ? "Find the board first." : isPortrait ? PORTRAIT_LINE : null;

  return (
    <div ref={sidebarRef} className="k4-side">
      <div className="k4-side__block">
        <h1 className="k4-title mb-0">Board {session.board}</h1>
        <div className="k4-body">
          <Nick>{session.white}</Nick> – <Nick>{session.black}</Nick>
        </div>
        <div className="k4-small k4-muted">
          {session.event}, round {session.round}
        </div>
      </div>

      {!playing && (
        <>
          {(hasMoves || fromPosition) && (
            <div className="k4-side__block k4-notice">
              <div className="k4-body">{hasMoves ? `Resuming at move ${nextMove}.` : `From a scanned position: ${positionSummary(game.start)}`}</div>
              <button type="button" className="k4-button k4-button--block" onClick={startOver}>
                Start from move 1
              </button>
            </div>
          )}
          <div className="k4-side__block k4-small k4-muted">{SETUP_LINE}</div>
          <div className="k4-side__block">
            <CornersButton piecesModelRef={piecesModelRef} xcornersModelRef={xcornersModelRef} videoRef={videoRef} canvasRef={canvasRef} setText={setText} label={found ? "Find the board again" : "Find the board"} />
            {found && <div className="k4-small k4-muted">Board found. Drag a corner if one is off.</div>}
          </div>
          <div className="k4-side__block">
            <button type="button" className="k4-button k4-button--primary k4-button--block" disabled={startReason !== null} onClick={() => setPlaying(true)}>
              Start
            </button>
            {startReason !== null && <div className="k4-small k4-muted">{startReason}</div>}
          </div>
          <div className="k4-side__block k4-side__more">
            <LensControl videoRef={videoRef} />
            <CameraSelect videoRef={videoRef} />
            <ScanPanel piecesModelRef={piecesModelRef} videoRef={videoRef} canvasRef={canvasRef} cornersRef={cornersRef} ready={found} onScanned={(fen) => (fen === null ? sender?.restart() : sender?.setStart(fen))} />
          </div>
        </>
      )}

      {playing && (
        <>
          <div className="k4-side__block">
            <K4Status status={status} />
            {status.phase === "taken" && (
              <button type="button" className="k4-button k4-button--block" onClick={() => sender?.takeOver()}>
                Take over
              </button>
            )}
          </div>
          <div className="k4-side__block">
            <MoveList movetext={game.moves} greedy={game.greedy} fromMove={start.move} blackFirst={start.blackFirst} />
          </div>
          <div className="k4-side__block k4-side__board">
            <ChessboardPreview fen={game.fen} squareSize={26} lastMove={game.lastMove} />
            {fps !== null && <div className="k4-small k4-muted">{fpsLabel(fps)}</div>}
          </div>
          {fps !== null && fps < 4 && <div className="k4-side__block k4-small k4-notice k4-notice--signal">{SLOW_PHONE}</div>}
          {wakeLock?.fallback && <div className="k4-side__block k4-small k4-notice">{wakeLock.fallback}</div>}
          <div className="k4-side__block">
            <button type="button" className="k4-button k4-button--quiet k4-button--danger" onClick={stop}>
              Stop filming
            </button>
          </div>
        </>
      )}

      <div className="k4-side__block k4-side__foot k4-small k4-muted">
        <div>
          Based on {UPSTREAM_NAME} by {UPSTREAM_AUTHOR}.
        </div>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
      </div>
    </div>
  );
};

export default K4Sidebar;
