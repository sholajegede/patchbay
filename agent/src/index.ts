// Stage-manager agent — listens to every real speaker's audio in a stage and
// transcribes it live via Deepgram. This is the piece that actually
// understands a broadcast, rather than just proving the worker boots.
import { fileURLToPath } from "node:url";
import { type JobContext, WorkerOptions, cli, defineAgent, stt as sttNamespace } from "@livekit/agents";
import { STT } from "@livekit/agents-plugin-deepgram";
import {
  AudioStream,
  RoomEvent,
  TrackKind,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "@livekit/rtc-node";

const { SpeechEventType } = sttNamespace;

// Same three-prefix convention used on the Convex side (see
// convex/stages.ts's isRealSpeaker): egress, the control room's own video
// preview, and the demo broadcaster all join a room but none of them are a
// real speaker.
function isRealSpeaker(identity: string): boolean {
  return (
    !identity.startsWith("EG_") &&
    !identity.startsWith("viewer-") &&
    !identity.startsWith("demo-broadcaster-")
  );
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log("patchbay stage-manager agent connected to room:", ctx.room.name);

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      console.warn("DEEPGRAM_API_KEY not set — the stage-manager can't transcribe audio.");
      return;
    }

    const streams = new Map<string, InstanceType<typeof sttNamespace.SpeechStream>>();

    function listenTo(identity: string, track: RemoteTrack) {
      const speechToText = new STT({ apiKey: deepgramApiKey, model: "nova-3", interimResults: false });
      const stream = speechToText.stream();
      stream.updateInputStream(new AudioStream(track));
      streams.set(identity, stream);

      void (async () => {
        try {
          for await (const event of stream) {
            if (event.type === SpeechEventType.FINAL_TRANSCRIPT) {
              const text = event.alternatives?.[0]?.text;
              if (text) console.log(`[${identity}] ${text}`);
            }
          }
        } catch (err) {
          console.error(`Speech stream for "${identity}" ended with an error:`, err);
        }
      })();
    }

    function stopListeningTo(identity: string) {
      streams.get(identity)?.close();
      streams.delete(identity);
    }

    ctx.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === TrackKind.KIND_AUDIO && isRealSpeaker(participant.identity)) {
          listenTo(participant.identity, track);
        }
      },
    );

    ctx.room.on(
      RoomEvent.TrackUnsubscribed,
      (_track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        stopListeningTo(participant.identity);
      },
    );

    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      stopListeningTo(participant.identity);
    });

    ctx.room.on(RoomEvent.Disconnected, () => {
      for (const identity of [...streams.keys()]) stopListeningTo(identity);
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
