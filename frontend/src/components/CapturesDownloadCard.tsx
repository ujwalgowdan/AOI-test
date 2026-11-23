import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HttpError, api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { localDate } from "@/lib/console";
import { useSessionStore } from "@/store/session";

type ResultFilter = "all" | "OK" | "NOT OK";

interface Props {
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}

export function CapturesDownloadCard({ start, end, onStart: setStart, onEnd: setEnd }: Props) {
  const { adminToken, setAdminToken } = useSessionStore();
  const [result, setResult] = useState<ResultFilter>("all");
  const [downloading, setDownloading] = useState(false);

  const onDownload = async () => {
    if (!adminToken) {
      toast.error("Sign in on the Admin page to download captures");
      return;
    }
    if (!start || !end) {
      toast.error("Pick a start and end date");
      return;
    }
    if (start > end) {
      toast.error("Start date must be on or before end date");
      return;
    }
    setDownloading(true);
    try {
      const { blob, filename } = await api.downloadCaptures(start, end, result, adminToken);
      // Browsers won't trigger a Save dialog directly from a fetch() —
      // the standard pattern is blob → object URL → hidden <a click>.
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
      if (err instanceof HttpError) {
        if (err.status === 401 || err.status === 403) {
          setAdminToken(null);
          toast.error("Admin session expired — sign in under Settings");
          return;
        }
        if (err.status === 413) {
          toast.error(err.message || "Too many captures — narrow the date range");
          return;
        }
      }
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  const buttonDisabled = !adminToken || downloading || !start || !end;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-4 w-4" /> Captured images
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          Bundle a date range of captured JPEGs (plus a <code>manifest.csv</code>) into a single
          ZIP. The manifest lists the timestamp, operator, inspector, result, and detected colour
          order for every capture in the range.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Start date
            </span>
            <Input
              type="date"
              value={start}
              max={end || undefined}
              onChange={(e) => setStart(e.target.value)}
              disabled={downloading}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              End date
            </span>
            <Input
              type="date"
              value={end}
              min={start || undefined}
              max={localDate(new Date())}
              onChange={(e) => setEnd(e.target.value)}
              disabled={downloading}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
              Result
            </span>
            <NativeSelect
              value={result}
              onChange={(v) => setResult(v as ResultFilter)}
              disabled={downloading}
              options={[
                { id: "all", label: "All" },
                { id: "OK", label: "OK only" },
                { id: "NOT OK", label: "NOT OK only" },
              ]}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!adminToken && (
            <p className="mr-auto text-xs text-slate-500">
              Sign in on the Admin page to enable downloads.
            </p>
          )}
          <Button
            onClick={onDownload}
            disabled={buttonDisabled}
            title={adminToken ? "" : "Sign in on the Admin page to enable"}
          >
            <Download className="mr-1 h-4 w-4" />
            {downloading ? "Preparing ZIP…" : "Download ZIP"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
