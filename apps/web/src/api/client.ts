const API_BASE = "/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = typeof init?.body !== "undefined" && init.body !== null;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined)
  };

  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    credentials: "include",
    headers,
    ...init
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
