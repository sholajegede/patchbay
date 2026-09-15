import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Badge, StatusDot, Field, TextInput, Stat } from "./ui";
import { StageVideo } from "./StageVideo";
import { relativeTime, egressStatusTone, ingressStateTone, isEgressLive } from "../lib/format";

type InputType = "rtmp" | "whip" | "url";

type Stage = {
  _id: string;
  roomName: string;
  displayName: string;
  room: { status: "started" | "finished"; numParticipants?: number } | null;
  createdAt: number;
  participants: { identity: string; state: "joined" | "left" }[];
  egressJobs: { egressId: string; status: string }[];
  ingressEndpoints: {
    ingressId: string;
    participantIdentity: string;
    inputType: string;
    state?: string;
  }[];
};

function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // Convex wraps the thrown server error in a lot of stack/request-id
  // boilerplate — the actual message is the first line.
  return err.message.split("\n")[0];
}

export function StageCard({ stage }: { stage: Stage }) {
  const [managingIngress, setManagingIngress] = useState(false);
  const [identity, setIdentity] = useState("");
  const [inputType, setInputType] = useState<InputType>("rtmp");
  const [created, setCreated] = useState<{ ingressId: string; url?: string; streamKey?: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const startBroadcast = useAction(api.stages.startBroadcast);
  const stopBroadcast = useAction(api.stages.stopBroadcast);
  const createSpeakerIngress = useAction(api.stages.createSpeakerIngress);
  const deleteSpeakerIngress = useAction(api.stages.deleteSpeakerIngress);
  const deleteStage = useAction(api.stages.deleteStage);

  const liveEgress = stage.egressJobs.find((e) => isEgressLive(e.status));
  const isLive = stage.room?.status === "started";
  const joinedCount = stage.participants.filter((p) => p.state === "joined").length;

  async function run<T>(fn: () => Promise<T>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function addSpeaker() {
    await run(async () => {
      const result = await createSpeakerIngress({
        roomName: stage.roomName,
        participantIdentity: identity,
        inputType,
      });
      setCreated(result);
      setIdentity("");
    });
  }

  return (
    <div className="stage-card" data-live={Boolean(liveEgress)}>
      <div className="stage-head">
        <span className="stage-name">
          <StatusDot tone={isLive ? "good" : "neutral"} />
          <span>{stage.displayName}</span>
        </span>
        {liveEgress ? <Badge tone="live">on air</Badge> : <Badge>{isLive ? "open" : "idle"}</Badge>}
      </div>

      {isLive && <StageVideo roomName={stage.roomName} />}

      <div className="stage-stats">
        <Stat label="Live" value={joinedCount} />
        <Stat label="Ingress" value={stage.ingressEndpoints.length} />
        <Stat label="Age" value={relativeTime(stage.createdAt)} />
      </div>

      {error && (
        <div className="callout callout-bad">
          {error}
        </div>
      )}

      <div className="stage-section">
        <span className="stage-section-label">Broadcast</span>
        <div className="btn-row">
          {liveEgress ? (
            <>
              <Badge tone={egressStatusTone(liveEgress.status)}>{liveEgress.status}</Badge>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => void run(() => stopBroadcast({ egressId: liveEgress.egressId }))}
              >
                Stop broadcast
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => void run(() => startBroadcast({ roomName: stage.roomName }))}
            >
              Start broadcast
            </Button>
          )}
        </div>
      </div>

      <div className="stage-section">
        <span className="stage-section-label">Speaker ingress</span>
        {stage.ingressEndpoints.map((ingress) => (
          <div className="ingress-row" key={ingress.ingressId}>
            <span className="ingress-identity">
              <StatusDot tone={ingressStateTone(ingress.state)} /> {ingress.participantIdentity}
            </span>
            <span className="btn-row">
              <Badge>{ingress.inputType}</Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  void run(() => deleteSpeakerIngress({ ingressId: ingress.ingressId }))
                }
              >
                Remove
              </Button>
            </span>
          </div>
        ))}

        {created && (
          <div className="callout callout-good">
            <div>
              Created <code>{created.ingressId}</code> — copy these now, the stream key is shown
              only once:
            </div>
            {created.url && (
              <div>
                url: <code>{created.url}</code>
              </div>
            )}
            {created.streamKey && (
              <div>
                key: <code>{created.streamKey}</code>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {managingIngress ? (
          <div className="field-row" style={{ marginTop: "0.7rem" }}>
            <Field label="Identity">
              <TextInput
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="obs-encoder"
              />
            </Field>
            <Field label="Input">
              <select value={inputType} onChange={(e) => setInputType(e.target.value as InputType)}>
                <option value="rtmp">RTMP</option>
                <option value="whip">WHIP</option>
                <option value="url">URL</option>
              </select>
            </Field>
            <Button
              variant="secondary"
              size="sm"
              disabled={!identity || pending}
              onClick={() => void addSpeaker()}
            >
              Add
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setManagingIngress(true)}>
            + Add speaker feed
          </Button>
        )}
      </div>

      <div className="btn-row">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => void run(() => deleteStage({ roomName: stage.roomName }))}
        >
          Delete stage
        </Button>
      </div>
    </div>
  );
}
