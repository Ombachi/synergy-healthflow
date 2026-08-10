import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Ambulance, Accessibility, ArrowLeft, ArrowRight, Car, Check, Crosshair, Cross, Loader2, MapPin, Siren,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

import {
  useCreateRequest, useLocations, useMyPatient, usePricingRules, useInsertRow,
} from "../api";
import {
  PRIORITY_LABEL, REQUIREMENT_LABEL, SERVICE_BLURB, SERVICE_LABEL, SERVICE_REQUIREMENTS,
  SUBJECT_LABEL,
} from "../types";
import type { Priority, Requirements, ServiceType, Subject } from "../types";
import { ambulanceTier, calculateFare, formatKes, pickRule } from "../pricing/pricing";
import { roadKm } from "../tracking/geo";

const SERVICE_ICON: Record<ServiceType, typeof Car> = {
  ambulance: Ambulance,
  cab: Car,
  assisted: Accessibility,
  hearse: Cross,
  transfer: Ambulance,
};

interface Place {
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY_PLACE: Place = { label: "", address: "", lat: null, lng: null };

function PlacePicker({
  title, value, onChange, allowCurrent,
}: {
  title: string;
  value: Place;
  onChange: (p: Place) => void;
  allowCurrent?: boolean;
}) {
  const { data: locations = [] } = useLocations();
  const [locating, setLocating] = useState(false);

  function useCurrent() {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          label: "Current location",
          address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        toast.success("Using your current location");
      },
      () => {
        setLocating(false);
        toast.error("Could not read your location — enter the address instead");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{title}</Label>
      {allowCurrent && (
        <Button type="button" variant="outline" size="sm" onClick={useCurrent} disabled={locating}>
          {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
          Use my current location
        </Button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Place name (e.g. Home)"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
        <Input
          placeholder="Street address"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Or pick a saved place / facility</Label>
        <Select
          value=""
          onValueChange={(id) => {
            const l = locations.find((x) => x.id === id);
            if (l) onChange({ label: l.label, address: l.address, lat: l.lat, lng: l.lng });
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a place" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.is_facility ? "🏥 " : "⭐ "}{l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function BookingWizard({
  fixedService, staffMode, patientId, encounterId, encounterType, department, onDone,
}: {
  fixedService?: ServiceType;
  staffMode?: boolean;
  patientId?: string | null;
  encounterId?: string | null;
  encounterType?: string | null;
  department?: string | null;
  onDone?: () => void;
} = {}) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: myPatient } = useMyPatient();
  const { data: rules = [] } = usePricingRules();
  const createRequest = useCreateRequest();
  const insertMortuary = useInsertRow("mobility_mortuary_transfers");
  const saveLocation = useInsertRow("mobility_locations");

  const [step, setStep] = useState(fixedService ? 1 : 0);
  const [service, setService] = useState<ServiceType>(fixedService ?? "cab");
  const [subject, setSubject] = useState<Subject>(staffMode ? "other_patient" : "self");
  const [pickup, setPickup] = useState<Place>(EMPTY_PLACE);
  const [destination, setDestination] = useState<Place>(EMPTY_PLACE);
  const [requirements, setRequirements] = useState<Requirements>({});
  const [priority, setPriority] = useState<Priority>("routine");
  const [passengers, setPassengers] = useState(1);
  const [condition, setCondition] = useState("");
  const [instructions, setInstructions] = useState("");
  const [relationship, setRelationship] = useState("");
  const [contactName, setContactName] = useState(profile?.full_name ?? "");
  const [contactPhone, setContactPhone] = useState(profile?.phone ?? "");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [savePickup, setSavePickup] = useState(false);

  // Mortuary-specific
  const [deceasedName, setDeceasedName] = useState("");
  const [deceasedAge, setDeceasedAge] = useState("");
  const [deceasedGender, setDeceasedGender] = useState("");
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [docs, setDocs] = useState<Record<string, boolean>>({});

  const distanceKm = useMemo(
    () => roadKm({ lat: pickup.lat, lng: pickup.lng }, { lat: destination.lat, lng: destination.lng }),
    [pickup, destination],
  );

  const fare = useMemo(() => {
    const tier = service === "ambulance" ? ambulanceTier(requirements) : null;
    const rule = pickRule(rules, service, tier);
    if (!rule) return null;
    return calculateFare({
      rule,
      distanceKm,
      durationMinutes: Math.round((distanceKm / 28) * 60),
      requirements,
      when: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt) : new Date(),
    });
  }, [rules, service, requirements, distanceKm, scheduleMode, scheduledAt]);

  const questions = SERVICE_REQUIREMENTS[service];
  const isMortuary = service === "hearse";
  const steps = isMortuary
    ? ["Service", "Deceased", "Pickup", "Destination", "Documentation", "Schedule", "Confirm"]
    : ["Service", "Who", "Pickup", "Destination", "Requirements", "Schedule", "Confirm"];

  function toggleReq(k: keyof Requirements) {
    setRequirements((r) => ({ ...r, [k]: !r[k] }));
  }

  const canNext = (() => {
    switch (step) {
      case 0: return true;
      case 1: return isMortuary ? deceasedName.trim().length > 1 : true;
      case 2: return pickup.label.trim().length > 0;
      case 3: return destination.label.trim().length > 0;
      default: return true;
    }
  })();

  async function submit() {
    if (!user) return;
    const resolvedPatient = patientId ?? (subject === "self" ? myPatient?.id ?? null : null);
    try {
      const request = await createRequest.mutateAsync({
        service_type: service,
        subject,
        patient_id: resolvedPatient,
        requester_id: user.id,
        requester_name: contactName || profile?.full_name || null,
        requester_phone: contactPhone || profile?.phone || null,
        requester_relationship: relationship || null,
        pickup_label: pickup.label,
        pickup_address: pickup.address || null,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        destination_label: destination.label,
        destination_address: destination.address || null,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        schedule_mode: scheduleMode,
        scheduled_at: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        passengers,
        declared_priority: service === "ambulance" ? priority : "routine",
        condition_notes: condition || null,
        requirements,
        special_instructions: instructions || null,
        distance_km: distanceKm,
        estimated_fare_cents: fare?.totalCents ?? 0,
        origin: staffMode ? "staff" : "patient_portal",
        encounter_id: encounterId ?? null,
        encounter_type: encounterType ?? null,
        department: department ?? null,
        requesting_clinician: staffMode ? user.id : null,
      });

      if (isMortuary) {
        await insertMortuary.mutateAsync({
          request_id: request.id,
          deceased_name: deceasedName,
          deceased_age: deceasedAge ? Number(deceasedAge) : null,
          deceased_gender: deceasedGender || null,
          date_of_death: dateOfDeath || null,
          documentation: docs,
          documentation_status: Object.values(docs).some(Boolean) ? "partial" : "pending",
        });
      }

      if (savePickup && pickup.label) {
        await saveLocation.mutateAsync({
          owner_id: user.id, label: pickup.label, address: pickup.address || pickup.label,
          lat: pickup.lat, lng: pickup.lng,
        }).catch(() => undefined);
      }

      toast.success(`Transport request ${request.request_code} sent to dispatch`);
      if (onDone) onDone();
      else navigate({ to: "/mobility/trips" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <Badge key={s} variant={i === step ? "default" : "outline"} className="text-xs">
            {i < step && <Check className="mr-1 h-3 w-3" />}{s}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{steps[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["ambulance", "cab", "assisted", "hearse"] as ServiceType[]).map((s) => {
                const Icon = SERVICE_ICON[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setService(s); setSubject(s === "hearse" ? "deceased" : subject === "deceased" ? "self" : subject); }}
                    className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                      service === s ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="mt-0.5 h-5 w-5 text-primary" />
                    <span>
                      <span className="block font-medium">{SERVICE_LABEL[s]}</span>
                      <span className="block text-xs text-muted-foreground">{SERVICE_BLURB[s]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && !isMortuary && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {(["self", "family", "other_patient"] as Subject[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={`rounded-lg border p-3 text-sm ${subject === s ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    {SUBJECT_LABEL[s]}
                  </button>
                ))}
              </div>
              {subject !== "self" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Your name</Label>
                    <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Your phone</Label>
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Relationship to patient</Label>
                    <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Son" />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 1 && isMortuary && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Full name of the deceased</Label>
                  <Input value={deceasedName} onChange={(e) => setDeceasedName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Date of death</Label>
                  <Input type="date" value={dateOfDeath} onChange={(e) => setDateOfDeath(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Age</Label>
                  <Input type="number" value={deceasedAge} onChange={(e) => setDeceasedAge(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Gender</Label>
                  <Input value={deceasedGender} onChange={(e) => setDeceasedGender(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Requester name</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Contact phone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Relationship</Label>
                  <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <PlacePicker title="Where should we collect from?" value={pickup} onChange={setPickup} allowCurrent />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={savePickup} onCheckedChange={(v) => setSavePickup(!!v)} />
                Save this as one of my places
              </label>
            </div>
          )}

          {step === 3 && (
            <PlacePicker title="Where are we going?" value={destination} onChange={setDestination} />
          )}

          {step === 4 && !isMortuary && (
            <div className="space-y-5">
              {service === "ambulance" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">How urgent is this? (as described by you)</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                          <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is recorded as a <strong>patient-declared</strong> priority. A clinician will
                      confirm the clinical priority — the two are tracked separately.
                    </p>
                  </div>
                  {priority === "emergency" && (
                    <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                      <Siren className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">If this is a life-threatening emergency</p>
                        <p className="text-muted-foreground">
                          Call emergency services on <strong>999</strong> or <strong>112</strong> now. Submitting
                          this request alerts our dispatch desk immediately, but it does not replace an
                          emergency call.
                        </p>
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Current condition of the patient</Label>
                    <Textarea rows={3} value={condition} onChange={(e) => setCondition(e.target.value)} />
                  </div>
                </div>
              )}

              {service === "cab" && (
                <div className="w-40">
                  <Label className="text-xs">Number of passengers</Label>
                  <Input
                    type="number" min={1} max={6} value={passengers}
                    onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              )}

              {questions.length > 0 && (
                <div>
                  <Label className="text-xs">Transport requirements</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {questions.map((k) => (
                      <label key={k} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Checkbox checked={!!requirements[k]} onCheckedChange={() => toggleReq(k)} />
                        {REQUIREMENT_LABEL[k]}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only vehicles that can meet these requirements will be dispatched.
                  </p>
                </div>
              )}

              <div>
                <Label className="text-xs">Special instructions</Label>
                <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
            </div>
          )}

          {step === 4 && isMortuary && (
            <div className="space-y-3">
              <Label className="text-xs">Required documentation</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["death_notification", "Death notification"],
                  ["burial_permit", "Burial permit"],
                  ["body_release_form", "Body release form"],
                  ["next_of_kin_id", "Next of kin identification"],
                  ["mortuary_clearance", "Mortuary clearance"],
                  ["police_abstract", "Police abstract (where applicable)"],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox checked={!!docs[k!]} onCheckedChange={() => setDocs((d) => ({ ...d, [k!]: !d[k!] }))} />
                    {label}
                  </label>
                ))}
              </div>
              <div>
                <Label className="text-xs">Notes for the crew</Label>
                <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button" onClick={() => setScheduleMode("now")}
                  className={`rounded-lg border p-3 text-sm ${scheduleMode === "now" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  Now — dispatch as soon as possible
                </button>
                <button
                  type="button" onClick={() => setScheduleMode("later")}
                  className={`rounded-lg border p-3 text-sm ${scheduleMode === "later" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  Later — book a date and time
                </button>
              </div>
              {scheduleMode === "later" && (
                <div className="w-64">
                  <Label className="text-xs">Pickup date &amp; time</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-primary" />
                  {pickup.label} → {destination.label}
                </div>
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Service</dt><dd>{SERVICE_LABEL[service]}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Distance (est.)</dt><dd>{distanceKm.toFixed(1)} km</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">When</dt><dd>{scheduleMode === "now" ? "As soon as possible" : scheduledAt || "—"}</dd></div>
                  {service === "ambulance" && (
                    <div className="flex justify-between"><dt className="text-muted-foreground">Declared priority</dt><dd>{PRIORITY_LABEL[priority]}</dd></div>
                  )}
                </dl>
                {Object.keys(requirements).some((k) => requirements[k as keyof Requirements]) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(Object.keys(requirements) as (keyof Requirements)[])
                      .filter((k) => requirements[k])
                      .map((k) => <Badge key={k} variant="secondary" className="text-xs">{REQUIREMENT_LABEL[k]}</Badge>)}
                  </div>
                )}
              </div>

              {fare ? (
                <div className="rounded-lg border p-4 text-sm">
                  <div className="mb-2 font-medium">Fare estimate · {fare.ruleLabel}</div>
                  <ul className="space-y-1">
                    {fare.lines.map((l, i) => (
                      <li key={i} className="flex justify-between text-muted-foreground">
                        <span>{l.label}</span><span>{formatKes(l.cents)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                    <span>Estimated total</span><span>{formatKes(fare.totalCents)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Estimate only. The final fare is confirmed on completion and billed to your
                    Litu Vault account.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pricing for this service is arranged by the transport desk.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(fixedService ? 1 : 0, s - 1))}
          disabled={step === (fixedService ? 1 : 0)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {step < 6 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={createRequest.isPending}>
            {createRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm request
          </Button>
        )}
      </div>
    </div>
  );
}
