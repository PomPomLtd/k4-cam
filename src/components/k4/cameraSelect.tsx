import { useEffect, useState } from "react";
import type { VideoRef } from "../../types";
import { MEDIA_CONSTRAINTS } from "../../utils/constants";

// Which camera (live-boards Phase E): the phone's video inputs, listed once
// the first stream plays (before that, browsers hide the labels), as a
// select; hidden with one camera. On an iPhone the lenses are devices too
// ("Back Camera", "Back Ultra Wide Camera"), on Android usually one back
// camera. A change starts a new stream on the chosen device and stops the
// old one.

const label = (device: MediaDeviceInfo, i: number): string => {
  const text = device.label.split("(")[0].trim();
  return text === "" ? `Camera ${i + 1}` : text;
};

const currentDeviceId = (video: HTMLVideoElement): string => {
  const source = video.srcObject;
  if (!(source instanceof MediaStream)) return "";
  const track = source.getVideoTracks()[0];
  return track?.getSettings().deviceId ?? "";
};

const CameraSelect = ({ videoRef }: { videoRef: VideoRef }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [chosen, setChosen] = useState<string>("");

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    let gone = false;
    const list = () => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((all) => {
          if (gone) return;
          setDevices(all.filter((d) => d.kind === "videoinput"));
          setChosen((id) => id || currentDeviceId(video));
        })
        .catch((error: unknown) => console.warn("Cannot list the cameras", error));
    };
    video.addEventListener("loadedmetadata", list);
    if (video.readyState >= 1) list();
    return () => {
      gone = true;
      video.removeEventListener("loadedmetadata", list);
    };
  }, [videoRef]);

  if (devices.length < 2) return null;

  const change = async (deviceId: string) => {
    const video = videoRef.current;
    if (video === null) return;
    setChosen(deviceId);
    const base = typeof MEDIA_CONSTRAINTS.video === "object" ? MEDIA_CONSTRAINTS.video : {};
    const { facingMode: _facing, ...rest } = base;
    const stream = await navigator.mediaDevices.getUserMedia({ ...MEDIA_CONSTRAINTS, video: { ...rest, deviceId: { exact: deviceId } } });
    const old = video.srcObject;
    video.srcObject = stream;
    if (old instanceof MediaStream) for (const track of old.getTracks()) track.stop();
  };

  return (
    <div className="k4-field">
      <label className="k4-small k4-muted" htmlFor="k4-camera">
        Camera
      </label>
      <select id="k4-camera" className="k4-select" value={chosen} onChange={(e) => void change(e.target.value).catch((error: unknown) => console.error("Cannot switch the camera", error))}>
        {devices.map((d, i) => (
          <option key={d.deviceId || String(i)} value={d.deviceId}>
            {label(d, i)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default CameraSelect;
