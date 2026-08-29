import { Linking } from 'react-native';

import { ask } from '@/api/client';
import type { ActionDef, TrackingPluginSpec } from '@/plugins/schema';
import type { TrackingItem } from '@/store/tracking';

/**
 * Resolve a spec's `actions` map into runnable handlers for the render
 * context. TrackingView passes its own `openItem`; the detail screen passes
 * one that re-routes to the target item.
 *
 * Kinds (spec §5):
 * - openItem — navigate to the bound item's detail (handler supplied by host)
 * - openUrl  — open `params.url` via Linking
 * - callAsk  — POST /api/ask; `params.query` templates the item title by default
 * - notify   — local notification (`when`/`minutesBefore`); v1: scheduled
 *              immediately at the computed fire time via expo-notifications
 * - toggleState — flips a boolean in the item's per-plugin local state
 */
export type ActionHandlers = Record<string, { run: () => void }>;

export function resolveActions(
  spec: TrackingPluginSpec,
  item: TrackingItem,
  opts: { openItem?: (id: string) => void } = {},
): ActionHandlers {
  const handlers: ActionHandlers = {};
  const actions = spec.actions;
  if (!actions) return handlers;

  const forKind = (key: string, def: ActionDef) => {
    const params = (def.params ?? {}) as Record<string, unknown>;
    switch (def.kind) {
      case 'openItem':
        if (opts.openItem) handlers[key] = { run: () => opts.openItem!(item.id) };
        break;
      case 'openUrl': {
        const url = typeof params.url === 'string' ? params.url : undefined;
        if (url) handlers[key] = { run: () => void Linking.openURL(url) };
        break;
      }
      case 'callAsk': {
        const template = typeof params.query === 'string' ? params.query : '{{item.title}}';
        handlers[key] = {
          run: () => {
            void ask(template.replace(/\{\{\s*item\.(\w+)\s*\}\}/g, (_m, f: string) => String((item as unknown as Record<string, unknown>)[f] ?? '')));
          },
        };
        break;
      }
      case 'notify': {
        handlers[key] = { run: () => scheduleNotification(item, params) };
        break;
      }
      case 'toggleState': {
        const field = typeof params.field === 'string' ? params.field : undefined;
        if (field) handlers[key] = { run: () => toggleItemState(spec.id, item.id, field) };
        break;
      }
    }
  };

  for (const [key, def] of Object.entries(actions)) forKind(key, def);
  return handlers;
}

/* ---- notify (local notifications) ---- */
/* expo-notifications is not (yet) a dependency; keep the dynamic import so the
 * action becomes a no-op instead of a hard crash until it is added. */

async function scheduleNotification(item: TrackingItem, params: Record<string, unknown>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Notifications: any = await import('expo-notifications' as string).catch(() => null);
    if (!Notifications?.scheduleNotificationAsync) return;
    const when = params.when === 'start' || params.when === 'beforeStart' ? params.when : 'now';
    const minutesBefore = typeof params.minutesBefore === 'number' ? params.minutesBefore : 0;
    let trigger: unknown;
    if (when === 'now') {
      trigger = { seconds: 1 };
    } else if (item.start) {
      const fire = new Date(item.start.getTime() - minutesBefore * 60_000);
      trigger = { date: fire };
    } else {
      return; // nothing to anchor a scheduled notification to
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.desc },
      trigger,
    });
  } catch {
    // Notifications unavailable (e.g. tests, permission denied) — no-op.
  }
}

/* ---- toggleState (per-plugin local item state, persisted) ---- */

const STATE_KEY = 'yot.pluginItemState.v1';

export async function readItemState(
  pluginId: string,
  itemId: string,
): Promise<Record<string, boolean>> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Record<string, Record<string, boolean>>>) : {};
    return all[pluginId]?.[itemId] ?? {};
  } catch {
    return {};
  }
}

async function toggleItemState(pluginId: string, itemId: string, field: string) {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Record<string, Record<string, boolean>>>) : {};
    const plugin = (all[pluginId] ??= {});
    const item = (plugin[itemId] ??= {});
    item[field] = !item[field];
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable — no-op
  }
}
