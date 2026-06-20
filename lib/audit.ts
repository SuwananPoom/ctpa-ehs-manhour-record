"use client";

import { SITE_ID, supabase } from "./supabaseClient";
import type { Session } from "./types";

export async function logAudit(
  session: Session | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: string,
) {
  try {
    await supabase.from("mh_audit_log").insert({
      site: SITE_ID,
      who: session?.name || "anonymous",
      role: session?.role || null,
      action,
      entity,
      entity_id: entityId,
      detail: detail || null,
      device:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null,
    });
  } catch {
    // Audit logging must never block the primary action.
  }
}
