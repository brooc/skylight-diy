import { recordApiPerformance } from "../diagnostics/ui-performance";

const API_BASE = "/api";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const hasBody = typeof init?.body !== "undefined" && init.body !== null;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers,
    });
  } catch (error) {
    recordApiPerformance(
      path,
      init?.method ?? "GET",
      performance.now() - startedAt,
    );
    throw error;
  }
  recordApiPerformance(
    path,
    init?.method ?? "GET",
    performance.now() - startedAt,
    response.status,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
