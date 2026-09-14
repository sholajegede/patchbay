import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Patchbay's own tables sit alongside convex-livekit's component tables
// (rooms, participants, tracks, egress, ingress, webhookEvents), which live
// in the component's isolated schema and need no declaration here.
export default defineSchema({
  stages: defineTable({
    roomName: v.string(),
    displayName: v.string(),
    createdAt: v.number(),
  }).index("by_roomName", ["roomName"]),
});
