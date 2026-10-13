import { createContext, useContext } from "react";
import type { SessionAnswer } from "../../utils/k4/api";
import type { Sender, SenderStatus } from "../../utils/k4/sender";

// What the K4 sidebar needs from the page that owns the session and the
// sender (live-boards spec §7.3): who is playing, how the sending goes, and
// the way to stop.
export interface K4Value {
  session: SessionAnswer;
  /** Null for the first frame: the page makes it once the camera view has mounted (see k4Page). */
  sender: Sender | null;
  status: SenderStatus;
  /** The player pressed Stop (already confirmed). */
  onStop: () => void;
}

export const K4Context = createContext<K4Value | null>(null);

export const useK4 = (): K4Value => {
  const value = useContext(K4Context);
  if (value === null) throw new Error("useK4 outside the K4 mode");
  return value;
};
