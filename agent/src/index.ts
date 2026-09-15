// Stage-manager agent — listens to every real speaker's audio in a stage,
// transcribes it live via Deepgram, and flags the stage on Convex when
// every real speaker has gone quiet for too long ("dead air"), clearing the
// flag the instant someone speaks again. This is the piece that actually
// watches a broadcast, rather than just proving the worker boots.
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
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const { SpeechEventType } = sttNamespace;

// How long a stage can go without any real speaker's voice before the
// control room gets a "dead air" flag.
const DEAD_AIR_THRESHOLD_MS = 20_000;
const CHECK_INTERVAL_MS = 5_000;

// Same three-prefix convention used on the Convex side (see
// convex/stages.ts's isRealSpeaker): egress, the control room's own video
// preview, and the demo broadcaster all join a room but none of them are a
// real speaker, so none of them should count toward — or clear — dead air.
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

    const convexUrl = process.env.CONVEX_URL;
    const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
    if (!convex) {
      console.warn("CONVEX_URL not set — dead-air flags won't reach the control room.");
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      console.warn("DEEPGRAM_API_KEY not set — the stage-manager can't transcribe audio, so it can't detect dead air.");
      return;
    }

    const roomName = ctx.room.name;
    const lastSpeechAt = new Map<string, number>();
    const streams = new Map<string, InstanceType<typeof sttNamespace.SpeechStream>>();
    let deadAirActive = false;

    async function reportDeadAir(active: boolean) {
      if (!convex || active === deadAirActive) return;
      deadAirActive = active;
      try {
        await convex.mutation(anyApi.stages.reportDeadAir, { roomName, active });
      } catch (err) {
        console.error("Failed to report dead-air state to Convex:", err);
      }
    }

    function listenTo(identity: string, track: RemoteTrack) {
      const speechToText = new STT({ apiKey: deepgramApiKey, model: "nova-3", interimResults: false });
      const stream = speechToText.stream();
      stream.updateInputStream(new AudioStream(track));
      streams.set(identity, stream);
      lastSpeechAt.set(identity, Date.now());

      void (async () => {
        try {
          for await (const event of stream) {
            if (
              event.type === SpeechEventType.START_OF_SPEECH ||
              event.type === SpeechEventType.FINAL_TRANSCRIPT
            ) {
              lastSpeechAt.set(identity, Date.now());
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
      lastSpeechAt.delete(identity);
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

    const interval = setInterval(() => {
      void (async () => {
        if (lastSpeechAt.size === 0) {
          // Nobody real is currently on mic — nothing to flag as dead air.
          await reportDeadAir(false);
          return;
        }
        const mostRecentSpeech = Math.max(...lastSpeechAt.values());
        await reportDeadAir(Date.now() - mostRecentSpeech > DEAD_AIR_THRESHOLD_MS);
      })();
    }, CHECK_INTERVAL_MS);

    ctx.room.on(RoomEvent.Disconnected, () => {
      clearInterval(interval);
      for (const identity of [...streams.keys()]) stopListeningTo(identity);
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
