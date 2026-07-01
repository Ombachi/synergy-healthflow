import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export function renderBarcode(el: SVGElement | null, value: string, opts?: Partial<JsBarcode.Options>) {
  if (!el || !value) return;
  try {
    JsBarcode(el, value, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 0,
      ...opts,
    });
  } catch {
    /* ignore invalid values */
  }
}

export async function renderQR(canvas: HTMLCanvasElement | null, value: string, size = 160) {
  if (!canvas || !value) return;
  try {
    await QRCode.toCanvas(canvas, value, { width: size, margin: 1 });
  } catch {
    /* ignore */
  }
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
