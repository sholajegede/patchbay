import { query } from "./_generated/server";
import { livekit } from "./lib/livekit";

// Placeholder — proves the component is wired up. Real stage/broadcast
// actions (createStage, startBroadcast with restream-out, stopBroadcast,
// speaker ingress) land in a follow-up pass.
export const listRooms = query({
  args: {},
  handler: async (ctx) => {
    return await livekit.listRooms(ctx, {});
  },
});
