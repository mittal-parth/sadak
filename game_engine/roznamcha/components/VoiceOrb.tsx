"use client";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

const LABEL: Record<VoiceStatus, string> = {
  idle: "Tap to start",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Working it out",
  speaking: "Reading back — interrupt any time",
  error: "Something broke",
};

/**
 * Status is the whole affordance here. The worker needs to know, without
 * looking closely, whether it is safe to speak. "Speaking" is deliberately
 * labelled as interruptible, because interrupting is the primary mechanic.
 */
export default function VoiceOrb({
  status,
  onToggle,
  bargeInMs,
}: {
  status: VoiceStatus;
  onToggle: () => void;
  /** Last measured interrupt latency, shown as live proof it works. */
  bargeInMs?: number | null;
}) {
  const live = status === "listening";
  const talking = status === "speaking";

  return (
    <div className="orb-wrap">
      <button
        className={`orb ${status}`}
        onClick={onToggle}
        aria-label={LABEL[status]}
        aria-pressed={live}
      >
        <span className="orb-core" />
        {live && <span className="orb-ring" />}
        {talking && (
          <span className="orb-bars" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        )}
      </button>

      <p className="orb-label">{LABEL[status]}</p>

      {typeof bargeInMs === "number" && (
        <p className="orb-metric" title="Time from detecting your voice to audio stopping">
          interrupted in {bargeInMs} ms
        </p>
      )}
    </div>
  );
}
