"""Mint LiveKit access tokens for the browser client."""

from __future__ import annotations

import json
import os

from aiohttp import web
from livekit.api import AccessToken, VideoGrants


async def token_handler(request: web.Request) -> web.Response:
    room = request.query.get("room")
    npc = request.query.get("npc", "")
    if not room:
        return web.json_response({"error": "room required"}, status=400)

    url = os.environ.get("LIVEKIT_URL", "")
    key = os.environ.get("LIVEKIT_API_KEY", "")
    secret = os.environ.get("LIVEKIT_API_SECRET", "")
    if not url or not key or not secret:
        return web.json_response({"error": "LiveKit env not configured"}, status=500)

    identity = f"player-{os.urandom(4).hex()}"
    token = (
        AccessToken(key, secret)
        .with_identity(identity)
        .with_name("Learner")
        .with_grants(VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .with_attributes({"npc": npc})
        .to_jwt()
    )
    return web.json_response({"token": token, "url": url})


def main() -> None:
    app = web.Application()
    app.router.add_get("/api/token", token_handler)
    web.run_app(app, host="127.0.0.1", port=8787)


if __name__ == "__main__":
    main()
