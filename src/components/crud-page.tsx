import { useState, type ReactNode } from "react";
import { Pager, usePager } from "@/components/pager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  render?: (row: T) => ReactNode;
}

export interface CrudPageProps<T extends { id: string }> {
  title: string;
  description: string;
  table: string;
  columns: Column<T>[];
  canWrite: boolean;
  renderForm: (
    form: Partial<T>,
    setForm: (v: Partial<T>) => void,
  ) => ReactNode;
  defaultForm: Partial<T>;
}

export function CrudPage<T extends { id: string }>({
  title,
  description,
  table,
  columns,
  canWrite,
  renderForm,
  defaultForm,
}: CrudPageProps<T>) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<T>>(defaultForm);

  const list = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as T[]) ?? [];
    },
  });
  const pager = usePager(list.data ?? [], 20);


  const create = useMutation({
    mutationFn: async (payload: Partial<T>) => {
      const { error } = await supabase.from(table as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["count", table] });
      setOpen(false);
      setForm(defaultForm);
      toast.success("Created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["count", table] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New {title.toLowerCase()}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">{renderForm(form, setForm)}</div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate(form)}
                  disabled={create.isPending}
                >
                  {create.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              {canWrite && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            )}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            )}
            {pager.slice.map((row) => (
              <tr key={row.id} className="border-t">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2">
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
                {canWrite && (
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove.mutate(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...pager} label={title.toLowerCase()} />
      </div>
    </div>
  );
}
