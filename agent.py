import logging

from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam

load_dotenv()

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)

VOICE_AGENT_INSTRUCTIONS = """
You are a real-time voice assistant in a LiveKit session. The user's messages are
speech-to-text transcripts from their microphone — you can hear them through this pipeline.

Rules:
- Never say you are text-only, cannot hear the user, or lack audio/voice capability.
- Keep replies short and conversational (roughly one to three sentences unless they ask for detail).
- Reply in the same language the user uses (Hindi, English, or other Indian languages as appropriate).
- Use natural spoken phrasing; avoid markdown, bullet lists, or long paragraphs.
- If the transcript looks garbled or like background TV/noise, briefly ask them to repeat in a quiet spot.
""".strip()


class VoiceAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=VOICE_AGENT_INSTRUCTIONS,
            stt=sarvam.STT(
                language="unknown",
                model="saaras:v3",
                mode="transcribe",
                flush_signal=True,
            ),
            llm=sarvam.LLM(model="sarvam-105b"),
            tts=sarvam.TTS(
                target_language_code="hi-IN",
                model="bulbul:v3",
                speaker="simran",
            ),
        )

    async def on_enter(self):
        self.session.generate_reply(
            instructions=(
                "Greet the user briefly in Hindi or English (match their likely language). "
                "Invite them to speak; keep it to one short sentence."
            ),
        )


async def entrypoint(ctx: JobContext):
    logger.info(f"User connected to room: {ctx.room.name}")

    session = AgentSession(
        turn_handling={
            "turn_detection": "stt",
            "endpointing": {"min_delay": 0.07},
        },
    )
    await session.start(
        agent=VoiceAgent(),
        room=ctx.room,
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
