import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { VideoAndSidebar } from "../common";
import { boardFromSans, gameUpdate, makeUpdatePayload, useGame } from "../../slices/gameSlice";
import { APP_NAME, SOURCE_URL, UPSTREAM_AUTHOR, UPSTREAM_NAME, UPSTREAM_URL } from "../../utils/k4/about";
import { getSession, localTimes, type SessionAnswer } from "../../utils/k4/api";
import { INVALID_LINK, apiOrigins, clearFragment, readLink, recallLink, rememberLink, type CameraFragment } from "../../utils/k4/link";
import { createSender, sansOf, stateSentence, type Sender, type SenderStatus } from "../../utils/k4/sender";
import { K4Context } from "./k4Context";

// The K4 mode (live-boards spec §7.2 to §7.4): a camera link in the fragment
// names the app and the camera; the page asks the app what this camera
// films, hands ChessCam the stored game to resume from, and keeps the app
// told through the sender until the game is over, the organiser stops it,
// or the player does. Never a Lichess login, never a Lichess call.

type Screen =
  | { kind: "connecting" }
  | { kind: "invalid" }
  | { kind: "unreachable" }
  | { kind: "stopped"; sentence: string }
  | { kind: "ready"; session: SessionAnswer; link: CameraFragment }
  | { kind: "done"; sentence: string | null };

const IDLE: SenderStatus = { phase: "idle", sentPlies: 0, lastOkAt: null, sentence: null };

const UNREACHABLE = "Can't reach the app. Check the connection, then try again.";

/** The one screen outside the camera: a title, a sentence or two, and where this app comes from. */
const Shell = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <main className="d-flex min-vh-100 flex-column align-items-center justify-content-center bg-dark text-white p-4 text-center">
    <p className="small text-white-50 mb-4">{APP_NAME}</p>
    <h1 className="h3 mb-3" style={{ maxWidth: "32rem" }}>
      {title}
    </h1>
    <div className="d-flex flex-column align-items-center gap-3" style={{ maxWidth: "32rem" }}>
      {children}
    </div>
    <p className="small text-white-50 mt-5 mb-0">
      Based on{" "}
      <a href={UPSTREAM_URL} target="_blank" rel="noreferrer" className="link-light">
        {UPSTREAM_NAME}
      </a>{" "}
      by {UPSTREAM_AUTHOR}.
    </p>
    <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="small link-light">
      Source code
    </a>
  </main>
);

const K4Page = () => {
  const dispatch = useDispatch();
  const game = useGame();
  const [screen, setScreen] = useState<Screen>({ kind: "connecting" });
  const [status, setStatus] = useState<SenderStatus>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const senderRef = useRef<Sender | null>(null);
  // Set once the sender exists and the stored game is the board (see below); re-renders the provider with it.
  const [fed, setFed] = useState(false);

  // The link, then the session (§7.2, §7.3 Connecting).
  // biome-ignore lint/correctness/useExhaustiveDependencies: "Try again" re-reads the link and asks the app once more.
  useEffect(() => {
    const reading = readLink({ hash: window.location.hash, stored: recallLink(window.sessionStorage), allowlist: apiOrigins(import.meta.env) });
    if (reading.kind !== "ok") {
      setScreen({ kind: "invalid" });
      return;
    }
    const link = reading.fragment;
    rememberLink(window.sessionStorage, link);
    clearFragment();
    let stale = false;
    setScreen({ kind: "connecting" });
    void getSession(link.api, link.token).then((res) => {
      if (stale) return;
      if (res.kind === "network") return setScreen({ kind: "unreachable" });
      if (res.kind === "refused") return setScreen(res.refusal.error === "unknown-camera" ? { kind: "invalid" } : { kind: "unreachable" });
      const session = res.answer;
      if (session.state !== "live") return setScreen({ kind: "stopped", sentence: stateSentence(session.state, session.result) });
      setScreen({ kind: "ready", session, link });
    });
    return () => {
      stale = true;
    };
  }, [attempt]);

  const ready = screen.kind === "ready" ? screen : null;

  // The sender lives as long as the session. This effect runs after the
  // camera view mounted and reset the board (a child's effects run first), so
  // the stored game is dispatched last and becomes the board to continue from;
  // the same game, with its times on this clock, is the sender's baseline.
  useEffect(() => {
    if (ready === null) return;
    const { session, link } = ready;
    const sender = createSender({
      api: link.api,
      token: link.token,
      sessionId: crypto.randomUUID(),
      heartbeatMs: session.heartbeatSeconds * 1000,
      settleMs: session.settleSeconds * 1000,
    });
    senderRef.current = sender;
    const off = sender.onStatus((st) => {
      setStatus(st);
      if (st.phase === "stopped" && st.sentence !== null) setScreen({ kind: "done", sentence: st.sentence });
    });
    dispatch(gameUpdate(makeUpdatePayload(boardFromSans(session.moves))));
    sender.resume(session.moves, localTimes(session.times, session.now, Date.now()));
    setFed(true);
    return () => {
      off();
      sender.stop();
      senderRef.current = null;
      setFed(false);
      setStatus(IDLE);
    };
  }, [ready, dispatch]);

  // What the detection loop played, settled or not, goes to the sender (T6
  // settles, T10 keeps the time). A game without a move time is a reset or
  // the resumed game itself, which the sender already holds.
  useEffect(() => {
    const sender = senderRef.current;
    if (!fed || sender === null || game.lastMoveAt === null) return;
    sender.update(sansOf(game.moves), game.greedy, game.lastMoveAt);
  }, [fed, game.moves, game.greedy, game.lastMoveAt]);

  if (screen.kind === "invalid") return <Shell title={INVALID_LINK} />;
  if (screen.kind === "connecting") return <Shell title="Connecting to the board…" />;
  if (screen.kind === "unreachable") {
    return (
      <Shell title={UNREACHABLE}>
        <button type="button" className="btn btn-dark btn-outline-light" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </Shell>
    );
  }
  if (screen.kind === "stopped") {
    return (
      <Shell title={screen.sentence}>
        <p className="text-white-50 mb-0">You can close this page.</p>
      </Shell>
    );
  }
  if (screen.kind === "done") {
    return (
      <Shell title={screen.sentence ?? "Stopped."}>
        <p className="mb-0">Thank you.</p>
        <p className="text-white-50 mb-0">You can close this page.</p>
      </Shell>
    );
  }

  return (
    <K4Context.Provider
      value={{
        session: screen.session,
        sender: fed ? senderRef.current : null,
        status,
        onStop: () => setScreen({ kind: "done", sentence: "Stopped." }),
      }}
    >
      <VideoAndSidebar mode="k4" />
    </K4Context.Provider>
  );
};

export default K4Page;
