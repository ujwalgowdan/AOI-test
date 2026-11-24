import { LogOut } from "lucide-react";

import { Avatar } from "@/components/console";
import { AdminGate } from "@/components/settings/AdminGate";
import { EmployeesCard } from "@/components/settings/EmployeesCard";
import { InspectorsCard } from "@/components/settings/InspectorsCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STATION } from "@/lib/console";
import { useSessionStore } from "@/store/session";

export default function Settings() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3">
      <div className="pane-h" style={{ border: "none", padding: "4px 4px 0" }}>
        <span className="picon">◆</span>
        <h2 className="text-xs font-bold uppercase tracking-[0.06em]">Admin</h2>
        <span className="rt">People who run and verify inspections</span>
      </div>
      <AdminGate>
        <div className="grid gap-4 lg:grid-cols-2">
          <EmployeesCard />
          <InspectorsCard />
          <StationCard />
          <AdminCard />
        </div>
      </AdminGate>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-xs">
      <dt className="text-[var(--faint)]">{label}</dt>
      <dd className="text-right font-semibold text-[var(--ink)]">{children}</dd>
    </div>
  );
}

function StationCard() {
  const unit = useSessionStore((s) => s.selectedUnit);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <Card className="rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Station</h3>
      <dl className="mt-1 divide-y divide-[var(--line)]">
        <Row label="Unit">{unit}</Row>
        <Row label="Line / station">
          {STATION.line} · {STATION.name}
        </Row>
        <Row label="Camera">Selected per session on the Dashboard</Row>
        <Row label="Shift">
          {STATION.shift} · {today}
        </Row>
        <Row label="Detection target">{STATION.target}</Row>
      </dl>
    </Card>
  );
}

function AdminCard() {
  const setAdminToken = useSessionStore((s) => s.setAdminToken);
  return (
    <Card className="rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Admin</h3>
      <dl className="mt-1 divide-y divide-[var(--line)]">
        <Row label="Signed in as">
          <span className="inline-flex items-center gap-2">
            <Avatar name="Admin" /> Admin
          </span>
        </Row>
        <Row label="Access">Dashboard · Reports · Admin</Row>
      </dl>
      <Button
        variant="outline"
        className="mt-3 w-full border-fail/40 text-fail hover:bg-[var(--red-fill)]"
        onClick={() => setAdminToken(null)}
      >
        <LogOut className="h-4 w-4" /> Sign out (admin)
      </Button>
    </Card>
  );
}
