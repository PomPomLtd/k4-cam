import { useEffect, useState } from "react";
import type { SenderStatus } from "../../utils/k4/sender";

// The status line of the K4 sidebar (live-boards spec §7.3): a mark for what
// the camera is doing now, the facts beside it set apart (never joined with
// dots), and anything the sender wants said.

const agoLabel = (then: number, now: number): string => {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
};

const movesLabel = (plies: number): string => {
  const moves = Math.ceil(plies / 2);
  if (plies <= 0) return "no moves sent yet";
  return moves === 1 ? "1 move sent" : `${moves} moves sent`;
};

const MARK: Record<SenderStatus["phase"], { word: string; treatment: "solid" | "outline" | "plain" }> = {
  idle: { word: "Connecting", treatment: "outline" },
  live: { word: "Live", treatment: "solid" },
  offline: { word: "Offline", treatment: "solid" },
  taken: { word: "Paused", treatment: "outline" },
  stopped: { word: "Stopped", treatment: "plain" },
};

const K4Status = ({ status }: { status: SenderStatus }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const mark = MARK[status.phase];
  const facts: string[] = [];
  if (status.phase === "live" || status.phase === "offline") facts.push(movesLabel(status.sentPlies));
  if (status.lastOkAt !== null && (status.phase === "live" || status.phase === "offline")) facts.push(`last ${agoLabel(status.lastOkAt, now)}`);

  return (
    <div className="k4-body" role="status" aria-live="polite">
      <div className="d-flex flex-wrap align-items-center column-gap-3 row-gap-1">
        <span className={`k4-mark k4-mark--${mark.treatment}`}>{mark.word}</span>
        {facts.map((fact) => (
          <span key={fact} className="k4-small k4-muted">
            {fact}
          </span>
        ))}
      </div>
      {status.sentence && <div className="k4-small mt-2 k4-notice">{status.sentence}</div>}
    </div>
  );
};

export default K4Status;
