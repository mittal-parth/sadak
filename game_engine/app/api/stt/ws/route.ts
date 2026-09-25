import { connection } from "next/server";
import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import {
  createSttSessionState,
  handleSttClientMessage,
  teardownSttSession,
  type SttServerMsg,
} from "@/lib/stt-ws-proxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return new Response("SARVAM_API_KEY is not configured.", { status: 503 });
  }

  await connection();

  return experimental_upgradeWebSocket(
    (ws) => {
      const state = createSttSessionState();

      const send = (msg: SttServerMsg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      };

      ws.on("message", (data: WebSocketData) => {
        const raw = typeof data === "string" ? data : data.toString();
        handleSttClientMessage(raw, send, state, apiKey);
      });

      ws.on("close", () => teardownSttSession(state));
    },
    { maxPayload: 256 * 1024 }
  );
}
