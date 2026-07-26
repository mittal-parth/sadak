"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type DataPacket_Kind,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";

/**
 * The live conversation: an open mic into a LiveKit room where the NPC is a
 * Python worker (../agent.py) running Saaras → sarvam-105b → Bulbul.
 *
 * Everything the player and the NPC say arrives here as data packets on the
 * `sadak` topic, published by the agent. Mission grading arrives the same way,
 * off the critical path, so the spoken line is never held up by it.
 *
 * When LiveKit is not configured, or the worker is not running, this settles
 * into `unavailable` and Dialogue falls back to push-to-talk over REST.
 */

export type LiveStatus =
  | "connecting"
  | "live"
  /** No LiveKit config, no worker, or the room dropped: use the REST path. */
  | "unavailable";

/** The NPC's own idea of what it is doing, for the status line. */
export type NpcState = "idle" | "listening" | "thinking" | "speaking";

export type LiveTurn = { role: "user" | "assistant"; content: string };

type Packet =
  | { t: "line"; role: "user" | "assistant"; text: string }
  | { t: "partial"; text: string }
  | { t: "state"; state: NpcState }
  | { t: "grade"; missionComplete: boolean; anger: number }
  | { t: "error"; message: string };

const TOPIC = "sadak";
/** Text typed into the box is handed to the agent on LiveKit's chat topic. */
const CHAT_TOPIC = "lk.chat";
/** How long to wait for the worker to pick up the room before giving up on it. */
const AGENT_TIMEOUT_MS = 12000;

export function useLiveVoice(opts: {
  districtId: string;
  npcId: string;
  clues: string[];
  onGrade: (grade: { missionComplete: boolean; anger: number }) => void;
}) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [history, setHistory] = useState<LiveTurn[]>([]);
  const [partial, setPartial] = useState("");
  const [npcState, setNpcState] = useState<NpcState>("idle");
  const [muted, setMuted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  // The grade callback changes identity every render; the effect must not.
  const gradeRef = useRef(opts.onGrade);
  gradeRef.current = opts.onGrade;

  const { districtId, npcId } = opts;
  // Clues are read once, when the room is created: they gate who will talk to
  // you, and they cannot change mid-conversation.
  const cluesRef = useRef(opts.clues);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    const attached: HTMLMediaElement[] = [];
    let agentTimer: ReturnType<typeof setTimeout> | null = null;

    const giveUp = (message: string | null) => {
      if (cancelled) return;
      setStatus("unavailable");
      if (message) setError(message);
    };

    /** Nudges blocked autoplay back to life on the next thing the player does. */
    const retryAudio = () => {
      room.startAudio().catch(() => {});
    };

    const onData = (
      payload: Uint8Array,
      _p?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (topic !== TOPIC) return;
      let msg: Packet;
      try {
        msg = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }

      switch (msg.t) {
        case "line": {
          const text = msg.text.trim();
          if (!text) return;
          setPartial("");
          setHistory((h) =>
            // The agent re-sends nothing, but a reconnect could: never double up
            // the same line twice in a row.
            h.length && h[h.length - 1].role === msg.role && h[h.length - 1].content === text
              ? h
              : [...h, { role: msg.role, content: text }]
          );
          return;
        }
        case "partial":
          setPartial(msg.text);
          return;
        case "state":
          setNpcState(msg.state);
          return;
        case "grade":
          gradeRef.current(msg);
          return;
        case "error":
          setError(msg.message);
          return;
      }
    };

    const onTrack = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = (track as RemoteAudioTrack).attach();
      el.autoplay = true;
      el.style.display = "none";
      document.body.appendChild(el);
      attached.push(el);
    };

    const onParticipant = (p: RemoteParticipant) => {
      if (!p.isAgent || cancelled) return;
      if (agentTimer) clearTimeout(agentTimer);
      agentTimer = null;
      setStatus("live");
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.TrackSubscribed, onTrack);
    room.on(RoomEvent.ParticipantConnected, onParticipant);
    room.on(RoomEvent.Disconnected, () => giveUp(null));

    (async () => {
      let cfg: { url: string; token: string };
      try {
        const res = await fetch("/api/voice/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ districtId, npcId, clues: cluesRef.current }),
        });
        const json = await res.json();
        if (!res.ok) {
          // 503 is the ordinary "not configured" case and needs no scary banner.
          giveUp(res.status === 503 ? null : (json.error ?? null));
          return;
        }
        cfg = json;
      } catch {
        giveUp(null);
        return;
      }

      if (cancelled) return;

      try {
        await room.connect(cfg.url, cfg.token);
      } catch {
        giveUp(null);
        return;
      }
      if (cancelled) {
        room.disconnect();
        return;
      }
      roomRef.current = room;

      // Autoplay policy: the dialogue only opens on a keypress, so this
      // normally resolves straight away. If the browser still refuses, the
      // NPC would be mute with no way back, so try again on the next thing
      // the player does.
      room.startAudio().catch(() => {});
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room.canPlaybackAudio) return;
        document.addEventListener("pointerdown", retryAudio, { once: true });
        document.addEventListener("keydown", retryAudio, { once: true });
      });

      // The worker may already be in the room, in which case no event fires.
      const present = [...room.remoteParticipants.values()].some((p) => p.isAgent);
      if (present) setStatus("live");
      else {
        agentTimer = setTimeout(
          () => giveUp(null),
          AGENT_TIMEOUT_MS
        );
      }

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        // Voice is the point, but a refused mic is not fatal: the text box and
        // the phrasebook still carry the conversation.
        if (!cancelled) {
          setMicDenied(true);
          setError("Microphone access denied, type instead.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (agentTimer) clearTimeout(agentTimer);
      document.removeEventListener("pointerdown", retryAudio);
      document.removeEventListener("keydown", retryAudio);
      attached.forEach((el) => {
        el.remove();
      });
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    };
  }, [districtId, npcId]);

  const sendText = useCallback((text: string) => {
    const room = roomRef.current;
    const clean = text.trim();
    if (!room || !clean || room.state !== ConnectionState.Connected) return false;
    // The user bubble comes back from the agent, so nothing is added here: it
    // keeps one ordering for spoken and typed turns alike.
    room.localParticipant.sendText(clean, { topic: CHAT_TOPIC }).catch(() => {
      setError("Could not reach the NPC.");
    });
    return true;
  }, []);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room || micDenied) return;
    setMuted((m) => {
      room.localParticipant.setMicrophoneEnabled(m).catch(() => {});
      return !m;
    });
  }, [micDenied]);

  return {
    status,
    history,
    partial,
    npcState,
    muted,
    micDenied,
    error,
    setError,
    sendText,
    toggleMute,
  };
}
