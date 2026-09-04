import { clearSession } from '@/api/session';
import { clearPluginSpecCache } from '@/plugins/specCache';
import { useEvents } from '@/store/events';
import { useSettings } from '@/store/settings';

/** Remove every server-scoped local trace after disconnect or authorization loss. */
export async function clearLocalSessionData(): Promise<void> {
  // Teardown is best-effort per store: one unavailable backend must not prevent
  // the remaining private data from being erased or the UI from signing out.
  await Promise.allSettled([
    clearSession(),
    useEvents.getState().clear(),
    clearPluginSpecCache(),
  ]);
  useSettings.getState().reset();
}
