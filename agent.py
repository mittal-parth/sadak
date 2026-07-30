"""SADAK's voice worker.

One LiveKit room is one conversation with one NPC. The character brief, the
voice, the language and the grading rubric all arrive in the joining player's
participant metadata, minted by the game at
`game_engine/app/api/voice/token/route.ts`, so the game bible
(`game_engine/lib/game/districts.ts`) stays the only copy of the writing.

    mic → saaras:v4 → sarvam-105b → bulbul:v4 → the player's speakers

Everything said in either direction is republished to the room on the `sadak`
data topic so the browser can draw subtitles, and every NPC line kicks off a
grader pass that scores the conversation against the mission criterion without
holding up the audio.

Run `python agent.py console` with no game attached and it falls back to a
plain assistant, which is the quickest way to check keys and audio.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field

import aiohttp
from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam

load_dotenv()

logger = logging.getLogger("sadak-voice")
logger.setLevel(logging.INFO)

DATA_TOPIC = "sadak"
SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"
GRADER_MODEL = os.getenv("SARVAM_GRADER_MODEL", "sarvam-105b")
NPC_MODEL = os.getenv("SARVAM_CHAT_MODEL", "sarvam-105b")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v4")

# Used when nobody hands us a brief: `python agent.py console`, or a room opened
# by something other than the game.
FALLBACK_INSTRUCTIONS = """
You are a real-time voice assistant in a LiveKit session. The user's messages are
speech-to-text transcripts from their microphone — you can hear them through this pipeline.

Rules:
- Never say you are text-only, cannot hear the user, or lack audio/voice capability.
- Keep replies short and conversational (roughly one to three sentences unless they ask for detail).
- Reply in the same language the user uses (Hindi, English, or other Indian languages as appropriate).
- Use natural spoken phrasing; avoid markdown, bullet lists, or long paragraphs.
- If the transcript looks garbled or like background TV/noise, briefly ask them to repeat in a quiet spot.
""".strip()

FALLBACK_GREETING = (
    "Greet the user briefly in Hindi or English (match their likely language). "
    "Invite them to speak; keep it to one short sentence."
)


@dataclass
class Brief:
    """The NPC the worker is playing for this room. Mirrors `AgentBrief` in TS."""

    instructions: str = FALLBACK_INSTRUCTIONS
    greeting: str = FALLBACK_GREETING
    language: str = "hi-IN"
    speaker: str = "simran"
    name: str = "Assistant"
    #: Grader rubric. Empty means no mission to grade (console / non-game rooms).
    grader_system: str = ""
    min_user_turns: int = 2
    #: Only set for game rooms, purely for log lines.
    npc_id: str = ""

    #: The transcript the grader reads. Kept here so it is never rebuilt from the
    #: agent's chat context, which also holds the system prompt.
    transcript: list[dict[str, str]] = field(default_factory=list)

    @property
    def grades(self) -> bool:
        return bool(self.grader_system)


def parse_brief(metadata: str | None) -> Brief:
    if not metadata:
        return Brief()
    try:
        raw = json.loads(metadata)
    except json.JSONDecodeError:
        logger.warning("participant metadata was not JSON, playing the default assistant")
        return Brief()

    if not isinstance(raw, dict) or "instructions" not in raw:
        return Brief()

    voice = raw.get("voice") or {}
    grader = raw.get("grader") or {}
    npc = raw.get("npc") or {}
    district = raw.get("district") or {}

    return Brief(
        instructions=raw["instructions"],
        greeting=raw.get("greeting") or FALLBACK_GREETING,
        language=voice.get("language") or district.get("language") or "hi-IN",
        speaker=voice.get("speaker") or "simran",
        name=npc.get("name") or "NPC",
        grader_system=grader.get("system") or "",
        min_user_turns=int(grader.get("minUserTurns") or 2),
        npc_id=npc.get("id") or "",
    )


class NpcAgent(Agent):
    def __init__(self, brief: Brief) -> None:
        super().__init__(
            instructions=brief.instructions,
            # "unknown" rather than the district language on purpose: players are
            # beginners and code-switch into English mid-sentence, and pinning
            # the language makes Saaras discard the half it did not expect.
            stt=sarvam.STT(
                language="unknown",
                model="saaras:v4",
                mode="transcribe",
                flush_signal=True,
            ),
            # Thinking mode is on by default and its tokens come out of
            # max_tokens, which leaves an NPC line empty and slow.
            llm=sarvam.LLM(model=NPC_MODEL, reasoning_effort=None, temperature=0.85),
            tts=sarvam.TTS(
                target_language_code=brief.language,
                model=TTS_MODEL,
                speaker=brief.speaker,
            ),
        )
        self._brief = brief

    async def on_enter(self):
        self.session.generate_reply(instructions=self._brief.greeting)


async def publish(ctx: JobContext, payload: dict) -> None:
    """Best-effort: the subtitles are a nicety, the audio is the game."""
    try:
        await ctx.room.local_participant.publish_data(
            json.dumps(payload, ensure_ascii=False), topic=DATA_TOPIC, reliable=True
        )
    except Exception as err:  # noqa: BLE001 - a dropped packet must not end the turn
        logger.debug("could not publish %s: %s", payload.get("t"), err)


async def grade(brief: Brief, session: aiohttp.ClientSession) -> dict | None:
    """Scores the conversation so far against the mission criterion.

    Runs after the NPC has already spoken, so its latency is invisible. Returns
    None when the model is unreachable or answers with something unparseable:
    a missed grade costs the player nothing, a wrong one costs them a mission.
    """
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        return None

    lines = "\n".join(
        f"{'PLAYER' if turn['role'] == 'user' else 'NPC'}: {turn['text']}"
        for turn in brief.transcript
    )

    body = {
        "model": GRADER_MODEL,
        "messages": [
            {"role": "system", "content": brief.grader_system},
            {"role": "user", "content": f"THE CONVERSATION SO FAR\n{lines}"},
        ],
        "temperature": 0.2,
        "max_tokens": 120,
        "reasoning_effort": None,
        # json_schema makes this model pad whitespace to the token limit and
        # never close the object; json_object closes cleanly.
        "response_format": {"type": "json_object"},
    }

    try:
        async with session.post(
            SARVAM_CHAT_URL,
            headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
            json=body,
            timeout=aiohttp.ClientTimeout(total=20),
        ) as res:
            if res.status != 200:
                logger.warning("grader returned %s: %s", res.status, (await res.text())[:200])
                return None
            payload = await res.json()
    except Exception as err:  # noqa: BLE001 - grading is never worth crashing a session
        logger.warning("grader unreachable: %s", err)
        return None

    content = (payload.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        return None

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            parsed = json.loads(content[start : end + 1])
        except json.JSONDecodeError:
            return None

    anger = parsed.get("anger", 0)
    try:
        anger = max(0, min(2, int(round(float(anger)))))
    except (TypeError, ValueError):
        anger = 0

    return {"missionComplete": parsed.get("mission_complete") is True, "anger": anger}


async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # The brief rides on the player's participant metadata. Console mode has no
    # such participant, hence the timeout and the default assistant behind it.
    brief = Brief()
    try:
        participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=10)
        brief = parse_brief(participant.metadata)
    except Exception as err:  # noqa: BLE001 - console mode has no player to wait for
        logger.info("no player brief (%s), running the default assistant", type(err).__name__)

    logger.info(
        "room %s: playing %s (%s, %s)",
        ctx.room.name,
        brief.name,
        brief.npc_id or "no npc",
        brief.language,
    )

    session = AgentSession(
        turn_handling={
            "turn_detection": "stt",
            "endpointing": {"min_delay": 0.07},
        },
    )

    http = aiohttp.ClientSession()
    # One grade in flight at a time: the player can out-talk the grader, and only
    # the newest verdict matters.
    grading: asyncio.Task | None = None
    passed = False
    # Fire-and-forget publishes, held so the loop cannot collect them mid-flight.
    pending: set[asyncio.Task] = set()

    def spawn(coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        pending.add(task)
        task.add_done_callback(pending.discard)
        return task

    async def shutdown(*_):
        if grading and not grading.done():
            grading.cancel()
        for task in list(pending):
            task.cancel()
        await http.close()

    ctx.add_shutdown_callback(shutdown)

    async def run_grader() -> None:
        nonlocal passed
        verdict = await grade(brief, http)
        if verdict is None:
            return
        # A greeting must never pass a mission, the same rule the REST path uses.
        turns = sum(1 for t in brief.transcript if t["role"] == "user")
        if verdict["missionComplete"] and (turns < brief.min_user_turns or passed):
            verdict["missionComplete"] = False
        if verdict["missionComplete"]:
            passed = True
        if verdict["missionComplete"] or verdict["anger"] > 0:
            await publish(ctx, {"t": "grade", **verdict})

    def on_item(ev) -> None:
        nonlocal grading
        # Not every conversation item is speech: handoffs and tool calls come
        # through here too, and they carry neither a role nor any text.
        role = getattr(ev.item, "role", None)
        text = (getattr(ev.item, "text_content", None) or "").strip()
        if not text or role not in ("user", "assistant"):
            return

        brief.transcript.append({"role": role, "text": text})
        spawn(publish(ctx, {"t": "line", "role": role, "text": text}))

        # Grade after the NPC has answered, so the verdict covers a complete
        # exchange. The opening greeting is an assistant line with nobody to
        # judge yet, hence the user-turn test.
        spoken_to = any(t["role"] == "user" for t in brief.transcript)
        if (
            role == "assistant"
            and brief.grades
            and spoken_to
            and not passed
            and (grading is None or grading.done())
        ):
            grading = spawn(run_grader())

    def on_partial(ev) -> None:
        if not ev.is_final and ev.transcript:
            spawn(publish(ctx, {"t": "partial", "text": ev.transcript}))

    def on_state(ev) -> None:
        spawn(publish(ctx, {"t": "state", "state": ev.new_state}))

    session.on("conversation_item_added", on_item)
    session.on("user_input_transcribed", on_partial)
    session.on("agent_state_changed", on_state)

    await session.start(agent=NpcAgent(brief), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
