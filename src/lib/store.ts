import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Diagram } from "./types";
import { supabase } from "./supabase";

/**
 * Minimal file-backed store for share links (E3) and feedback. Swap for PostgreSQL in
 * production (System architecture). Only diagram JSON is stored — never source code.
 */
const DATA_DIR = process.env.CV_DATA_DIR ?? (process.env.VERCEL ? "/tmp/codeatlasx" : path.join(process.cwd(), ".data"));

/**
 * Serverless hosts (Vercel) have no persistent disk, so stored share links would vanish.
 * There the client falls back to self-contained links (see shareCodec.ts) unless
 * CV_DATA_DIR points at durable storage.
 */
export const persistentShares = !process.env.VERCEL || !!process.env.CV_DATA_DIR;
const SHARE_DIR = path.join(DATA_DIR, "shares");
export const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ShareRecord {
  id: string;
  diagram: Diagram;
  createdAt: string;
  expiresAt: string;
}

export async function createShare(diagram: Diagram): Promise<ShareRecord> {
  await fs.mkdir(SHARE_DIR, { recursive: true });
  const id = randomBytes(12).toString("base64url");
  const now = Date.now();
  const rec: ShareRecord = { id, diagram, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SHARE_TTL_MS).toISOString() };
  await fs.writeFile(path.join(SHARE_DIR, `${id}.json`), JSON.stringify(rec));
  return rec;
}

export async function getShare(id: string): Promise<ShareRecord | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  try {
    const rec = JSON.parse(await fs.readFile(path.join(SHARE_DIR, `${id}.json`), "utf8")) as ShareRecord;
    if (Date.parse(rec.expiresAt) < Date.now()) {
      await fs.rm(path.join(SHARE_DIR, `${id}.json`), { force: true });
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

export async function appendFeedback(entry: Record<string, unknown>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(path.join(DATA_DIR, "feedback.jsonl"), JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

/**
 * Visitor counter. On serverless hosts the file store is ephemeral, so it uses Supabase
 * (site_stats table + visit_count RPC, see supabase/migrations) or Upstash Redis when
 * configured; otherwise a local file.
 * Returns null when no durable storage is available, so the UI can hide the counter.
 */
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const VISITS_KEY = "codeatlasx:visitors";

export async function countVisit(increment: boolean): Promise<number | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc("visit_count", { increment });
    if (error) throw new Error(`Supabase visit_count failed: ${error.message}`);
    return Number(data);
  }
  if (REDIS_URL && REDIS_TOKEN) {
    const cmd = increment ? `incr/${VISITS_KEY}` : `get/${VISITS_KEY}`;
    const res = await fetch(`${REDIS_URL.replace(/\/$/, "")}/${cmd}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { result } = (await res.json()) as { result: number | string | null };
    return Number(result ?? 0);
  }
  if (!persistentShares) return null;
  const file = path.join(DATA_DIR, "visitors.json");
  let count = 0;
  try {
    count = Number((JSON.parse(await fs.readFile(file, "utf8")) as { count: number }).count) || 0;
  } catch {}
  if (increment) {
    count += 1;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ count }));
  }
  return count;
}
