import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrudPage } from "@/components/crud-page";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/sports")({
  component: Sports,
});

interface Athlete {
  id: string;
  full_name: string;
  sport: string | null;
  position: string | null;
  team: string | null;
  resting_heart_rate: number | null;
  status: string;
}

const STATUSES = ["active", "injured", "recovering"] as const;

function Sports() {
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin"]);


  return (
    <CrudPage<Athlete>
      title="Athletes"
      description="Roster, vitals, and injury status."
      table="athletes"
      canWrite={canWrite}
      defaultForm={{ full_name: "", status: "active" }}
      columns={[
        { key: "full_name", label: "Name" },
        { key: "sport", label: "Sport" },
        { key: "team", label: "Team" },
        { key: "position", label: "Position" },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span
              className={
                "rounded px-2 py-0.5 text-xs " +
                (r.status === "active"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : r.status === "injured"
                    ? "bg-rose-500/10 text-rose-600"
                    : "bg-amber-500/10 text-amber-600")
              }
            >
              {r.status}
            </span>
          ),
        },
        { key: "resting_heart_rate", label: "Resting HR" },
      ]}
      renderForm={(form, setForm) => (
        <>
          <div>
            <Label>Full name</Label>
            <Input
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sport</Label>
              <Input
                value={form.sport ?? ""}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
              />
            </div>
            <div>
              <Label>Team</Label>
              <Input
                value={form.team ?? ""}
                onChange={(e) => setForm({ ...form, team: e.target.value })}
              />
            </div>
            <div>
              <Label>Position</Label>
              <Input
                value={form.position ?? ""}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </div>
            <div>
              <Label>Resting HR (bpm)</Label>
              <Input
                type="number"
                value={form.resting_heart_rate ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    resting_heart_rate: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status ?? "active"}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    />
  );
}
