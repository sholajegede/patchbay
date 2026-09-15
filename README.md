# Patchbay

Patchbay is a live event control room. It runs many broadcast stages at once, from one screen, on top of [convex-livekit](https://www.npmjs.com/package/convex-livekit).

## What it does

Each stage is a LiveKit room. From the control room you can:

- Create and delete stages.
- Bring a speaker in over RTMP or WHIP.
- Start and stop a broadcast. Each broadcast can record to storage and restream to an RTMP target (YouTube, Twitch) at the same time.
- Watch a stage's live video and audio in the browser, straight from LiveKit.
- Simulate a live broadcast with one click. No camera, no OBS, no server process. A visitor's own browser tab publishes a synthetic video and audio feed, so an empty app still has something live to look at.
- Read a full history of every stage: past broadcasts, and a chronological feed of every room, participant, track, egress, and ingress event LiveKit has sent.

A stage-manager agent also watches every live stage. It transcribes each real speaker's audio with Deepgram. It flags a stage the moment every real speaker on it goes quiet for too long, and clears the flag the instant someone speaks again.

Every part of the control room updates live. Convex holds the state; convex-livekit keeps it in sync with LiveKit over webhooks. No polling, no manual refresh.

## Why it exists

convex-livekit gives a Convex app rooms, participants, tracks, egress, ingress, and webhook state, all reactive out of the box. Most demos of a component like this show one room and one voice agent. Patchbay is built to prove the harder case: many rooms, many roles (viewer, speaker, broadcaster, agent), running at once, still fully reactive.

## Architecture

```
┌─────────────┐      Convex queries/actions      ┌──────────────────┐
│  React app   │ ───────────────────────────────▶ │  Convex backend   │
│ (Vite, TS)   │ ◀─────────────────────────────── │  + convex-livekit │
└─────────────┘      reactive subscriptions       └──────────────────┘
       │                                                    │
       │ WebRTC (join / publish / subscribe)                │ LiveKit Server API
       ▼                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                          LiveKit Cloud                            │
│   rooms · participants · egress (record/restream) · ingress       │
└─────────────────────────────────────────────────────────────────┘
       ▲                                                    │
       │ subscribes to real speakers' audio                 │ webhooks
       │                                                    ▼
┌─────────────────┐                                ┌──────────────────┐
│ Stage-manager    │ ── mutation: reportDeadAir ──▶ │  Convex backend   │
│ agent (Node)     │        (Deepgram STT)          │  (same as above)  │
└─────────────────┘                                └──────────────────┘
```

The frontend never talks to LiveKit directly for control actions. It calls a Convex action instead. The action calls convex-livekit, and convex-livekit calls the LiveKit Server API. The frontend does talk to LiveKit directly over WebRTC, but only to join a room, publish a track, or subscribe to one, using a token Convex minted.

## Repo layout

```
convex/
  schema.ts       stage records (roomName, displayName, deadAirSince)
  stages.ts       create/delete stages, broadcasts, tokens, dead-air reports
  history.ts      dashboard queries: overview stats, broadcasts, activity feed
  lib/livekit.ts  the convex-livekit client instance
  http.ts         the LiveKit webhook route
src/
  components/     StageCard, StageVideo, DemoBroadcaster, HistoryView, ui
  lib/            format helpers, synthetic media generator
agent/
  src/index.ts    the stage-manager agent worker (separate Node process)
```

## Prerequisites

- A [Convex](https://www.convex.dev) project.
- A [LiveKit Cloud](https://cloud.livekit.io) project, with a webhook pointed at your Convex deployment.
- A [Deepgram](https://deepgram.com) API key, for the stage-manager agent.
- Node 20 or newer.

## Setup

Install dependencies in the root and in `agent/` (two separate `package.json` files, two separate processes):

```
npm install
cd agent && npm install && cd ..
```

Copy the env file templates and fill them in:

```
cp .env.local.example .env.local
cp agent/.env.example agent/.env
```

`.env.local` holds two frontend variables, both safe to expose in the browser bundle:

- `VITE_CONVEX_URL`, set automatically by `npx convex dev` on first run.
- `VITE_LIVEKIT_URL`, your LiveKit Cloud project's WebSocket URL.

Set the Convex-side secrets with the CLI, not in a file:

```
npx convex env set LIVEKIT_API_KEY <your-key>
npx convex env set LIVEKIT_API_SECRET <your-secret>
npx convex env set LIVEKIT_HOST <your-livekit-host>
npx convex env set RESTREAM_RTMP_URL <your-restream-rtmp-url>   # optional
```

In your LiveKit Cloud project, point the webhook at `<your-convex-site-url>/webhooks/livekit` (the `VITE_CONVEX_SITE_URL` value Convex prints on first run).

`agent/.env` holds the stage-manager agent's own secrets:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
CONVEX_URL=            # your Convex deployment URL, same value as VITE_CONVEX_URL
DEEPGRAM_API_KEY=
```

## Running it

Two commands, in two terminals, start three processes (Convex, Vite, and the agent):

```
npm run dev              # frontend (Vite) + Convex backend together
cd agent && npm run dev  # the stage-manager agent worker
```

Open the printed local URL. Create a stage, or click "Simulate a live broadcast" to see one go live with no other setup.

## Deploying

Patchbay has three separate pieces to deploy. Treat production as its own LiveKit Cloud project and its own Convex deployment, kept apart from dev.

**Frontend (Vercel).** Push the repo to GitHub, then import it in Vercel. Set `VITE_CONVEX_URL` and `VITE_LIVEKIT_URL` to the production values in the Vercel project's environment variables. Vercel picks up the existing `npm run build` script with no extra config.

**Backend (Convex).** Run `npx convex deploy` to push functions and schema to a production deployment. Set the same env vars there with `npx convex env set --prod`, pointed at the production LiveKit project and RTMP target.

**LiveKit Cloud.** Create a second LiveKit Cloud project for production. Point its webhook at the production Convex site URL. Keep the dev project for local work, so a local test never touches a production room.

**Stage-manager agent.** The agent is a long-running Node worker, not a serverless function, so it needs a host that keeps a process alive: Fly.io, Render, or a small VPS all work. Build it with `npm run build` in `agent/`, then run `npm start` with the production env vars set. LiveKit Cloud dispatches a job to the worker for every room that starts, so one running instance covers every stage.

## Standing on convex-livekit

Building Patchbay found and fixed two real issues in convex-livekit itself:

- Every client action was typed against an empty schema. This broke any app with its own tables.
- The webhook payload casing was documented wrong. LiveKit sends camelCase, not snake_case.

Both fixes shipped in convex-livekit's own release history.
