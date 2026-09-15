import { useRef, useState } from "react";
import { useAction } from "convex/react";
import { Room, Track } from "livekit-client";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui";
import { createSyntheticMedia, type SyntheticMedia } from "../lib/syntheticMedia";

const SERVER_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
const DEMO_ROOM_NAME = "demo-stage";
const DEMO_DISPLAY_NAME = "Demo Stage";

function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return err.message.split("\n")[0];
}

// Lets a visitor see a stage go live with no camera, no OBS, and no
// server-side process — this browser tab becomes the encoder. Publishes a
// canvas animation and a tone as real WebRTC tracks into a dedicated
// "Demo Stage" (auto-created on first use, same as any other stage), which
// renders through the exact same StageCard/StageVideo pipeline as a real
// broadcast.
export function DemoBroadcaster() {
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const mediaRef = useRef<SyntheticMedia | null>(null);

  const createStage = useAction(api.stages.createStage);
  const getPublisherToken = useAction(api.stages.getPublisherToken);

  async function start() {
    if (!SERVER_URL) {
      setError("Set VITE_LIVEKIT_URL to enable the demo broadcaster.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createStage({ roomName: DEMO_ROOM_NAME, displayName: DEMO_DISPLAY_NAME });
      const identity = `demo-broadcaster-${crypto.randomUUID().slice(0, 8)}`;
      const { token } = await getPublisherToken({ roomName: DEMO_ROOM_NAME, identity });

      const media = createSyntheticMedia("PATCHBAY DEMO");
      const room = new Room();
      await room.connect(SERVER_URL, token);
      await room.localParticipant.publishTrack(media.videoTrack, { source: Track.Source.Camera });
      await room.localParticipant.publishTrack(media.audioTrack, {
        source: Track.Source.Microphone,
      });

      roomRef.current = room;
      mediaRef.current = media;
      setLive(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    setPending(true);
    try {
      await roomRef.current?.disconnect();
    } finally {
      mediaRef.current?.stop();
      roomRef.current = null;
      mediaRef.current = null;
      setLive(false);
      setPending(false);
    }
  }

  return (
    <div className="demo-broadcaster">
      <div className="demo-broadcaster-copy">
        <strong>No camera or encoder handy?</strong>
        <p>Publish a synthetic feed straight from this browser tab to watch a stage go live.</p>
      </div>
      {error && <div className="callout callout-bad">{error}</div>}
      <Button
        variant={live ? "danger" : "primary"}
        disabled={pending}
        onClick={() => void (live ? stop() : start())}
      >
        {live ? "Stop demo broadcast" : "Simulate a live broadcast"}
      </Button>
    </div>
  );
}
