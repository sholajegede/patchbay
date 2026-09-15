import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { api } from "../../convex/_generated/api";

const SERVER_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined;

function StageVideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);

  if (tracks.length === 0) {
    return (
      <div className="stage-video-empty">
        <span className="status-dot live" />
        Connected — waiting for video
      </div>
    );
  }

  return (
    <div className="stage-video-grid" data-count={Math.min(tracks.length, 4)}>
      {tracks.map((trackRef) => (
        <ParticipantTile key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}
    </div>
  );
}

// Renders the room's actual live video, not just its metadata — a
// subscribe-only viewer identity (see getViewerToken in convex/stages.ts)
// connects over real WebRTC and plays back whatever's currently published.
// Only ever mounted while the room is open (see StageCard), so idle stages
// never pay for a connection with nothing to show.
export function StageVideo({ roomName }: { roomName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const getViewerToken = useAction(api.stages.getViewerToken);

  useEffect(() => {
    let cancelled = false;
    getViewerToken({ roomName }).then((result) => {
      if (!cancelled) setToken(result.token);
    });
    return () => {
      cancelled = true;
    };
  }, [roomName, getViewerToken]);

  if (!SERVER_URL) {
    return (
      <div className="stage-video-empty">
        Set <code>VITE_LIVEKIT_URL</code> to preview live video here.
      </div>
    );
  }

  if (!token) {
    return <div className="stage-video-empty">Connecting…</div>;
  }

  return (
    <LiveKitRoom
      serverUrl={SERVER_URL}
      token={token}
      connect
      video={false}
      audio={false}
      data-lk-theme="default"
      className="stage-video"
    >
      <StageVideoGrid />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
