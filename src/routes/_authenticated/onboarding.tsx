import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, HeartPulse, Stethoscope, User as UserIcon, Users, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

type RoleCard = {
  role: AppRole;
  title: string;
  blurb: string;
  icon: typeof UserIcon;
};

const CARDS: RoleCard[] = [
  { role: "patient", title: "Patient", blurb: "Register to access your health record and visits.", icon: UserIcon },
  { role: "athlete", title: "Athlete", blurb: "Join your team's roster with health metrics.", icon: Dumbbell },
  { role: "doctor", title: "Doctor", blurb: "Provide care, review visits, write notes.", icon: Stethoscope },
  { role: "nurse", title: "Nurse", blurb: "Triage patients and capture vitals.", icon: HeartPulse },
  { role: "coach", title: "Coach", blurb: "Track your athletes and report injuries.", icon: Activity },
  { role: "admin", title: "Admin", blurb: "Manage staff, roles, and inventory.", icon: Users },
];

function Onboarding() {
  const { user, profile, roles } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"role" | "form">(
    profile?.onboarded_as ? "form" : "role",
  );
  const [role, setRole] = useState<AppRole | null>(profile?.onboarded_as ?? null);
  const [form, setForm] = useState<Record<string, string>>({
    full_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
  });

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));

  const submit = useMutation({
    mutationFn: async () => {
      if (!user || !role) throw new Error("Not ready");

      // 1. Update profile + mark onboarded
      const { error: pErr } = await supabase
        .from("profiles" as never)
        .update({
          full_name: form.full_name,
          phone: form.phone,
          onboarded: true,
          onboarded_as: role,
        } as never)
        .eq("id", user.id);
      if (pErr) throw pErr;

      // 2. Assign role if missing (admin gated by RLS — first user via team page)
      if (!roles.includes(role) && role !== "admin") {
        const { error: rErr } = await supabase
          .from("user_roles" as never)
          .insert({ user_id: user.id, role } as never);
        // ignore duplicate; surface other errors
        if (rErr && !rErr.message.includes("duplicate")) {
          // RLS may reject for restricted roles; continue but warn
          console.warn(rErr.message);
        }
      }

      // 3. Role-specific record
      if (role === "doctor") {
        await supabase.from("doctor_profiles" as never).upsert({
          user_id: user.id,
          specialty: form.specialty || null,
          license_number: form.license_number || null,
          years_experience: num(form.years_experience),
          bio: form.bio || null,
        } as never, { onConflict: "user_id" } as never);
      } else if (role === "coach") {
        await supabase.from("coach_profiles" as never).upsert({
          user_id: user.id,
          team: form.team || null,
          sport: form.sport || null,
          certification: form.certification || null,
          years_experience: num(form.years_experience),
          bio: form.bio || null,
        } as never, { onConflict: "user_id" } as never);
      } else if (role === "patient") {
        await supabase.from("patients" as never).insert({
          user_id: user.id,
          full_name: form.full_name,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          phone: form.phone || null,
          email: user.email,
          address: form.address || null,
          blood_type: form.blood_type || null,
          allergies: form.allergies || null,
          chronic_conditions: form.chronic_conditions || null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          insurance_provider: form.insurance_provider || null,
          insurance_number: form.insurance_number || null,
        } as never);
      } else if (role === "athlete") {
        await supabase.from("athletes" as never).insert({
          user_id: user.id,
          full_name: form.full_name,
          sport: form.sport || null,
          team: form.team || null,
          position: form.position || null,
          date_of_birth: form.date_of_birth || null,
          height_cm: num(form.height_cm),
          weight_kg: num(form.weight_kg),
          resting_heart_rate: num(form.resting_heart_rate),
          phone: form.phone || null,
          email: user.email,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
        } as never);
      }
    },
    onSuccess: () => {
      toast.success("Welcome! You're all set.");
      navigate({ to: "/dashboard", reloadDocument: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (step === "role") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to Vitalis</h1>
          <p className="text-sm text-muted-foreground">
            Choose your role to get started. You can request additional access later.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <button
              key={c.role}
              type="button"
              onClick={() => {
                setRole(c.role);
                setStep("form");
              }}
              className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-accent/50"
            >
              <c.icon className="h-6 w-6 text-primary" />
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground">{c.blurb}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Onboarding · <span className="capitalize">{role}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Tell us a few details so we can set up your account.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setStep("role")}>
          Change role
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Full name *</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => setField("full_name", e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
          </div>
        </div>

        {role === "patient" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date of birth</Label>
                <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setField("date_of_birth", e.target.value)} />
              </div>
              <div>
                <Label>Gender</Label>
                <Select value={form.gender ?? ""} onValueChange={(v) => setField("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address ?? ""} onChange={(e) => setField("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Blood type</Label>
                <Select value={form.blood_type ?? ""} onValueChange={(v) => setField("blood_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Allergies</Label>
                <Input value={form.allergies ?? ""} onChange={(e) => setField("allergies", e.target.value)} placeholder="e.g. penicillin" />
              </div>
            </div>
            <div>
              <Label>Chronic conditions</Label>
              <Textarea rows={2} value={form.chronic_conditions ?? ""} onChange={(e) => setField("chronic_conditions", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Emergency contact name</Label>
                <Input value={form.emergency_contact_name ?? ""} onChange={(e) => setField("emergency_contact_name", e.target.value)} />
              </div>
              <div>
                <Label>Emergency contact phone</Label>
                <Input value={form.emergency_contact_phone ?? ""} onChange={(e) => setField("emergency_contact_phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Insurance provider</Label>
                <Input value={form.insurance_provider ?? ""} onChange={(e) => setField("insurance_provider", e.target.value)} />
              </div>
              <div>
                <Label>Insurance number</Label>
                <Input value={form.insurance_number ?? ""} onChange={(e) => setField("insurance_number", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {role === "athlete" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Sport</Label>
                <Input value={form.sport ?? ""} onChange={(e) => setField("sport", e.target.value)} />
              </div>
              <div>
                <Label>Team</Label>
                <Input value={form.team ?? ""} onChange={(e) => setField("team", e.target.value)} />
              </div>
              <div>
                <Label>Position</Label>
                <Input value={form.position ?? ""} onChange={(e) => setField("position", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date of birth</Label>
                <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => setField("date_of_birth", e.target.value)} />
              </div>
              <div>
                <Label>Resting heart rate (bpm)</Label>
                <Input type="number" value={form.resting_heart_rate ?? ""} onChange={(e) => setField("resting_heart_rate", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Height (cm)</Label>
                <Input type="number" step="0.1" value={form.height_cm ?? ""} onChange={(e) => setField("height_cm", e.target.value)} />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.1" value={form.weight_kg ?? ""} onChange={(e) => setField("weight_kg", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Emergency contact name</Label>
                <Input value={form.emergency_contact_name ?? ""} onChange={(e) => setField("emergency_contact_name", e.target.value)} />
              </div>
              <div>
                <Label>Emergency contact phone</Label>
                <Input value={form.emergency_contact_phone ?? ""} onChange={(e) => setField("emergency_contact_phone", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {role === "doctor" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Specialty</Label>
                <Input value={form.specialty ?? ""} onChange={(e) => setField("specialty", e.target.value)} placeholder="e.g. Cardiology" />
              </div>
              <div>
                <Label>License number</Label>
                <Input value={form.license_number ?? ""} onChange={(e) => setField("license_number", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Years of experience</Label>
              <Input type="number" value={form.years_experience ?? ""} onChange={(e) => setField("years_experience", e.target.value)} />
            </div>
            <div>
              <Label>Short bio</Label>
              <Textarea rows={3} value={form.bio ?? ""} onChange={(e) => setField("bio", e.target.value)} />
            </div>
          </>
        )}

        {role === "coach" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Team</Label>
                <Input value={form.team ?? ""} onChange={(e) => setField("team", e.target.value)} />
              </div>
              <div>
                <Label>Sport</Label>
                <Input value={form.sport ?? ""} onChange={(e) => setField("sport", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Certification</Label>
                <Input value={form.certification ?? ""} onChange={(e) => setField("certification", e.target.value)} />
              </div>
              <div>
                <Label>Years of experience</Label>
                <Input type="number" value={form.years_experience ?? ""} onChange={(e) => setField("years_experience", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Short bio</Label>
              <Textarea rows={3} value={form.bio ?? ""} onChange={(e) => setField("bio", e.target.value)} />
            </div>
          </>
        )}

        {(role === "nurse" || role === "admin") && (
          <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            {role === "nurse"
              ? "Nurses can triage patients and capture vitals once an admin confirms your role."
              : "Admin role is restricted. If you're the first user, claim it on the Team & Roles page."}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            onClick={() => submit.mutate()}
            disabled={!form.full_name || submit.isPending}
          >
            {submit.isPending ? "Saving..." : "Complete onboarding"}
          </Button>
        </div>
      </div>
    </div>
  );
}
