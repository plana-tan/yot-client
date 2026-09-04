import { clearSession } from '@/api/session';
import { clearPluginSpecCache } from '@/plugins/specCache';
import { useEvents } from '@/store/events';
import { useSettings } from '@/store/settings';

/** Remove every server-scoped local trace after disconnect or authorization loss. */
export async function clearLocalSessionData(): Promise<void> {
  await clearSession();
  await Promise.all([useEvents.getState().clear(), clearPluginSpecCache()]);
  useSettings.getState().reset();
}
