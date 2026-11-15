// Reads text from a photo in the browser (nothing is uploaded). Tesseract is loaded only when needed.
declare global { interface Window { Tesseract: any } }

export function loadOCR(): Promise<any> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => rej(new Error("Could not load the photo reader. Check the internet connection."));
    document.body.appendChild(s);
  });
}

const SKIP = /^(MFG|MFD|EXP|EXPIRY|MRP|RS|INR|USP|IP|BP|TABLETS?|CAPSULES?|MG|ML|GM|LIC|DL|NO|BATCH|LOT|DATE)$/;

// Finds likely batch numbers in text read from a medicine strip.
export function batchCandidates(text: string): string[] {
  const t = (text || "").toUpperCase().replace(/[|]/g, "I");
  const out: string[] = [];
  const add = (x: string) => {
    const v = x.replace(/[^A-Z0-9\-]/g, "").replace(/^-+|-+$/g, "");
    if (v.length >= 3 && v.length <= 16 && /\d/.test(v) && !SKIP.test(v) && !out.includes(v)) out.push(v);
  };
  const labelled = /(?:B\.?\s*NO|BATCH\s*(?:NO|NUMBER)?|LOT\s*(?:NO)?|B\.?\s*N)\s*[.:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,15})/g;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(t))) add(m[1]);
  const loose = /\b(?=[A-Z0-9\-]*\d)(?=[A-Z0-9\-]*[A-Z])[A-Z0-9\-]{4,14}\b/g;
  while ((m = loose.exec(t)) && out.length < 6) add(m[0]);
  return out.slice(0, 6);
}
