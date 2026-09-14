import { LiveKit } from "convex-livekit";
import { components } from "../_generated/api";

export const livekit = new LiveKit(components.convexLivekit, {
  apiKey: process.env.LIVEKIT_API_KEY!,
  apiSecret: process.env.LIVEKIT_API_SECRET!,
  host: process.env.LIVEKIT_HOST!,
});
