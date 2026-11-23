import { wsSessionUrl } from "@/api/client";
import { useSessionStore } from "@/store/session";
import { useEffect } from "react";

export function useSessionSocket(sid: string | null | undefined) {
  const applyLive = useSessionStore((s) => s.applyLive);

  useEffect(() => {
    if (!sid) return;
    const ws = new WebSocket(wsSessionUrl(sid));

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "counts") {
          applyLive({
            ok_count: msg.ok_count,
            not_ok_count: msg.not_ok_count,
            last_result: msg.last_result,
            last_image_url: msg.last_image_url,
          });
        }
      } catch {
        // ignore malformed payload
      }
    };

    // Keep the connection alive on long idle periods.
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25_000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [sid, applyLive]);
}
