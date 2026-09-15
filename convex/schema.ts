import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Patchbay's own tables sit alongside convex-livekit's component tables
// (rooms, participants, tracks, egress, ingress, webhookEvents), which live
// in the component's isolated schema and need no declaration here.
//
// A "stage" is just a named LiveKit room that Patchbay's control room knows
// about — the component tracks everything that actually happens inside it
// (participants, tracks, egress, ingress) reactively via webhooks.
export default defineSchema({
  stages: defineTable({
    roomName: v.string(),
    displayName: v.string(),
    createdAt: v.number(),
    // Set by the stage-manager agent worker (see agent/src/index.ts) when a
    // live stage's real speakers have gone quiet for too long; cleared the
    // moment someone speaks again. Absent when there's nothing to flag.
    deadAirSince: v.optional(v.number()),
  }).index("by_roomName", ["roomName"]),
});
