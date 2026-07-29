type DiagnosticKind = "interaction" | "long-task" | "api";

type DiagnosticEvent = {
  kind: DiagnosticKind;
  at: number;
  route: string;
  action?: string;
  durationMs?: number;
  method?: string;
  status?: number;
};

const STORAGE_KEY = "daymark_ui_diagnostics";
const ENABLE_QUERY_PARAMETER = "daymarkDiagnostics";
const FLUSH_INTERVAL_MS = 2_000;
const MAX_BATCH_SIZE = 40;
const MAX_QUEUED_EVENTS = 200;

let installed = false;
let observersInstalled = false;
let enabled = false;
let flushTimer: number | undefined;
let queue: DiagnosticEvent[] = [];
let sessionId = "";

function normalizedRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":number";
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      return segment;
    })
    .join("/")
    .slice(0, 160);
}

function currentRoute(): string {
  return normalizedRoute(window.location.pathname);
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function diagnosticsRequested(): boolean {
  const query = new URLSearchParams(window.location.search).get(
    ENABLE_QUERY_PARAMETER,
  );
  if (query === "1") {
    localStorage.setItem(STORAGE_KEY, "1");
    return true;
  }
  if (query === "0") {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function actionForTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "unknown";
  const interactive = target.closest<HTMLElement>(
    "[data-diagnostic-action],a,button,input,select,textarea,[role='button']",
  );
  if (!interactive) return target.tagName.toLowerCase();

  const explicitAction = interactive.dataset.diagnosticAction;
  if (explicitAction) return explicitAction.slice(0, 120);

  if (interactive instanceof HTMLAnchorElement) {
    const url = new URL(interactive.href, window.location.href);
    if (url.origin === window.location.origin) {
      return `navigate:${normalizedRoute(url.pathname)}`;
    }
    return "navigate:external";
  }

  if (
    interactive instanceof HTMLInputElement ||
    interactive instanceof HTMLSelectElement ||
    interactive instanceof HTMLTextAreaElement
  ) {
    const inputType =
      interactive instanceof HTMLInputElement
        ? interactive.type
        : interactive.tagName.toLowerCase();
    return `input:${inputType}`;
  }

  const dialog = interactive.closest<HTMLElement>("[role='dialog']");
  return dialog ? "button:dialog" : "button";
}

function scheduleFlush(): void {
  if (flushTimer !== undefined || !enabled) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function record(event: DiagnosticEvent): void {
  if (!enabled) return;
  queue.push(event);
  if (queue.length > MAX_QUEUED_EVENTS) {
    queue = queue.slice(-MAX_QUEUED_EVENTS);
  }
  if (queue.length >= MAX_BATCH_SIZE) {
    void flush();
  } else {
    scheduleFlush();
  }
}

async function flush(): Promise<void> {
  if (!enabled || queue.length === 0) return;
  const events = queue.splice(0, MAX_BATCH_SIZE);
  try {
    const response = await fetch("/api/system/diagnostics/events", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, events }),
      keepalive: true,
    });
    if (!response.ok) throw new Error("diagnostics_unavailable");
  } catch {
    // Diagnostics must never interfere with the UI. A failed batch is discarded.
  }
  if (queue.length > 0) scheduleFlush();
}

function observeInteractions(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (!enabled || !event.isTrusted) return;
      const startedAt = performance.now();
      const action = actionForTarget(event.target);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          record({
            kind: "interaction",
            at: Date.now(),
            route: currentRoute(),
            action,
            durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
          });
        });
      });
    },
    true,
  );
}

function observeLongTasks(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record({
          kind: "long-task",
          at: Math.round(performance.timeOrigin + entry.startTime),
          route: currentRoute(),
          durationMs: Math.round(entry.duration * 10) / 10,
        });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Older browsers can omit the long-task performance entry type.
  }
}

function startObservers(): void {
  if (observersInstalled) return;
  observersInstalled = true;
  sessionId = createSessionId();
  observeInteractions();
  observeLongTasks();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}

export function installUiPerformanceDiagnostics(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  enabled = diagnosticsRequested();
  if (enabled) startObservers();
}

export function uiPerformanceDiagnosticsEnabled(): boolean {
  return enabled;
}

export function setUiPerformanceDiagnosticsEnabled(nextEnabled: boolean): void {
  if (nextEnabled) {
    localStorage.setItem(STORAGE_KEY, "1");
    enabled = true;
    startObservers();
    return;
  }

  void flush();
  localStorage.removeItem(STORAGE_KEY);
  enabled = false;
  if (flushTimer !== undefined) {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}

export function recordApiPerformance(
  path: string,
  method: string,
  durationMs: number,
  status?: number,
): void {
  record({
    kind: "api",
    at: Date.now(),
    route: normalizedRoute(path.split("?")[0] || "/"),
    action: method.toUpperCase(),
    durationMs: Math.round(durationMs * 10) / 10,
    ...(typeof status === "number" ? { status } : {}),
  });
}
