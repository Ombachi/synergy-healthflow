import type { AppRole } from "@/hooks/use-auth";
import { STAFF_ROLES, HR_MANAGEMENT_ROLES } from "./role-permissions";

// ============================================================================
// Per-role sidebar visibility rules.
// These filter what is *shown* in the nav; they do NOT relax route access
// (canAccess() still owns that). A user with multiple roles sees an item if
// at least one of their roles would show it.
// ============================================================================

// Whole groups hidden for a role.
const HIDE_GROUPS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  lab_tech:          ["inpatient", "emergency"],
  billing_officer:   ["outpatient", "inpatient", "emergency", "finance"],
  doctor:            ["emergency"],
  nurse:             ["emergency"],
  pharmacist:        ["emergency"],
  physio:            ["emergency"],
  nutritionist:      ["emergency"],
  radiologist:       ["emergency"],
  procurement:       ["outpatient", "inpatient", "emergency"],
  store_keeper:      ["outpatient", "inpatient", "emergency"],
  admin:             ["emergency"],
  superadmin:        ["outpatient", "inpatient", "emergency", "quality", "dept-mgmt", "sports", "store", "staff-self-service", "hr-management"],
  facility_admin:    ["outpatient", "inpatient", "emergency", "sports"],
};

// Theatre / ICU / Maternity stub prefixes (nested under Inpatient).
const THEATRE_PREFIXES = ["/surgery", "/coming-soon/theatre-", "/coming-soon/surgical-", "/coming-soon/anaesthesia-", "/coming-soon/recovery"];
const ICU_PREFIXES = ["/coming-soon/icu-", "/coming-soon/ventilator-", "/coming-soon/sedation", "/coming-soon/critical-care-"];
const MATERNITY_PREFIXES = ["/coming-soon/maternity-", "/coming-soon/antenatal", "/coming-soon/labour-", "/coming-soon/postnatal", "/coming-soon/newborn-"];
const SUBDOMAIN_PREFIXES = [...THEATRE_PREFIXES, ...ICU_PREFIXES, ...MATERNITY_PREFIXES];

// Individual URLs hidden for a role.
const HIDE_URLS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  lab_tech: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
  ],
  doctor: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/admissions",
    "/beds", "/coming-soon/ward-board", "/nursing-station", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/care-plans", "/ward-rounds",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],

  nurse: [
    "/coming-soon/nursing-triage", "/visits", "/lab-order",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/outpatient-procedures",
    "/admissions", "/beds", "/coming-soon/ward-board", "/nursing-station",
    "/care-plans", "/ward-rounds", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    "/discharge-planning",
    ...SUBDOMAIN_PREFIXES,
  ],
  pharmacist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  physio: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/care-plans", "/ward-rounds",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  nutritionist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients",
    "/care-plans", "/coming-soon/inpatient-imaging",
    "/allied-health",
    "/sports",
    ...SUBDOMAIN_PREFIXES,
  ],
  radiologist: [
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/prescribe", "/coming-soon/outpatient-imaging", "/coming-soon/visit-history",
    "/coming-soon/ward-board", "/my-inpatients", "/emar",
    "/inpatient-procedures", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    ...SUBDOMAIN_PREFIXES,
  ],
  store_keeper: [
    "/orders/stock-requests",
  ],
  admin: [
    // Outpatient trims
    "/coming-soon/nursing-triage", "/coming-soon/outpatient-procedures",
    "/lab-order", "/coming-soon/outpatient-imaging", "/prescribe",
    "/coming-soon/visit-history",
    // Inpatient trims
    "/admissions", "/beds", "/nursing-station",
    "/coming-soon/ward-board", "/my-inpatients",
    "/care-plans", "/coming-soon/inpatient-imaging",
    "/allied-health", "/monitoring", "/infection-control", "/ward-analytics",
    "/inpatient-procedures", "/discharge-planning", "/emar", "/ward-rounds",
    ...SUBDOMAIN_PREFIXES,
    // Sports trims
    "/sports-medicine", "/anti-doping", "/assessments",
    // Store trims
    "/tenders", "/audit-inventory", "/orders/stock-requests",
    // HR trims
    "/hr/me", "/hr/leave", "/hr/payslips", "/hr/documents", "/hr/admin",
    "/requests", "/attendance", "/leave-inbox", "/announcements",
    // Finance trims
    "/cash-reconciliation", "/credit-notes", "/preauth",
    // Mobility trims
    "/mobility/request", "/mobility/trips", "/mobility/driver",
    // Clinical/ops screens owned by their specialist roles
    "/immunization", "/my-vaccines", "/critical-results",
    "/referrals", "/pharmacy-safety", "/controlled-drugs", "/chronic-care",
    "/mobility/dispatch", "/mobility/fleet",
    // Admin group trims
    "/roster", "/admin-kpi",
  ],

};

// Platform admin sees only platform administration; facility admin sees branch operations.
const PLATFORM_ADMIN_URLS = ["/dashboard", "/messages", "/admin/facilities", "/users", "/service-catalog", "/audit", "/sla", "/admin/errors", "/admin/access-reviews", "/admin/breaches", "/admin/consent", "/admin/soft-deleted", "/admin/portal-invitations"];
const PLATFORM_PROVISIONING_URLS = ["/admin/facilities", "/users", "/service-catalog"];
const FACILITY_ADMIN_HIDE = [...PLATFORM_PROVISIONING_URLS, "/coming-soon/", ...SUBDOMAIN_PREFIXES];

// Strict whitelist: role sees ONLY these URLs (both groups and standalone).
const ONLY_URLS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  superadmin: PLATFORM_ADMIN_URLS,
  patient:           ["/me", "/my-vaccines", "/assessments", "/messages", "/chronic-care", "/mobility/request", "/mobility/trips"],
  athlete:           ["/me", "/my-vaccines", "/assessments", "/messages", "/chronic-care", "/mobility/request", "/mobility/trips"],
  receptionist:      ["/appointments", "/dashboard", "/messages", "/reception", "/patients"],
  insurance_officer: ["/insurance", "/preauth", "/dashboard", "/messages"],
  fleet_manager:     ["/dashboard", "/messages", "/mobility/dispatch", "/mobility/fleet", "/mobility/trips", "/mobility/request"],
  admissions_officer: ["/dashboard", "/messages", "/patients", "/admissions", "/beds", "/nursing-station", "/mobility/request", "/mobility/trips"],
  hr_officer: ["/dashboard", "/messages", "/hr/admin", "/leave-inbox", "/roster"],
  hr_manager: ["/dashboard", "/messages", "/hr/admin", "/leave-inbox", "/roster"],
  dept_manager: ["/dashboard", "/messages", "/leave-inbox"],
  driver:            ["/dashboard", "/messages", "/mobility/driver", "/mobility/trips"],
};

function urlMatches(url: string, pattern: string): boolean {
  return url === pattern || url.startsWith(pattern);
}

export function isItemVisibleForRoles(url: string, groupKey: string | null, roles: AppRole[]): boolean {
  if (url === "/orders/stock-requests" && roles.some((r) => ["nurse", "lab_tech", "pharmacist"].includes(r))) return true;
  if (groupKey === "staff-self-service") return roles.some(role => STAFF_ROLES.includes(role));
  if (groupKey === "hr-management") return roles.some(role => HR_MANAGEMENT_ROLES.includes(role));
  if (roles.length === 0) return true; // let canAccess handle it
  if (roles.includes("facility_admin") && !roles.includes("superadmin")) {
    if (FACILITY_ADMIN_HIDE.some((p) => urlMatches(url, p))) return false;
    if (["/facility/staff", "/orders/stock-requests", "/leave-inbox", "/roster", "/inventory", "/lab-templates"].includes(url)) return true;
  }
  // Item is visible if ANY of the user's roles would show it.
  return roles.some((role) => {
    const only = ONLY_URLS_BY_ROLE[role];
    if (only) return only.some((p) => urlMatches(url, p));
    if (groupKey && HIDE_GROUPS_BY_ROLE[role]?.includes(groupKey)) return false;
    const hides = HIDE_URLS_BY_ROLE[role];
    if (hides && hides.some((p) => urlMatches(url, p))) return false;
    return true;
  });
}

