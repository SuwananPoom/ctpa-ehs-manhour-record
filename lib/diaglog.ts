"use client";

// Lightweight in-memory log ring buffer for the Diagnostics page.
// Captures console errors/warnings and uncaught errors. Does NOT touch
// any existing functionality — it only observes.

export type DiagLevel = "error" | "warning" | "info";
export interface DiagEntry {
  ts: string;
  level: DiagLevel;
  source: string;
  message: string;
}

const MAX = 100;
const buffer: DiagEntry[] = [];
let installed = false;

export function pushLog(level: DiagLevel, source: string, message: string) {
  buffer.unshift({ ts: new Date().toISOString(), level, source, message: String(message).slice(0, 500) });
  if (buffer.length > MAX) buffer.length = MAX;
}

export function getLogs(): DiagEntry[] {
  return [...buffer];
}

export function clearLogs() {
  buffer.length = 0;
}

/** Idempotent — patches console + window error listeners to record into the buffer. */
export function installDiagLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    pushLog("error", "console", args.map(String).join(" "));
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushLog("warning", "console", args.map(String).join(" "));
    origWarn(...args);
  };

  window.addEventListener("error", (e) => {
    pushLog("error", "window", e.message || "Unknown error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    pushLog("error", "promise", String((e as PromiseRejectionEvent).reason));
  });
}
