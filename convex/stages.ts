import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { livekit } from "./lib/livekit";

// ─── App-level stage records ───────────────────────────────────────────────

export const recordStage = internalMutation({
  args: { roomName: v.string(), displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stages")
      .withIndex("by_roomName", (q) => q.eq("roomName", args.roomName))
      .first();
    if (existing) return null;
    await ctx.db.insert("stages", { ...args, createdAt: Date.now() });
    return null;
  },
});

export const removeStageRecord = internalMutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stages")
      .withIndex("by_roomName", (q) => q.eq("roomName", args.roomName))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ─── Stage lifecycle ────────────────────────────────────────────────────────

export const createStage = action({
  args: { roomName: v.string(), displayName: v.string() },
  handler: async (ctx, args) => {
    await livekit.createRoom(ctx, { name: args.roomName });
    await ctx.runMutation(internal.stages.recordStage, args);
    return null;
  },
});

export const deleteStage = action({
  args: { roomName: v.string() },
  handler: async (ctx, args) => {
    await livekit.deleteRoom(ctx, { name: args.roomName });
    await ctx.runMutation(internal.stages.removeStageRecord, { roomName: args.roomName });
    return null;
  },
});

// listStages joins Patchbay's own `stages` table with everything
// convex-livekit already tracks reactively — room status, live participant
// count, in-flight egress, and connected ingress endpoints — so the control
// room UI is one query away from a full live picture of every stage.
// RoomCompositeEgress joins as a hidden "EG_..." participant purely to
// composite the room, the control room's own video preview joins as a
// subscribe-only "viewer-..." participant (see getViewerToken below), and
// the demo broadcaster joins as "demo-broadcaster-..." (see
// getPublisherToken below) — none of these are a real speaker, so all three
// are filtered out before the stage grid counts who's actually live.
function isRealSpeaker(identity: string): boolean {
  return (
    !identity.startsWith("EG_") &&
    !identity.startsWith("viewer-") &&
    !identity.startsWith("demo-broadcaster-")
  );
}

export const listStages = query({
  args: {},
  handler: async (ctx) => {
    const stages = await ctx.db.query("stages").order("desc").collect();
    return await Promise.all(
      stages.map(async (stage) => {
        const [room, participants, egressJobs, ingressEndpoints] = await Promise.all([
          livekit.getRoom(ctx, { name: stage.roomName }),
          livekit.listParticipantsByRoom(ctx, { roomName: stage.roomName }),
          livekit.listEgressByRoom(ctx, { roomName: stage.roomName }),
          livekit.listIngressByRoom(ctx, { roomName: stage.roomName }),
        ]);
        return {
          ...stage,
          room,
          participants: participants.filter((p) => isRealSpeaker(p.identity)),
          egressJobs,
          ingressEndpoints,
        };
      }),
    );
  },
});

// ─── Broadcast (egress): record + simultaneously restream out ─────────────

// A single restream-out destination for the whole demo, configured once via
// `npx convex env set RESTREAM_RTMP_URL rtmp://...`. Good enough to prove
// the pattern; a real multi-tenant version would store one per stage.
export const startBroadcast = action({
  args: { roomName: v.string() },
  handler: async (ctx, args) => {
    // LiveKit Cloud auto-closes a room once it has been empty for its
    // emptyTimeout window. A stage that was created but never joined (no
    // participant, no ingress) will have already been torn down on
    // LiveKit's side by the time someone clicks "Start broadcast", and
    // RoomCompositeEgress 404s against a room that doesn't exist.
    // CreateRoom is idempotent — it returns the existing room unchanged if
    // one is already live, so this just guarantees egress has a room to
    // composite.
    await livekit.createRoom(ctx, { name: args.roomName });

    const restreamUrl = process.env.RESTREAM_RTMP_URL;
    // LiveKit Cloud has no default storage - file egress only resolves once
    // the project has its own S3/GCS/Azure bucket configured in the Cloud
    // dashboard, and StartRoomCompositeEgress rejects a request with no
    // usable output at all. Recording is opt-in via RECORDING_ENABLED (set
    // it only after configuring that storage) so a restream-only setup
    // (RESTREAM_RTMP_URL alone) still works without hitting that error.
    const recordingEnabled = process.env.RECORDING_ENABLED === "true";

    if (!restreamUrl && !recordingEnabled) {
      throw new Error(
        "No egress output configured. Set RESTREAM_RTMP_URL to a real RTMP destination, " +
          "or configure cloud storage in the LiveKit Cloud dashboard and set RECORDING_ENABLED=true.",
      );
    }

    return await livekit.startRoomCompositeEgress(ctx, {
      roomName: args.roomName,
      filepath: recordingEnabled ? `recordings/${args.roomName}-{time}.mp4` : undefined,
      streamUrls: restreamUrl ? [restreamUrl] : undefined,
    });
  },
});

export const stopBroadcast = action({
  args: { egressId: v.string() },
  handler: async (ctx, args) => {
    return await livekit.stopEgress(ctx, args);
  },
});

// ─── Control-room viewer: watch a stage's live feed in the browser ────────

// Mints a subscribe-only token so the control room UI can render the room's
// actual video/audio, not just its metadata. "viewer-" identities are
// filtered out of the activity feed (see convex/history.ts) since they're
// control-room observers, not speakers — and out of the stage grid's own
// live participant count for the same reason.
export const getViewerToken = action({
  args: { roomName: v.string() },
  handler: async (_ctx, args) => {
    // Unlike createRoom/startRoomCompositeEgress, minting a token touches
    // no database, so it needs no ctx.
    return await livekit.createRoomToken({
      roomName: args.roomName,
      identity: `viewer-${crypto.randomUUID()}`,
      canPublish: false,
      canSubscribe: true,
      // Generous TTL — this token only gates the initial connection, and a
      // control-room viewer may reasonably keep a stage open for a while.
      ttlSeconds: 4 * 60 * 60,
    });
  },
});

// ─── Demo broadcaster: publish a synthetic feed straight from the browser ──

// Mints a publish-only token so a visitor's own browser tab can act as an
// encoder — no OBS, no ffmpeg, no server-side process to keep alive. Used
// by the "Simulate a live broadcast" button, which captures a canvas
// animation and a tone as real media tracks and publishes them here (see
// src/lib/syntheticMedia.ts and src/components/DemoBroadcaster.tsx).
// "demo-broadcaster-" identities are filtered out of live counts and the
// activity feed the same way "viewer-" and "EG_" ones are.
export const getPublisherToken = action({
  args: { roomName: v.string(), identity: v.string() },
  handler: async (_ctx, args) => {
    return await livekit.createRoomToken({
      roomName: args.roomName,
      identity: args.identity,
      canPublish: true,
      canSubscribe: false,
    });
  },
});

// ─── Stage-manager agent: dead-air alerts ──────────────────────────────────

// Called by the stage-manager agent worker (agent/src/index.ts), which
// transcribes every real speaker's audio and watches for silence. Surfaced
// directly on the stage card so a producer sees a stage has gone quiet
// before a viewer would have to tell them.
export const reportDeadAir = mutation({
  args: { roomName: v.string(), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stage = await ctx.db
      .query("stages")
      .withIndex("by_roomName", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!stage) return null;
    await ctx.db.patch(stage._id, { deadAirSince: args.active ? Date.now() : undefined });
    return null;
  },
});

// ─── Speaker ingress: bring an external encoder into a stage ──────────────

export const createSpeakerIngress = action({
  args: {
    roomName: v.string(),
    participantIdentity: v.string(),
    inputType: v.union(v.literal("rtmp"), v.literal("whip"), v.literal("url")),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await livekit.createIngress(ctx, {
      inputType: args.inputType,
      name: `${args.roomName}-${args.participantIdentity}`,
      roomName: args.roomName,
      participantIdentity: args.participantIdentity,
      participantName: args.participantIdentity,
      url: args.url,
    });
  },
});

export const deleteSpeakerIngress = action({
  args: { ingressId: v.string() },
  handler: async (ctx, args) => {
    await livekit.deleteIngress(ctx, args);
    return null;
  },
});
