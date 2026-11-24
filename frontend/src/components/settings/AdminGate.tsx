import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";

import { HttpError, api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSessionStore } from "@/store/session";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { adminToken, setAdminToken } = useSessionStore();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.verifyAdmin(trimmed);
      setAdminToken(trimmed);
      setValue("");
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
        setError("Invalid admin password");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!adminToken) {
    return (
      <div className="flex justify-center pt-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Admin sign-in required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-[var(--ink2)]">
              Enter the admin password configured on the backend (<code>ADMIN_PASSWORD</code> in{" "}
              <code>.env</code>).
            </p>
            <Input
              type="password"
              autoFocus
              placeholder="Admin password"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? "true" : undefined}
            />
            {error && <p className="text-sm text-fail">{error}</p>}
            <Button type="submit" disabled={!value.trim() || submitting} className="w-full">
              {submitting ? "Verifying…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    );
  }

  // Sign-out lives in the Admin card (Settings) and the app footer.
  return <>{children}</>;
}
