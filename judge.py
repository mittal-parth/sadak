"""Async judge: scores learner turns and publishes on game.judge."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import aiohttp

logger = logging.getLogger("judge")

NPCS_PATH = Path(__file__).resolve().parent / "namma-nagara" / "src" / "lang" / "npcs.json"
SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions"


def load_npcs() -> list[dict[str, Any]]:
    with NPCS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def npc_by_id(npc_id: str) -> dict[str, Any] | None:
    for n in load_npcs():
        if n["id"] == npc_id:
            return n
    return None


def _parse_json_object(raw: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _shape(parsed: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(parsed, dict):
        return None
    lang = parsed.get("language")
    if lang not in ("hi", "en", "other"):
        lang = "other"
    try:
        intel = int(parsed.get("intelligible", 0))
    except (TypeError, ValueError):
        intel = 0
    intel = max(0, min(100, intel))
    checks = parsed.get("checks_hit")
    if not isinstance(checks, list):
        checks = []
    checks = [str(c) for c in checks]
    return {
        "language": lang,
        "intelligible": intel,
        "on_task": bool(parsed.get("on_task")),
        "checks_hit": checks,
        "task_complete": parsed.get("task_complete") is True,
        "hint": str(parsed.get("hint") or "").strip(),
    }


async def score_turn(
    *,
    npc_id: str,
    user_text: str,
    history: list[dict[str, str]],
    checks_already: list[str],
) -> dict[str, Any]:
    npc = npc_by_id(npc_id)
    if not npc:
        return {
            "language": "other",
            "intelligible": 0,
            "on_task": False,
            "checks_hit": [],
            "task_complete": False,
            "hint": "",
        }

    task = npc["task"]
    rubric = "\n".join(
        f"- {c['id']}: {c['label']} (hint: {c.get('hindi_hint', '')})"
        for c in task["checks"]
    )
    already = ", ".join(checks_already) if checks_already else "none"

    system = f"""You grade a Hindi learning game turn. Reply with ONE JSON object only.
Keys: language (hi|en|other), intelligible (0-100), on_task (bool),
checks_hit (array of rubric ids newly satisfied THIS turn only),
task_complete (bool — all rubric checks satisfied in the conversation),
hint (short Hindi phrase for the next missing check).

NPC task: {task.get("title")} — {task.get("brief")}
Rubric ids:
{rubric}
Already hit: {already}
"""

    messages = [{"role": "system", "content": system}]
    for h in history[-8:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_text})

    api_key = os.environ.get("SARVAM_API_KEY", "")
    if not api_key:
        logger.warning("SARVAM_API_KEY missing — returning neutral verdict")
        return {
            "language": "hi" if re.search(r"[\u0900-\u097F]", user_text) else "en",
            "intelligible": 70,
            "on_task": True,
            "checks_hit": [],
            "task_complete": False,
            "hint": task["checks"][0].get("hindi_hint", ""),
        }

    payload = {
        "model": "sarvam-105b",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 256,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    backoff = [0.5, 1.0, 2.0]
    last_err: Exception | None = None
    for delay in backoff:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    SARVAM_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=45)
                ) as resp:
                    body = await resp.text()
                    if resp.status >= 500:
                        raise RuntimeError(f"sarvam {resp.status}: {body[:200]}")
                    if resp.status >= 400:
                        logger.error("judge api %s: %s", resp.status, body[:300])
                        break
                    data = json.loads(body)
                    raw = data["choices"][0]["message"]["content"]
                    parsed = _parse_json_object(raw)
                    shaped = _shape(parsed) if parsed else None
                    if shaped:
                        return shaped
        except Exception as err:
            last_err = err
            logger.warning("judge attempt failed: %s", err)
            await asyncio.sleep(delay)

    logger.error("judge failed: %s", last_err)
    return {
        "language": "other",
        "intelligible": 40,
        "on_task": False,
        "checks_hit": [],
        "task_complete": False,
        "hint": "",
    }


async def publish_judge(room, verdict: dict[str, Any]) -> None:
    payload = json.dumps(verdict).encode("utf-8")
    await room.local_participant.publish_data(payload, topic="game.judge", reliable=True)
