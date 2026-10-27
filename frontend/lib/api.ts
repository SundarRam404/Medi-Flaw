export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken(): string | null {
  try {
    return localStorage.getItem("pa_token");
  } catch {
    return null;
  }
}

export function getUser(): any {
  try {
    return JSON.parse(localStorage.getItem("pa_user") || "null");
  } catch {
    return null;
  }
}

export function saveLogin(token: string, user: any) {
  try {
    localStorage.setItem("pa_token", token);
    localStorage.setItem("pa_user", JSON.stringify(user));
  } catch {}
  window.dispatchEvent(new Event("pa-auth"));
}

export function logout() {
  try {
    localStorage.removeItem("pa_token");
    localStorage.removeItem("pa_user");
  } catch {}
  window.dispatchEvent(new Event("pa-auth"));
}

export async function api(path: string, opts: RequestInit = {}) {
  const headers: any = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...opts, headers, cache: "no-store" });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running on port 8000?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) logout();
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong");
  }
  return data;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function month(d?: string | null, long = false) {
  if (!d) return "-";
  const [y, m] = d.split("-");
  return `${(long ? MONTHS_LONG : MONTHS)[Number(m) - 1]} ${y}`;
}

export function dateTime(d?: string | null) {
  if (!d) return "-";
  const x = new Date(d.endsWith("Z") ? d : d + "Z");
  return x.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const fmt = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-IN"));

export function looksLikeBatch(q: string) {
  const s = q.trim();
  return /\d/.test(s) && /^[A-Za-z0-9\-\/.]{3,25}$/.test(s);
}
