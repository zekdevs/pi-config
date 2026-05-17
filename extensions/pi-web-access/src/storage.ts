import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { CachedResponse, CachedUrlEntry } from "./types.ts";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CACHE_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), "cache");

async function ensureDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

export async function cleanupOldEntries(): Promise<void> {
  try {
    await ensureDir();
    const files = await readdir(CACHE_DIR);
    const cutoff = Date.now() - MAX_AGE_MS;
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const full = join(CACHE_DIR, f);
          try {
            const s = await stat(full);
            if (s.mtimeMs < cutoff) await unlink(full);
          } catch {
            /* ignore */
          }
        }),
    );
  } catch {
    /* ignore */
  }
}

export async function saveResponse(tool: string, entries: CachedUrlEntry[]): Promise<string> {
  await ensureDir();
  const responseId = `res_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const payload: CachedResponse = {
    responseId,
    createdAt: Date.now(),
    tool,
    entries,
  };
  await writeFile(join(CACHE_DIR, `${responseId}.json`), JSON.stringify(payload), "utf-8");
  return responseId;
}

export async function loadResponse(responseId: string): Promise<CachedResponse | null> {
  if (!/^res_[A-Za-z0-9_-]+$/.test(responseId)) return null;
  try {
    const raw = await readFile(join(CACHE_DIR, `${responseId}.json`), "utf-8");
    return JSON.parse(raw) as CachedResponse;
  } catch {
    return null;
  }
}
