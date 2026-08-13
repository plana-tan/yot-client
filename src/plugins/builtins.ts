import type { PluginMeta } from '@/plugins/schema';

/**
 * Built-in feed segments that render app-native views rather than a plugin
 * spec. They appear in the onboarding / settings picker alongside real plugins
 * and can be toggled off, which hides their feed segment. The Feed segment
 * itself is always-on and therefore not listed here.
 */
export const BUILTIN_SEGMENTS: PluginMeta[] = [
  { id: 'ask', title: 'Ask', description: 'Ask questions about your schedule', version: 1 },
];
