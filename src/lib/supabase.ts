import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client using the publishable key (safe for the browser; access is governed by RLS).
 * Returns null when the env vars are not set, so callers can fall back gracefully.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
