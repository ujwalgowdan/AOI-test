from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.deps import station_mode, station_token_ok

from app.services.session_manager import sessions

router = APIRouter(tags=["ws"])


@router.websocket("/ws/session/{sid}")
async def session_socket(websocket: WebSocket, sid: str) -> None:
    # Browsers can't set WS headers, so the station token rides as ?station_token=.
    if station_mode() and not station_token_ok(websocket.query_params.get("station_token")):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    session = sessions.get(sid)
    if not session:
        await websocket.send_json({"type": "error", "message": "Unknown session"})
        await websocket.close()
        return

    q = sessions.subscribe(sid)
    try:
        # Initial snapshot so the client doesn't wait for the next capture.
        await websocket.send_json({
            "type": "counts",
            "ok_count": session.ok_count,
            "not_ok_count": session.not_ok_count,
            "last_result": session.last_result,
            "last_image_url": session.last_image_url,
        })

        while True:
            recv_task = asyncio.create_task(websocket.receive_text())
            push_task = asyncio.create_task(q.get())
            done, pending = await asyncio.wait(
                {recv_task, push_task}, return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()

            if recv_task in done:
                # Client liveness ping or close.
                if recv_task.exception() is not None:
                    raise recv_task.exception()  # type: ignore[misc]
                msg = recv_task.result()
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})

            if push_task in done:
                payload = push_task.result()
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    finally:
        sessions.unsubscribe(sid, q)
