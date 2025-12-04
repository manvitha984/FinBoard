export type ApiResult =
  | { ok: true; data: any }
  | { ok: false; status?: number; message: string };

export async function fetchJson(url: string, init?: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRateLimit = res.status === 429 || /rate limit/i.test(text);
      return {
        ok: false,
        status: res.status,
        message: isRateLimit ? "API limit reached. Try again later." : `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    return { ok: true, data: json };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error" };
  }
}