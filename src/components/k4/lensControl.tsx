import { useEffect, useState } from "react";
import type { VideoRef } from "../../types";
import { LENS_LABELS, type LensKey, type LensStep, lensSteps, readLens, rememberLens, startingLens, type ZoomRange } from "../../utils/k4/lens";

// The lens (live-boards Phase E): a Segmented of the views the phone's track
// offers, read once the stream plays. The remembered choice is applied as
// the stream starts; upstream's forced minimum zoom (the ultra-wide on an
// iPhone) is skipped in the K4 mode (video.tsx). Hidden where the track has
// no zoom range, or one choice only.

const trackOf = (video: HTMLVideoElement): MediaStreamTrack | null => {
  const source = video.srcObject;
  if (!(source instanceof MediaStream)) return null;
  const tracks = source.getVideoTracks();
  return tracks.length > 0 ? tracks[0] : null;
};

/** The track's zoom range and where it stands, where the browser exposes them (lib.dom doesn't type zoom). */
const zoomOf = (track: MediaStreamTrack): { range: ZoomRange | undefined; now: number | undefined } => {
  const capabilities = typeof track.getCapabilities === "function" ? (track.getCapabilities() as MediaTrackCapabilities & { zoom?: ZoomRange }) : {};
  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
  return { range: capabilities.zoom, now: settings.zoom };
};

const applyZoom = (track: MediaStreamTrack, zoom: number) =>
  track.applyConstraints({ zoom } as MediaTrackConstraints).catch((error: unknown) => console.warn("Cannot set the lens", error));

/** The lens choices of the video's track, read now, at 0.5 s and at 2 s (the capabilities arrive late on some phones). */
const LOOK_AT_MS = [0, 500, 2_000];

const LensControl = ({ videoRef }: { videoRef: VideoRef }) => {
  const [steps, setSteps] = useState<LensStep[]>([]);
  const [current, setCurrent] = useState<LensKey | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    let gone = false;
    let timers: number[] = [];

    const read = (): boolean => {
      const track = trackOf(video);
      if (track === null) return false;
      let found: LensStep[] = [];
      try {
        const { range, now } = zoomOf(track);
        found = lensSteps(range, now);
      } catch {
        return false;
      }
      if (found.length === 0) return false;
      setSteps(found);
      const start = startingLens(found, readLens(window.localStorage));
      if (start !== null) {
        setCurrent(start.key);
        void applyZoom(track, start.zoom);
      }
      return true;
    };

    const onStream = () => {
      for (const id of timers) window.clearTimeout(id);
      timers = [];
      let done = false;
      setSteps([]);
      for (const ms of LOOK_AT_MS) {
        timers.push(
          window.setTimeout(() => {
            if (gone || done) return;
            done = read();
          }, ms),
        );
      }
    };

    video.addEventListener("loadedmetadata", onStream);
    if (video.readyState >= 1) onStream();
    return () => {
      gone = true;
      for (const id of timers) window.clearTimeout(id);
      video.removeEventListener("loadedmetadata", onStream);
    };
  }, [videoRef]);

  if (steps.length < 2) return null;

  const choose = (step: LensStep) => {
    const video = videoRef.current;
    const track = video === null ? null : trackOf(video);
    if (track === null) return;
    setCurrent(step.key);
    rememberLens(window.localStorage, step.key);
    void applyZoom(track, step.zoom);
  };

  return (
    <div className="k4-field">
      <div className="k4-small k4-muted" id="k4-lens-label">
        Lens
      </div>
      <div className="k4-segmented" role="group" aria-labelledby="k4-lens-label">
        {steps.map((step) => (
          <button key={step.key} type="button" className="k4-segmented__item" aria-pressed={current === step.key} onClick={() => choose(step)}>
            {LENS_LABELS[step.key]}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LensControl;
