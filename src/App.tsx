import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Card, Field, TextInput, Button, Empty } from "./components/ui";
import { StageCard } from "./components/StageCard";
import { HistoryView } from "./components/HistoryView";
import { DemoBroadcaster } from "./components/DemoBroadcaster";

function CreateStageForm() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const createStage = useAction(api.stages.createStage);

  async function place() {
    await createStage({ roomName, displayName: displayName || roomName });
    setRoomName("");
    setDisplayName("");
  }

  return (
    <Card title="New stage">
      <div className="field-row">
        <Field label="Room name">
          <TextInput
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="main-stage"
          />
        </Field>
        <Field label="Display name (optional)">
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Main Stage"
          />
        </Field>
      </div>
      <Button variant="primary" disabled={!roomName} onClick={() => void place()}>
        Create stage
      </Button>
    </Card>
  );
}

export default function App() {
  const stages = useQuery(api.stages.listStages, {});
  const liveCount = stages?.filter((s) => s.room?.status === "started").length ?? 0;
  const [tab, setTab] = useState<"stages" | "history">("stages");

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">
          <span className="mark" />
          Patchbay
        </span>
        <span className="topbar-stats">
          <span>
            stages: <b>{stages ? stages.length : "…"}</b>
          </span>
          <span className="live-count">
            live: <b>{stages ? liveCount : "…"}</b>
          </span>
        </span>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <span className="eyebrow">built on convex-livekit</span>
          <h1>
            Run every stage of the event from <span className="hl">one control room</span>.
          </h1>
          <p>
            Bring speakers in over RTMP or WHIP, record and restream every stage at once, and
            watch room, participant, and broadcast state update live — no polling, no refresh.
          </p>
        </div>
      </section>

      <main className="main">
        <div className="tabs">
          <button className={`tab ${tab === "stages" ? "active" : ""}`} onClick={() => setTab("stages")}>
            Stages
          </button>
          <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
            History
          </button>
        </div>

        {tab === "stages" ? (
          <>
            <DemoBroadcaster />

            <CreateStageForm />

            <div className="section-head" style={{ marginTop: "2rem" }}>
              <h2>Stages</h2>
              <span className="count">{stages ? `${stages.length} total` : ""}</span>
            </div>

            {stages === undefined ? null : stages.length === 0 ? (
              <Empty>No stages yet — create one above to bring it live.</Empty>
            ) : (
              <div className="stage-grid">
                {stages.map((stage) => (
                  <StageCard key={stage._id} stage={stage} />
                ))}
              </div>
            )}
          </>
        ) : (
          <HistoryView />
        )}
      </main>
    </div>
  );
}
