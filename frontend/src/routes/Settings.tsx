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
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-slate-900">Admin</h2>
        <p className="text-xs text-slate-500">People who run and verify inspections</p>
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
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

function StationCard() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <Card className="rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-800">Station</h3>
      <dl className="mt-1 divide-y divide-slate-100">
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
      <h3 className="text-sm font-semibold text-slate-800">Admin</h3>
      <dl className="mt-1 divide-y divide-slate-100">
        <Row label="Signed in as">
          <span className="inline-flex items-center gap-2">
            <Avatar name="Admin" /> Admin
          </span>
        </Row>
        <Row label="Access">Dashboard · Reports · Admin</Row>
      </dl>
      <Button
        variant="outline"
        className="mt-3 w-full border-fail/40 text-fail hover:bg-red-50"
        onClick={() => setAdminToken(null)}
      >
        <LogOut className="h-4 w-4" /> Sign out (admin)
      </Button>
    </Card>
  );
}
