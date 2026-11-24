import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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

export function InspectorsCard() {
  const { adminToken, setAdminToken } = useSessionStore();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  const { data: inspectors = [], isLoading } = useQuery({
    queryKey: ["inspectors"],
    queryFn: api.listInspectors,
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
    mutationFn: (p: Person) => api.addInspector(p, adminToken ?? ""),
    onSuccess: (created) => {
      toast.success(`Added ${created.name} (${created.id})`);
      qc.invalidateQueries({ queryKey: ["inspectors"] });
      setAddOpen(false);
    },
    onError: (err: unknown) => {
      if (handleAdminError(err)) return;
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Person }) =>
      api.updateInspector(id, values, adminToken ?? ""),
    onSuccess: (updated) => {
      toast.success(`Updated ${updated.name}`);
      qc.invalidateQueries({ queryKey: ["inspectors"] });
      setEditing(null);
    },
    onError: (err: unknown) => {
      if (handleAdminError(err)) return;
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.removeInspector(id, adminToken ?? ""),
    onSuccess: (_v, id) => {
      toast.success(`Removed ${id}`);
      qc.invalidateQueries({ queryKey: ["inspectors"] });
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
          <ShieldCheck className="h-4 w-4" /> First-piece inspectors
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-[var(--faint)]">Loading…</p>
        ) : inspectors.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">No inspectors yet.</p>
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
              {inspectors.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.id}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Avatar name={i.name} tone="amber" />
                      {i.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5"
                        aria-label={`Edit ${i.name}`}
                        onClick={() => setEditing(i)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-fail/40 px-2.5 text-fail hover:bg-[var(--red-fill)]"
                        aria-label={`Delete ${i.name}`}
                        onClick={() => {
                          if (confirm(`Remove ${i.name} (${i.id})?`)) removeMut.mutate(i.id);
                        }}
                        disabled={removeMut.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 rounded-lg border border-innotech/15 bg-innotech/5 px-3 py-2 text-[11px] text-innotech">
          Inspectors verify the first piece of each session and are named on every report.
        </p>
      </CardContent>

      <PersonFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add inspector"
        submitting={addMut.isPending}
        onSubmit={(values) => addMut.mutate(values)}
      />

      <PersonFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit inspector"
        defaultValues={editing ?? undefined}
        submitting={updateMut.isPending}
        onSubmit={(values) => editing && updateMut.mutate({ id: editing.id, values })}
      />
    </Card>
  );
}
