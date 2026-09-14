import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { Tone } from "../lib/format";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="card">
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} />;
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary",
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" }) {
  const classes = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...props} />;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  good: "badge-good",
  live: "badge-live",
  pending: "badge-pending",
  bad: "badge-bad",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  return <span className={`status-dot ${tone === "neutral" ? "" : tone}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
