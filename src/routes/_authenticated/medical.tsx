import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CrudPage } from "@/components/crud-page";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/medical")({
  component: Medical,
});

interface Patient {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  medical_record_number: string | null;
  diagnosis: string | null;
  notes: string | null;
}

function Medical() {
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["doctor", "admin"]);

  return (
    <CrudPage<Patient>
      title="Patients"
      description="Electronic health records and clinical notes."
      table="patients"
      canWrite={canWrite}
      defaultForm={{ full_name: "" }}
      columns={[
        { key: "full_name", label: "Name" },
        { key: "medical_record_number", label: "MRN" },
        { key: "date_of_birth", label: "DOB" },
        { key: "diagnosis", label: "Diagnosis" },
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
              <Label>MRN</Label>
              <Input
                value={form.medical_record_number ?? ""}
                onChange={(e) => setForm({ ...form, medical_record_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Date of birth</Label>
              <Input
                type="date"
                value={form.date_of_birth ?? ""}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Diagnosis</Label>
            <Input
              value={form.diagnosis ?? ""}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </>
      )}
    />
  );
}
