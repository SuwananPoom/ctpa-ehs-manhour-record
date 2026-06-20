"use client";

import { createClient } from "@supabase/supabase-js";

// These are PUBLIC client credentials. Access is governed by Row Level Security.
// Falls back to the known project values so the app works even if env vars are
// not configured on the host.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocwdnvblpjfzkgzratqb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_4Vm__otNg0T3iEV8_ni43Q_vhA1-_tt";

export const SITE_ID = process.env.NEXT_PUBLIC_SITE_ID || "bkk22";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 2 } },
});
