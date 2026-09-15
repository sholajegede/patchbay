import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, Stat, Badge, StatusDot, Empty } from "./ui";
import { relativeTime, formatDuration, egressStatusTone } from "../lib/format";

export function HistoryView() {
  const overview = useQuery(api.history.getOverview, {});
  const broadcasts = useQuery(api.history.listBroadcasts, { limit: 20 });
  const activity = useQuery(api.history.listActivity, { limit: 40 });

  return (
    <div>
      <div className="stats-row">
        <Stat label="Stages" value={overview ? overview.roomCount : "…"} />
        <Stat label="Live now" value={overview ? overview.liveRoomCount : "…"} />
        <Stat label="Watching" value={overview ? overview.participantCount : "…"} />
        <Stat label="Broadcasts" value={overview ? overview.egressCount : "…"} />
        <Stat label="Speaker feeds" value={overview ? overview.ingressCount : "…"} />
        <Stat label="Events logged" value={overview ? overview.webhookEventCount : "…"} />
      </div>

      <Card title="Broadcast history">
        {broadcasts === undefined ? null : broadcasts.length === 0 ? (
          <Empty>No broadcasts yet — start one from the Stages tab.</Empty>
        ) : (
          broadcasts.map((job) => (
            <div className="history-row" key={job.egressId}>
              <div className="history-row-main">
                <StatusDot tone={egressStatusTone(job.status)} />
                <span>{job.displayName}</span>
                <Badge tone={egressStatusTone(job.status)}>{job.status}</Badge>
              </div>
              <span className="history-time">
                {relativeTime(job.startedAt ?? job.updatedAt)}
                {job.startedAt && job.endedAt ? ` · ${formatDuration(job.endedAt - job.startedAt)}` : ""}
              </span>
            </div>
          ))
        )}
      </Card>

      <Card title="Activity">
        {activity === undefined ? null : activity.length === 0 ? (
          <Empty>Nothing has happened yet — create a stage to get started.</Empty>
        ) : (
          activity.map((event) => (
            <div className="history-row" key={event.id}>
              <div className="history-row-main">
                <StatusDot tone={event.tone} />
                <span>{event.summary}</span>
              </div>
              <span className="history-time">{relativeTime(event.receivedAt)}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
