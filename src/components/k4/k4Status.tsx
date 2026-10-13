import { useEffect, useState } from "react";
import type { SenderStatus } from "../../utils/k4/sender";

// The status line of the K4 sidebar (live-boards spec §7.3): what the app
// has, how long ago it answered, and anything the sender wants said. Facts
// are set apart, never joined with dots.

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

const K4Status = ({ status }: { status: SenderStatus }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const facts: string[] = [];
  if (status.phase === "idle") facts.push("Connecting");
  if (status.phase === "live") facts.push("Live", movesLabel(status.sentPlies));
  if (status.phase === "offline") facts.push("Offline", movesLabel(status.sentPlies));
  if (status.phase === "taken") facts.push("Paused");
  if (status.phase === "stopped") facts.push("Stopped");
  if (status.lastOkAt !== null && (status.phase === "live" || status.phase === "offline")) facts.push(`last ${agoLabel(status.lastOkAt, now)}`);

  return (
    <div className="text-white text-start" role="status" aria-live="polite">
      <div className="d-flex flex-wrap column-gap-3">
        {facts.map((fact, i) => (
          <span key={fact} className={i === 0 ? "fw-bold" : "text-white-50"}>
            {fact}
          </span>
        ))}
      </div>
      {status.sentence && <div className="small mt-1">{status.sentence}</div>}
    </div>
  );
};

export default K4Status;
