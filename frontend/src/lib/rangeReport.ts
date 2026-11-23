import { toast } from "sonner";

import { HttpError, api } from "@/api/client";
import { useSessionStore } from "@/store/session";

/** The Reports page's range-PDF download (POST /api/reports/range/generate),
 *  shared so "Export daily report" runs exactly the same flow: same validation,
 *  admin token, file save, success/error toasts and busy flag. */
export async function downloadRangePdf(
  start: string,
  end: string,
  setBusy: (busy: boolean) => void,
): Promise<void> {
  if (!start || !end) {
    toast.error("Pick both a start and end date / time");
    return;
  }
  if (start > end) {
    toast.error("Start must be on or before end");
    return;
  }
  setBusy(true);
  try {
    const { blob, filename } = await api.generateRangePdf(
      start,
      end,
      useSessionStore.getState().adminToken,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  } catch (err) {
    const msg =
      err instanceof HttpError ? err.message : err instanceof Error ? err.message : String(err);
    toast.error(msg);
  } finally {
    setBusy(false);
  }
}

const STATION_TZ = "Asia/Kolkata";

/** Today's whole day at the station (Asia/Kolkata), in the `YYYY-MM-DDTHH:MM`
 *  form and 00:00-23:59 bounds that the Reports "Today" preset sends. */
export function stationDayBounds(now = new Date()): { start: string; end: string } {
  // en-CA formats as YYYY-MM-DD.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { start: `${day}T00:00`, end: `${day}T23:59` };
}
