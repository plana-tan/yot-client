import { getJSON } from '@/api/client';
import { buildDefaultSpec, DEFAULT_SPEC_ID } from '@/plugins/defaultSpec';
import {
  PluginMetaSchema,
  TrackingPluginSpecSchema,
  type Franchise,
  type PluginMeta,
  type TrackingPluginSpec,
} from '@/plugins/schema';
import type { TrackingItem } from '@/store/tracking';

/**
 * Fetch the tracking spec from yot-server (`GET /api/plugins/<id>`), validate
 * it, and fall back to the bundled default on any failure (offline, bad payload,
 * unauthenticated). `now` anchors the demo data when the default is used.
 */
export async function loadPluginSpec(id: string, now: Date = new Date()): Promise<TrackingPluginSpec> {
  try {
    const raw = await getJSON(`/plugins/${encodeURIComponent(id)}`);
    return TrackingPluginSpecSchema.parse(raw);
  } catch {
    return buildDefaultSpec(now);
  }
}

/** List the plugin metadata the server exposes (`GET /api/plugins`). */
export async function listPlugins(): Promise<PluginMeta[]> {
  try {
    const raw = (await getJSON('/plugins')) as { plugins?: unknown } | null;
    if (raw && Array.isArray(raw.plugins)) {
      const metas: PluginMeta[] = [];
      for (const p of raw.plugins) {
        const parsed = PluginMetaSchema.safeParse(p);
        if (parsed.success) metas.push(parsed.data);
      }
      return metas;
    }
  } catch {
    // fall through to the offline default
  }
  const d = buildDefaultSpec();
  return [{ id: d.id, title: d.title, description: d.description, version: d.version }];
}

/** Resolved plugin data — items with real `Date` objects (and extra fields). */
export interface ResolvedTrackingData {
  franchises: Franchise[];
  items: TrackingItem[];
}

/**
 * Turn a spec's inline `data` into renderable items. Extra item fields (e.g.
 * `round`, `totalRounds`) are preserved so derive hooks like `index` can read
 * them.
 */
export function resolveSpecData(spec: TrackingPluginSpec): ResolvedTrackingData {
  return {
    franchises: spec.data.franchises.map((f) => ({ ...f })),
    items: spec.data.items.map((raw) => {
      const { start, end, ...rest } = raw as Record<string, unknown> & {
        start: string | null;
        end: string | null;
      };
      return {
        ...rest,
        start: start ? new Date(start) : null,
        end: end ? new Date(end) : null,
      } as unknown as TrackingItem;
    }),
  };
}
