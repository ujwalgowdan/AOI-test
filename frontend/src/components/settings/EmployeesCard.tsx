import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HttpError, api } from "@/api/client";
import { Avatar } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Person } from "@/lib/schemas";
import { useSessionStore } from "@/store/session";

import { PersonFormDialog } from "./PersonFormDialog";

export function EmployeesCard() {
  const { adminToken, setAdminToken } = useSessionStore();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: api.listEmployees,
  });

  const handleAdminError = (err: unknown) => {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      setAdminToken(null);
      toast.error("Admin session expired — please sign in again");
      return true;
    }
    return false;
  };

  const addMut = useMutation({
    mutationFn: (p: Person) => api.addEmployee(p, adminToken ?? ""),
    onSuccess: (created) => {
      toast.success(`Added ${created.name} (${created.id})`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      if (handleAdminError(err)) return;
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeEmployee(id, adminToken ?? ""),
    onSuccess: (_void, id) => {
      toast.success(`Removed ${id}`);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: unknown) => {
      if (handleAdminError(err)) return;
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between border-b-0 pb-0">
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-4 w-4" /> Operators
        </CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-[var(--faint)]">Loading…</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">No operators yet.</p>
        ) : (
          <Table>
            <TableHeader className="bg-transparent text-[10px] tracking-wider text-[var(--faint)]">
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.id}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Avatar name={e.name} tone="blue" />
                      {e.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-fail/40 px-2.5 text-fail hover:bg-[var(--red-fill)]"
                      aria-label={`Delete ${e.name}`}
                      onClick={() => {
                        if (confirm(`Remove ${e.name} (${e.id})?`)) removeMut.mutate(e.id);
                      }}
                      disabled={removeMut.isPending}
                    >
                      Del
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 rounded-lg border border-innotech/15 bg-innotech/5 px-3 py-2 text-[11px] text-innotech">
          Operators start sessions and capture pieces. Every capture is stamped with the operator ID
          for traceability.
        </p>
      </CardContent>
      <PersonFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add operator"
        description="ID is what the camera log records; pick something stable."
        submitting={addMut.isPending}
        onSubmit={(values) => addMut.mutate(values)}
      />
    </Card>
  );
}
