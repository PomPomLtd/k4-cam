import { useEffect, useState } from "react";
import { CornersButton, DeviceButton, Sidebar, SidebarButton } from "../common";
import type { CanvasRef, ModelRefs, SetBoolean, SetStringArray, SidebarRef, VideoRef } from "../../types";
import { SOURCE_URL, UPSTREAM_AUTHOR, UPSTREAM_NAME } from "../../utils/k4/about";
import { keepAwake, type WakeLockHandle } from "../../utils/k4/wakeLock";
import { useK4 } from "./k4Context";
import K4Status from "./k4Status";
import Nick from "./nick";

// The sidebar of the K4 mode (live-boards spec §7.3, §9.2): who plays on this
// board, the two steps of setting up, Start and Stop, how the sending goes,
// and where this app comes from. The camera view and the detection loop are
// ChessCam's, untouched.

const SLOW_PHONE = "This phone is slow. Move closer to a Wi-Fi point and close other apps, or use another phone.";
const SETUP_LINES = ["Phone on a stand beside the board, all four corners in view, a king on the far side.", "Find the board, then Start."];

/** "FPS: 6.2" from the detection loop's text → 6.2; null before it runs. */
export const parseFps = (text: readonly string[]): number | null => {
  const m = /^FPS:\s*([\d.]+)/.exec(text[0] ?? "");
  if (!m) return null;
  const fps = Number(m[1]);
  return Number.isFinite(fps) ? fps : null;
};

const K4Sidebar = ({ piecesModelRef, xcornersModelRef, videoRef, canvasRef, sidebarRef, playing, setPlaying, text, setText }: {
  piecesModelRef: ModelRefs["piecesModelRef"],
  xcornersModelRef: ModelRefs["xcornersModelRef"],
  videoRef: VideoRef,
  canvasRef: CanvasRef,
  sidebarRef: SidebarRef,
  playing: boolean, setPlaying: SetBoolean,
  text: string[], setText: SetStringArray
}) => {
  const { session, sender, status, onStop } = useK4();
  const [wakeLock, setWakeLock] = useState<WakeLockHandle | null>(null);
  const fps = playing ? parseFps(text) : null;
  const inputStyle = { display: playing ? "none" : "inline-block" };

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

  const resumedAt = session.moves.length > 0 ? Math.ceil(session.moves.length / 2) : 0;

  return (
    <Sidebar sidebarRef={sidebarRef} playing={playing} text={text} setText={setText}>
      <li className="my-1 text-start">
        <div className="k4-wordmark">Board {session.board}</div>
        <div className="k4-body">
          <Nick>{session.white}</Nick> – <Nick>{session.black}</Nick>
        </div>
        <div className="k4-small k4-muted">
          {session.event}, round {session.round}
        </div>
        {resumedAt > 0 && <div className="k4-small mt-1">Resuming at move {resumedAt}.</div>}
      </li>
      {!playing && (
        <li className="my-1 text-start k4-small k4-muted">
          {SETUP_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </li>
      )}
      <li className="my-1" style={inputStyle}>
        <DeviceButton videoRef={videoRef} />
      </li>
      <li className="my-1" style={inputStyle}>
        <CornersButton
          piecesModelRef={piecesModelRef}
          xcornersModelRef={xcornersModelRef}
          videoRef={videoRef}
          canvasRef={canvasRef}
          setText={setText}
          label="Find the board"
        />
      </li>
      <li className="my-1">
        {playing ? (
          <SidebarButton onClick={stop}>Stop</SidebarButton>
        ) : (
          <SidebarButton onClick={() => setPlaying(true)} disabled={status.phase === "stopped"}>
            Start
          </SidebarButton>
        )}
      </li>
      <li className="my-1">
        <K4Status status={status} />
      </li>
      {status.phase === "taken" && (
        <li className="my-1">
          <SidebarButton onClick={() => sender?.takeOver()}>Take over</SidebarButton>
        </li>
      )}
      {fps !== null && fps < 4 && <li className="my-1 k4-small text-start k4-notice k4-notice--signal">{SLOW_PHONE}</li>}
      {playing && wakeLock?.fallback && <li className="my-1 k4-small text-start k4-notice">{wakeLock.fallback}</li>}
      <li className="my-1 k4-small text-start k4-muted">
        <div>
          Based on {UPSTREAM_NAME} by {UPSTREAM_AUTHOR}.
        </div>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Source code
        </a>
      </li>
    </Sidebar>
  );
};

export default K4Sidebar;
