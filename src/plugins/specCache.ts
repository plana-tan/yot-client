import { TrackingPluginSpecSchema, type TrackingPluginSpec } from '@/plugins/schema';
import { persistStorage } from '@/store/storage';

export const PLUGIN_SPEC_CACHE_KEY = 'yot.plugin-specs.cache.v1';

interface PluginSpecCacheSnapshot {
  version: 1;
  specs: Record<string, unknown>;
}

let epoch = 0;
let cacheWrite: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readSnapshot(): Promise<PluginSpecCacheSnapshot | null> {
  try {
    const raw = await persistStorage.getItem(PLUGIN_SPEC_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.specs)) return null;
    return { version: 1, specs: parsed.specs };
  } catch {
    return null;
  }
}

export function pluginSpecCacheEpoch(): number {
  return epoch;
}

export async function readCachedPluginSpec(id: string): Promise<TrackingPluginSpec | null> {
  await cacheWrite;
  const snapshot = await readSnapshot();
  const parsed = TrackingPluginSpecSchema.safeParse(snapshot?.specs[id]);
  if (!parsed.success || parsed.data.id !== id) return null;
  return parsed.data;
}

export function writeCachedPluginSpec(
  id: string,
  spec: TrackingPluginSpec,
  expectedEpoch: number,
): Promise<void> {
  cacheWrite = cacheWrite
    .then(async () => {
      if (expectedEpoch !== epoch) return;
      const previous = await readSnapshot();
      if (expectedEpoch !== epoch) return;
      const snapshot: PluginSpecCacheSnapshot = {
        version: 1,
        specs: { ...(previous?.specs ?? {}), [id]: spec },
      };
      await persistStorage.setItem(PLUGIN_SPEC_CACHE_KEY, JSON.stringify(snapshot));
    })
    .catch(() => {
      // A full or unavailable store must not hide a valid network response.
    });
  return cacheWrite;
}

export function clearPluginSpecCache(): Promise<void> {
  epoch += 1;
  cacheWrite = cacheWrite
    .then(() => persistStorage.removeItem(PLUGIN_SPEC_CACHE_KEY))
    .catch(() => {
      // Session teardown continues even if local storage is unavailable.
    });
  return cacheWrite;
}

export function whenPluginSpecCacheSettled(): Promise<void> {
  return cacheWrite;
}
