import type jsPDF from "jspdf";
import QRCode from "qrcode";
import logoUrl from "@/assets/litu-vault-logo.png";

export const ORG_NAME = "Litu Diagnostics";
export const ORG_TAGLINE = "thrive with good health";
export const ORG_ADDRESS = "Kenya  ·  +254 781 872670  ·  litudiagnostics.com  ·  info@litudiagnostics.co.ke";

let _logoCache: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (_logoCache) return _logoCache;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const url: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    _logoCache = url;
    return url;
  } catch {
    return null;
  }
}

async function qrDataUrl(value: string, size = 96): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, { width: size, margin: 0 });
  } catch {
    return null;
  }
}

/**
 * Draws a branded header (Litu Diagnostics logo + org name + report title)
 * at the top of the current jsPDF page. Returns the Y offset the caller
 * should start writing at.
 */
export async function drawBrandHeader(
  doc: jsPDF,
  opts: { title: string; accent?: [number, number, number] } = { title: "Report" },
): Promise<number> {
  const w = doc.internal.pageSize.getWidth();
  const accent = opts.accent ?? [30, 90, 168];

  // Top color band
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, w, 26, "F");

  // Logo
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", 10, 4, 18, 18); } catch { /* ignore */ }
  }

  // Org name
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text(ORG_NAME.toUpperCase(), 32, 12);
  doc.setFont("helvetica", "italic").setFontSize(8);
  doc.text(ORG_TAGLINE, 32, 17);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  doc.text(ORG_ADDRESS, 32, 22);

  // Right side: title
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(opts.title.toUpperCase(), w - 10, 14, { align: "right" });

  doc.setTextColor(0, 0, 0);
  return 34;
}

/**
 * Draws a verification QR + short caption near the bottom-right of the
 * current page. `verifyUrl` should be a URL the reader can scan to
 * confirm authenticity of this document (e.g. /verify/<kind>/<id>).
 */
export async function drawVerifyQR(
  doc: jsPDF,
  verifyUrl: string,
  label = "Scan to verify authenticity",
): Promise<void> {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const dataUrl = await qrDataUrl(verifyUrl, 128);
  const size = 26; // mm
  const x = w - size - 12;
  const y = h - size - 18;
  if (dataUrl) {
    try { doc.addImage(dataUrl, "PNG", x, y, size, size); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(90);
  doc.text(label, x + size / 2, y + size + 4, { align: "center" });
  doc.setFontSize(6.5).setTextColor(120);
  const short = verifyUrl.length > 44 ? verifyUrl.slice(0, 41) + "…" : verifyUrl;
  doc.text(short, x + size / 2, y + size + 8, { align: "center" });
  doc.setTextColor(0);
}

/** Site origin used to build verification URLs. */
export function siteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://litudiagnostics.app";
}
