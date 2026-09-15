import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { livekit } from "./lib/livekit";

type Tone = "neutral" | "good" | "live" | "pending" | "bad";

async function displayNameByRoom(ctx: QueryCtx): Promise<Map<string, string>> {
  const stages = await ctx.db.query("stages").collect();
  return new Map(stages.map((stage) => [stage.roomName, stage.displayName]));
}

// Overview counters for the dashboard's stat row — a thin pass-through to
// convex-livekit's own aggregate query, which already tracks everything the
// component sees reactively via webhooks.
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    return await livekit.getStats(ctx);
  },
});

// Recent broadcast (egress) runs, decorated with the stage's display name so
// the history view doesn't have to show raw room slugs.
export const listBroadcasts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const [egressJobs, names] = await Promise.all([
      livekit.listRecentEgress(ctx, { limit: args.limit ?? 20 }),
      displayNameByRoom(ctx),
    ]);
    return egressJobs.map((job) => ({
      ...job,
      displayName: (job.roomName && names.get(job.roomName)) || job.roomName || "Unknown stage",
    }));
  },
});

// A single chronological activity feed built from convex-livekit's own
// webhook audit log — every room/participant/track/egress/ingress event
// LiveKit has ever sent this project, turned into one readable line each.
export const listActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const [events, names] = await Promise.all([
      livekit.listRecentWebhookEvents(ctx, { limit: args.limit ?? 40 }),
      displayNameByRoom(ctx),
    ]);
    return events
      .map((event) => describeEvent(event, names))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  },
});

// LiveKit's webhook payloads are plain protojson — camelCase throughout
// (unlike its Twirp API responses, which use snake_case proto field names;
// see convex-livekit's own client for that distinction). Verified directly
// against this project's own webhookEvents rows.
function describeEvent(
  event: { _id: string; eventType: string; payload: string; receivedAt: number },
  names: Map<string, string>,
): { id: string; eventType: string; receivedAt: number; summary: string; tone: Tone } | null {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(event.payload) as Record<string, unknown>;
  } catch {
    // Malformed payload — fall through to the generic label below.
  }

  const room = data.room as Record<string, unknown> | undefined;
  const participant = data.participant as Record<string, unknown> | undefined;
  const track = data.track as Record<string, unknown> | undefined;
  const egressInfo = data.egressInfo as Record<string, unknown> | undefined;
  const ingressInfo = data.ingressInfo as Record<string, unknown> | undefined;

  const rawRoomName =
    (room?.name as string) ?? (egressInfo?.roomName as string) ?? (ingressInfo?.roomName as string);
  const stageName = rawRoomName ? names.get(rawRoomName) ?? rawRoomName : "a stage";
  const identity = (participant?.identity as string) ?? (ingressInfo?.participantIdentity as string);
  const trackType = (track?.type as string)?.toLowerCase();

  const line = (summary: string, tone: Tone) => ({
    id: event._id,
    eventType: event.eventType,
    receivedAt: event.receivedAt,
    summary,
    tone,
  });

  // RoomCompositeEgress joins the room as a hidden participant (identity
  // "EG_..."), purely to composite it — that join/leave is bookkeeping, not
  // a real speaker, and is already represented by the egress_* events below.
  if (identity?.startsWith("EG_")) {
    return null;
  }

  switch (event.eventType) {
    case "room_started":
      return line(`${stageName} went live`, "good");
    case "room_finished":
      return line(`${stageName} ended`, "neutral");
    case "participant_joined":
      return line(`${identity ?? "A participant"} joined ${stageName}`, "good");
    case "participant_left":
      return line(`${identity ?? "A participant"} left ${stageName}`, "neutral");
    case "participant_connection_aborted":
      return line(`${identity ?? "A participant"} dropped from ${stageName}`, "bad");
    case "track_published":
      return line(`${identity ?? "Someone"} published ${trackType ?? "a"} track`, "neutral");
    case "track_unpublished":
      return line(`${identity ?? "Someone"} unpublished ${trackType ?? "a"} track`, "neutral");
    case "egress_started":
      return line(`Broadcast started on ${stageName}`, "live");
    case "egress_updated":
      return line(`Broadcast status on ${stageName}: ${egressInfo?.status ?? "updated"}`, "pending");
    case "egress_ended":
      return line(
        `Broadcast ended on ${stageName}`,
        egressInfo?.status === "EGRESS_FAILED" ? "bad" : "neutral",
      );
    case "ingress_started":
      return line(`${identity ?? "A speaker feed"} started streaming into ${stageName}`, "good");
    case "ingress_ended":
      return line(`${identity ?? "A speaker feed"} stopped streaming`, "neutral");
    default:
      return line(event.eventType.replace(/_/g, " "), "neutral");
  }
}
