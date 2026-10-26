import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { licenseStatus, requiredLicenseStatus, validateLicense } from "./license-rules";

const today = "2026-10-26";
describe("professional licence rules", () => {
  it("flags licences past expiry as expired", () => assert.equal(licenseStatus("2026-10-25", today), "expired"));
  it("treats expiry today as critical, not expired", () => assert.equal(licenseStatus("2026-10-26", today), "critical"));
  it("is critical within 30 days", () => assert.equal(licenseStatus("2026-11-25", today), "critical"));
  it("warns within 60 days", () => assert.equal(licenseStatus("2026-12-25", today), "expiring"));
  it("is valid beyond 60 days", () => assert.equal(licenseStatus("2026-12-26", today), "valid"));
  it("doctors need KMPDC", () => assert.equal(requiredLicenseStatus("doctor", [{ council: "NCK", expiry_date: "2027-12-31" }], today), "missing"));
  it("uses the latest renewal", () => assert.equal(requiredLicenseStatus("nurse", [{ council: "NCK", expiry_date: "2026-01-01" }, { council: "NCK", expiry_date: "2027-12-31" }], today), "valid"));
  it("non-clinical roles need no licence", () => assert.equal(requiredLicenseStatus("cashier", [], today), null));
  it("rejects expiry before issue", () => assert.throws(() => validateLicense({ council: "PPB", license_number: "P1", issue_date: "2026-05-01", expiry_date: "2026-04-01" })));
  it("rejects a blank licence number", () => assert.throws(() => validateLicense({ council: "PPB", license_number: " ", expiry_date: "2026-12-31" })));
});
