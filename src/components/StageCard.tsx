import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Badge, StatusDot, Field, TextInput, Stat } from "./ui";
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

export function StageCard({ stage }: { stage: Stage }) {
  const [managingIngress, setManagingIngress] = useState(false);
  const [identity, setIdentity] = useState("");
  const [inputType, setInputType] = useState<InputType>("rtmp");

  const startBroadcast = useAction(api.stages.startBroadcast);
  const stopBroadcast = useAction(api.stages.stopBroadcast);
  const createSpeakerIngress = useAction(api.stages.createSpeakerIngress);
  const deleteSpeakerIngress = useAction(api.stages.deleteSpeakerIngress);
  const deleteStage = useAction(api.stages.deleteStage);

  const liveEgress = stage.egressJobs.find((e) => isEgressLive(e.status));
  const isLive = stage.room?.status === "started";
  const joinedCount = stage.participants.filter((p) => p.state === "joined").length;

  async function addSpeaker() {
    await createSpeakerIngress({ roomName: stage.roomName, participantIdentity: identity, inputType });
    setIdentity("");
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

      <div className="stage-stats">
        <Stat label="Live" value={joinedCount} />
        <Stat label="Ingress" value={stage.ingressEndpoints.length} />
        <Stat label="Age" value={relativeTime(stage.createdAt)} />
      </div>

      <div className="stage-section">
        <span className="stage-section-label">Broadcast</span>
        <div className="btn-row">
          {liveEgress ? (
            <>
              <Badge tone={egressStatusTone(liveEgress.status)}>{liveEgress.status}</Badge>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void stopBroadcast({ egressId: liveEgress.egressId })}
              >
                Stop broadcast
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void startBroadcast({ roomName: stage.roomName })}
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
                onClick={() => void deleteSpeakerIngress({ ingressId: ingress.ingressId })}
              >
                Remove
              </Button>
            </span>
          </div>
        ))}

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
            <Button variant="secondary" size="sm" disabled={!identity} onClick={() => void addSpeaker()}>
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
          onClick={() => void deleteStage({ roomName: stage.roomName })}
        >
          Delete stage
        </Button>
      </div>
    </div>
  );
}
