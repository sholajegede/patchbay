import { defineApp } from "convex/server";
import convexLivekit from "convex-livekit/convex.config";

const app = defineApp();
app.use(convexLivekit);

export default app;
