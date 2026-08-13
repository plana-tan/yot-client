/**
 * Client-side plugin "install" state, persisted to AsyncStorage.
 *
 * `added` holds full metadata for the plugins the user has selected (from the
 * server list, or onboarding), so titles are available offline. Built-in
 * segments (Ask, …) are always known and tracked by `hiddenBuiltIns`: a
 * built-in is shown unless its id is in that list. The feed's segmented control
 * renders one segment per visible built-in plus one per added plugin.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PluginMeta } from '@/plugins/schema';
import { persistStorage } from '@/store/storage';

export interface PluginsState {
  added: PluginMeta[];
  hiddenBuiltIns: string[];
}

export interface PluginsActions {
  add: (meta: PluginMeta) => void;
  remove: (id: string) => void;
  toggle: (meta: PluginMeta) => void;
  toggleBuiltIn: (id: string) => void;
}

export type PluginsStore = PluginsState & PluginsActions;

export const PLUGINS_STORAGE_KEY = 'yot.plugins.v1';

export const usePlugins = create<PluginsStore>()(
  persist(
    (set) => ({
      added: [],
      hiddenBuiltIns: [],

      add: (meta) =>
        set((s) => (s.added.some((a) => a.id === meta.id) ? s : { added: [...s.added, meta] })),

      remove: (id) => set((s) => ({ added: s.added.filter((a) => a.id !== id) })),

      toggle: (meta) =>
        set((s) =>
          s.added.some((a) => a.id === meta.id)
            ? { added: s.added.filter((a) => a.id !== meta.id) }
            : { added: [...s.added, meta] },
        ),

      toggleBuiltIn: (id) =>
        set((s) => ({
          hiddenBuiltIns: s.hiddenBuiltIns.includes(id)
            ? s.hiddenBuiltIns.filter((b) => b !== id)
            : [...s.hiddenBuiltIns, id],
        })),
    }),
    {
      name: PLUGINS_STORAGE_KEY,
      storage: createJSONStorage(() => persistStorage),
      version: 1,
    },
  ),
);
