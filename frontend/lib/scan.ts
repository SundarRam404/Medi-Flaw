// One "Scan" for medicine strips: first the QR / DataMatrix code (exact), then the printed text (OCR).
// Everything runs in the browser; the photo is never uploaded.
import { loadOCR, batchCandidates } from "@/lib/ocr";

declare global { interface Window { jsQR?: any; BarcodeDetector?: any } }

export type ScanResult = {
  batch?: string; name?: string; maker?: string; expiry?: string; url?: string;
  candidates: string[]; how: "code" | "text" | "none"; raw?: string;
};

function loadJsQR(): Promise<any> {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/vendor/jsqr.js";
    s.onload = () => res(window.jsQR);
    s.onerror = () => rej(new Error("Could not load the QR reader"));
    document.body.appendChild(s);
  });
}

async function toCanvas(file: File, max = 1600): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not open the photo")); i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

// Reads QR codes, and also DataMatrix / barcodes where the browser supports it (Chrome on Android and Mac).
export async function readCode(file: File): Promise<string | null> {
  const canvas = await toCanvas(file);
  if (window.BarcodeDetector) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.() ?? ["qr_code"];
      const det = new window.BarcodeDetector({ formats: formats.filter((f: string) => ["qr_code", "data_matrix", "code_128", "aztec"].includes(f)) });
      const found = await det.detect(canvas);
      if (found?.length) return found[0].rawValue as string;
    } catch { /* fall back to jsQR */ }
  }
  const jsQR = await loadJsQR();
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" });
  return r?.data || null;
}

const GS = "\u001d";
// GS1 codes, e.g. "(01)08901234567890(17)270430(10)AB1234" or the raw form with separators.
function parseGS1(t: string): Partial<ScanResult> | null {
  let s = t.trim().replace(/^\]([A-Za-z]\d)/, ""); // drop symbology prefix like ]d2 / ]Q3
  if (/\(\d{2,4}\)/.test(s)) {
    const out: any = {};
    for (const m of Array.from(s.matchAll(/\((\d{2,4})\)([^(]*)/g))) {
      if (m[1] === "10") out.batch = m[2].trim();
      if (m[1] === "17") out.expiry = m[2].trim();
    }
    return out.batch ? out : null;
  }
  if (!/^01\d{14}/.test(s)) return null;
  const out: any = {};
  let i = 0;
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (ai === "01") { i += 16; continue; }
    if (ai === "17" || ai === "11" || ai === "15") { if (ai === "17") out.expiry = s.slice(i + 2, i + 8); i += 8; continue; }
    if (ai === "10" || ai === "21") {
      const end = s.indexOf(GS, i + 2);
      const val = s.slice(i + 2, end === -1 ? undefined : end);
      if (ai === "10") out.batch = val;
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    break; // unknown AI: stop safely
  }
  return out.batch ? out : null;
}

// Plain-text codes printed by Indian makers, e.g. "Brand: X / Batch No.: AB123 / Mfd by: Y".
function parseText(t: string): Partial<ScanResult> {
  const pick = (re: RegExp) => { const m = t.match(re); return m ? m[1].trim().replace(/[;,|]+$/, "") : undefined; };
  return {
    batch: pick(/(?:batch\s*(?:no|number)?|b\.?\s*no|lot\s*(?:no)?)[\s.:#\-]*([A-Z0-9][A-Z0-9\-\/]{2,19})/i),
    name: pick(/brand(?:\s*name)?\s*[:\-]\s*([^\n;|]{2,60})/i) || pick(/product(?:\s*name)?\s*[:\-]\s*([^\n;|]{2,60})/i)
      || pick(/generic(?:\s*name)?\s*[:\-]\s*([^\n;|]{2,60})/i),
    maker: pick(/(?:mfd\.?\s*by|manufactured\s*by|manufacturer(?:\s*name)?|mkd\.?\s*by)\s*[:\-]?\s*([^\n;|]{2,80})/i),
    expiry: pick(/(?:exp(?:iry)?\.?\s*(?:date|dt)?)\s*[.:\-]?\s*([0-9]{1,2}[\/\-.][0-9]{2,4})/i),
  };
}

export function parseDrugCode(raw: string): Partial<ScanResult> {
  const t = (raw || "").trim();
  const gs1 = parseGS1(t);
  if (gs1) return gs1;
  if (/^https?:\/\//i.test(t)) {
    // some makers put a link; a few links carry the batch as a parameter
    try {
      const u = new URL(t);
      for (const k of ["batch", "batchno", "batch_no", "bno", "lot"]) {
        const v = u.searchParams.get(k) || u.searchParams.get(k.toUpperCase());
        if (v) return { batch: v, url: t };
      }
    } catch { /* not a valid link */ }
    return { url: t };
  }
  return parseText(t);
}

// The whole scan: code first, then text. onStatus shows progress to the user.
export async function scanMedicine(file: File, onStatus: (s: string) => void): Promise<ScanResult> {
  onStatus("Looking for a QR code...");
  try {
    const raw = await readCode(file);
    if (raw) {
      const p = parseDrugCode(raw);
      if (p.batch) return { ...p, candidates: [p.batch], how: "code", raw };
      if (p.url) return { ...p, candidates: [], how: "code", raw };
    }
  } catch { /* no code: read the text instead */ }
  onStatus("No QR code found. Reading the printed text (10-20 seconds)...");
  const T = await loadOCR();
  const r = await T.recognize(file, "eng");
  const c = batchCandidates(r.data.text || "");
  return { candidates: c, batch: c.length === 1 ? c[0] : undefined, how: c.length ? "text" : "none" };
}
