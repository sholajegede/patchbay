import { httpRouter } from "convex/server";
import { livekit } from "./lib/livekit";

const http = httpRouter();

http.route({
  path: "/webhooks/livekit",
  method: "POST",
  handler: livekit.webhookHandler,
});

export default http;
