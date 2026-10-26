import { useEffect, useRef } from "react";
import { sansOf } from "../../utils/k4/sender";

// The moves the camera has read (live-boards Phase E), shaped like the
// scoresheet: a row per move, White then Black, the newest row framed, a
// greedy last ply (seen once, not yet settled) in muted with a question
// mark. A game from a scanned position numbers its rows from there, and may
// open with Black's move. Scrolls to the newest move by itself.

const MoveList = ({ movetext, greedy, fromMove = 1, blackFirst = false }: { movetext: string; greedy: boolean; fromMove?: number; blackFirst?: boolean }) => {
  const sans = sansOf(movetext);
  const listRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the moves change.
  useEffect(() => {
    const el = listRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [movetext]);

  if (sans.length === 0) {
    return (
      <div className="k4-small k4-muted" aria-live="polite">
        No moves yet.
      </div>
    );
  }

  const cells: (string | null)[] = blackFirst ? [null, ...sans] : sans;
  const lastCell = cells.length - 1;
  const rows: { n: number; white: string | null; black: string | null; last: boolean }[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push({ n: fromMove + i / 2, white: cells[i], black: cells[i + 1] ?? null, last: i + 1 >= lastCell });
  const moves = Math.ceil(sans.length / 2);

  return (
    <div className="k4-moves">
      <div className="k4-small k4-muted" aria-live="polite">
        {moves === 1 ? "1 move" : `${moves} moves`}
      </div>
      <div className="k4-moves__list" ref={listRef} role="list" aria-label="Moves">
        {rows.map((row) => {
          const greedyWhite = greedy && row.last && lastCell % 2 === 0;
          const greedyBlack = greedy && row.last && lastCell % 2 === 1;
          return (
            <div key={row.n} role="listitem" className={`k4-moves__row${row.last ? " k4-moves__row--last" : ""}`}>
              <span className="k4-moves__n">{row.n}</span>
              <span className={greedyWhite ? "k4-muted" : ""}>
                {row.white ?? "…"}
                {greedyWhite ? "?" : ""}
              </span>
              <span className={greedyBlack ? "k4-muted" : ""}>
                {row.black ?? ""}
                {greedyBlack ? "?" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MoveList;
