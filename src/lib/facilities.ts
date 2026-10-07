// Client-side facility (branch) registry + module flags.
// Until the multi-facility database tables exist, facility records live in
// localStorage with a built-in fallback so every screen has a branch to show.

export type ModuleKey =
  | "outpatient" | "inpatient_haims" | "theatre" | "icu" | "maternity" | "emergency"
  | "laboratory" | "radiology" | "pharmacy" | "diagnostics_quality"
  | "billing" | "insurance" | "finance" | "mobility" | "sports"
  | "immunization" | "chronic_care" | "inventory" | "procurement" | "hr";

export const MODULES: { key: ModuleKey; label: string; description: string }[] = [
  { key: "outpatient", label: "Outpatient", description: "Reception, queue, visits, appointments" },
  { key: "inpatient_haims", label: "Inpatient (HAIMS)", description: "Admissions, wards, beds, MAR, rounds" },
  { key: "theatre", label: "Theatre", description: "Surgery and anaesthesia" },
  { key: "icu", label: "ICU / Critical care", description: "Critical care units" },
  { key: "maternity", label: "Maternity", description: "Antenatal, labour, postnatal" },
  { key: "emergency", label: "Emergency", description: "Casualty and resuscitation" },
  { key: "laboratory", label: "Laboratory", description: "Lab orders and results" },
  { key: "radiology", label: "Radiology", description: "Imaging orders and reports" },
  { key: "pharmacy", label: "Pharmacy", description: "Dispensing and pharmacy safety" },
  { key: "diagnostics_quality", label: "Diagnostics quality", description: "Critical results, instrument QC" },
  { key: "billing", label: "Billing", description: "Invoices and payments" },
  { key: "insurance", label: "Insurance", description: "Claims and pre-authorisation" },
  { key: "finance", label: "Finance ops", description: "Cash reconciliation, credit notes" },
  { key: "mobility", label: "Mobility fleet", description: "Ambulance, cab and transfer dispatch" },
  { key: "sports", label: "Sports & Wellness", description: "Sports medicine, physio, nutrition" },
  { key: "immunization", label: "Immunization", description: "KEPI registry and vaccine cards" },
  { key: "chronic_care", label: "Chronic care", description: "Refill engine" },
  { key: "inventory", label: "Inventory & Store", description: "Stock, batches, goods received" },
  { key: "procurement", label: "Procurement", description: "Purchasing and tenders" },
  { key: "hr", label: "HR & Workplace", description: "Leave, payslips, attendance" },
];

export type Tier = "starter" | "pro" | "enterprise";

export const TIER_MODULES: Record<Tier, ModuleKey[]> = {
  starter: ["outpatient", "laboratory", "pharmacy", "billing", "immunization", "chronic_care"],
  pro: ["outpatient", "laboratory", "pharmacy", "billing", "immunization", "chronic_care",
    "radiology", "inpatient_haims", "insurance", "finance", "inventory", "diagnostics_quality", "emergency"],
  enterprise: MODULES.map((m) => m.key),
};

export interface Facility {
  id: string;
  name: string;
  code: string;
  facility_type: "hospital" | "clinic" | "satellite";
  tier: Tier;
  address: string;
  phone: string;
  email: string;
  website?: string;
  tax_pin?: string;
  currency: string;
  logo_url?: string;
  tagline?: string;
  hours?: string;
  is_active: boolean;
  modules: Record<ModuleKey, boolean>;
  billing_model: "per_provider" | "flat_fee";
  seats: number;
}

export const modulesForTier = (tier: Tier): Record<ModuleKey, boolean> =>
  Object.fromEntries(MODULES.map((m) => [m.key, TIER_MODULES[tier].includes(m.key)])) as Record<ModuleKey, boolean>;

export const FALLBACK_FACILITIES: Facility[] = [
  {
    id: "fac-main", name: "Litu Diagnostics — Central", code: "MAIN", facility_type: "hospital", tier: "enterprise",
    address: "Nairobi, Kenya", phone: "+254 781 872670", email: "info@litudiagnostics.co.ke",
    website: "litudiagnostics.com", tax_pin: "", currency: "KES", tagline: "thrive with good health",
    hours: "24 hours", is_active: true, modules: modulesForTier("enterprise"), billing_model: "flat_fee", seats: 40,
  },
  {
    id: "fac-branch-1", name: "Litu Diagnostics — Westlands Clinic", code: "BRANCH-1", facility_type: "clinic", tier: "pro",
    address: "Westlands, Nairobi", phone: "+254 781 872670", email: "westlands@litudiagnostics.co.ke",
    website: "litudiagnostics.com", currency: "KES", hours: "Mon–Sat 07:00–21:00", is_active: true,
    modules: modulesForTier("pro"), billing_model: "per_provider", seats: 12,
  },
  {
    id: "fac-sat-1", name: "Litu Diagnostics — Kisumu Satellite", code: "SAT-1", facility_type: "satellite", tier: "starter",
    address: "Kisumu, Kenya", phone: "+254 781 872670", email: "kisumu@litudiagnostics.co.ke",
    website: "litudiagnostics.com", currency: "KES", hours: "Mon–Fri 08:00–17:00", is_active: true,
    modules: modulesForTier("starter"), billing_model: "per_provider", seats: 4,
  },
];

const LIST_KEY = "litu-vault:facilities";
const ACTIVE_KEY = "litu-vault:active-facility";
export const FACILITIES_EVENT = "litu-vault:facilities-changed";

export function loadFacilities(): Facility[] {
  if (typeof window === "undefined") return FALLBACK_FACILITIES;
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Facility[];
      if (Array.isArray(parsed) && parsed.length) {
        // Backfill any module keys added after the record was saved.
        return parsed.map((f) => ({ ...f, modules: { ...modulesForTier(f.tier ?? "starter"), ...f.modules } }));
      }
    }
  } catch { /* ignore */ }
  return FALLBACK_FACILITIES;
}

export function saveFacilities(list: Facility[]) {
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(FACILITIES_EVENT));
  } catch { /* ignore */ }
}

export function upsertFacility(f: Facility) {
  const list = loadFacilities();
  const i = list.findIndex((x) => x.id === f.id);
  if (i >= 0) list[i] = f; else list.push(f);
  saveFacilities(list);
}

export const loadActiveFacilityId = () => {
  try { return window.localStorage.getItem(ACTIVE_KEY); } catch { return null; }
};
export const saveActiveFacilityId = (id: string) => {
  try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
};

// Path → module mapping. Most specific prefixes first. Paths not listed are
// core (dashboard, messages, admin) and are never disabled by module flags.
const PATH_MODULES: [string, ModuleKey][] = [
  ["/coming-soon/theatre-", "theatre"], ["/coming-soon/surgical-", "theatre"],
  ["/coming-soon/anaesthesia-", "theatre"], ["/coming-soon/recovery", "theatre"], ["/surgery", "theatre"],
  ["/coming-soon/icu-", "icu"], ["/coming-soon/critical-care-", "icu"],
  ["/coming-soon/ventilator-", "icu"], ["/coming-soon/sedation", "icu"],
  ["/coming-soon/maternity-", "maternity"], ["/coming-soon/antenatal", "maternity"],
  ["/coming-soon/labour-", "maternity"], ["/coming-soon/postnatal", "maternity"], ["/coming-soon/newborn-", "maternity"],
  ["/coming-soon/emergency", "emergency"], ["/coming-soon/resuscitation", "emergency"], ["/coming-soon/observation-unit", "emergency"],
  ["/reception", "outpatient"], ["/queue", "outpatient"], ["/visits", "outpatient"], ["/appointments", "outpatient"],
  ["/haims", "inpatient_haims"], ["/admissions", "inpatient_haims"], ["/beds", "inpatient_haims"],
  ["/nursing-station", "inpatient_haims"], ["/ward-rounds", "inpatient_haims"], ["/emar", "inpatient_haims"],
  ["/monitoring", "inpatient_haims"], ["/care-plans", "inpatient_haims"], ["/inpatient-procedures", "inpatient_haims"],
  ["/allied-health", "inpatient_haims"], ["/infection-control", "inpatient_haims"],
  ["/discharge-planning", "inpatient_haims"], ["/ward-analytics", "inpatient_haims"], ["/my-inpatients", "inpatient_haims"],
  ["/lab-order", "laboratory"], ["/lab", "laboratory"],
  ["/radiology", "radiology"],
  ["/pharmacy", "pharmacy"], ["/controlled-drugs", "pharmacy"], ["/prescribe", "pharmacy"],
  ["/critical-results", "diagnostics_quality"], ["/instruments", "diagnostics_quality"],
  ["/billing", "billing"], ["/insurance", "insurance"], ["/preauth", "insurance"],
  ["/cash-reconciliation", "finance"], ["/credit-notes", "finance"],
  ["/mobility", "mobility"],
  ["/sports", "sports"], ["/physio", "sports"], ["/nutrition", "sports"], ["/anti-doping", "sports"],
  ["/immunization", "immunization"], ["/my-vaccines", "immunization"],
  ["/chronic-care", "chronic_care"],
  ["/inventory", "inventory"], ["/store", "inventory"], ["/audit-inventory", "inventory"],
  ["/procurement", "procurement"], ["/tenders", "procurement"],
  ["/hr/", "hr"], ["/requests", "hr"], ["/attendance", "hr"], ["/leave-inbox", "hr"], ["/announcements", "hr"],
];

export function moduleForPath(path: string): ModuleKey | null {
  for (const [prefix, mod] of PATH_MODULES) if (path === prefix || path.startsWith(prefix)) return mod;
  return null;
}

export function isModuleEnabled(path: string, modules?: Partial<Record<ModuleKey, boolean>> | null): boolean {
  if (!modules) return true;
  const m = moduleForPath(path);
  return m ? modules[m] !== false : true;
}
