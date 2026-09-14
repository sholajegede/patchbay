// Stage-manager agent — placeholder.
//
// Subscribes to each stage room's audio, watches for dead air / flagged
// content via STT, and calls back into Convex (mutePublishedTrack,
// stopEgress) as tools when it needs to act. Real worker logic lands in a
// follow-up pass; this proves the process boots against the LiveKit Agents
// framework.
import { fileURLToPath } from "node:url";
import { type JobContext, WorkerOptions, cli, defineAgent } from "@livekit/agents";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log("patchbay stage-manager agent connected to room:", ctx.room.name);
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
