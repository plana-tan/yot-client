jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/client', () => ({ getJSON: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getJSON } from '@/api/client';
import { f12026Spec } from '@/plugins/examples/f1-2026';
import { listPlugins, loadPluginSpec, resolveSpecData } from '@/plugins/loader';
import {
  PLUGIN_SPEC_CACHE_KEY,
  clearPluginSpecCache,
  whenPluginSpecCacheSettled,
} from '@/plugins/specCache';
import type { TrackingPluginSpec } from '@/plugins/schema';

function makeSpec(id: string, version = 1, title = id): TrackingPluginSpec {
  return {
    id,
    title,
    description: `${id} plugin`,
    version,
    data: {
      franchises: [{ name: 'ANA', abbr: 'ANA', color: '#0066B3' }],
      items: [
        {
          id: `${id}-item`,
          title: 'HND → LHR',
          franchise: 'ANA',
          type: 'flight',
          start: '2026-09-04T10:00:00Z',
          end: '2026-09-04T14:00:00Z',
          desc: 'NH211',
        },
      ],
    },
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await clearPluginSpecCache();
  await AsyncStorage.clear();
});

describe('loadPluginSpec', () => {
  it('returns the server spec when valid', async () => {
    (getJSON as jest.Mock).mockResolvedValue({
      id: 'server-spec',
      title: 'Server Spec',
      description: 'A server-provided spec.',
      version: 1,
      data: { franchises: [], items: [] },
    });
    const spec = await loadPluginSpec('server-spec');
    expect(spec.id).toBe('server-spec');
  });

  it('falls back to the default spec on failure', async () => {
    (getJSON as jest.Mock).mockRejectedValue(new Error('network'));
    const spec = await loadPluginSpec('x', new Date('2026-07-28T15:30:00'));
    expect(spec.id).toBe('tracking-demo');
  });

  it('falls back to the default spec on an invalid payload', async () => {
    (getJSON as jest.Mock).mockResolvedValue({ id: 42 });
    const spec = await loadPluginSpec('x');
    expect(spec.id).toBe('tracking-demo');
  });

  it('caches a valid server spec', async () => {
    (getJSON as jest.Mock).mockResolvedValue(makeSpec('flight-manager', 7, 'Flights'));

    await expect(loadPluginSpec('flight-manager')).resolves.toMatchObject({
      id: 'flight-manager',
      version: 7,
    });
    await whenPluginSpecCacheSettled();

    const raw = await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY);
    expect(JSON.parse(String(raw))).toMatchObject({
      version: 1,
      specs: { 'flight-manager': { id: 'flight-manager', version: 7 } },
    });
  });

  it('returns a matching cached spec with its items when the network fails', async () => {
    const online = makeSpec('flight-manager', 7, 'Flights');
    (getJSON as jest.Mock)
      .mockResolvedValueOnce(online)
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await loadPluginSpec('flight-manager');
    const offline = await loadPluginSpec('flight-manager');

    expect(offline).toEqual(online);
    expect(offline.data.items[0]).toMatchObject({ title: 'HND → LHR', desc: 'NH211' });
  });

  it('replaces one cached plugin while preserving other plugin ids', async () => {
    (getJSON as jest.Mock)
      .mockResolvedValueOnce(makeSpec('flight-manager', 7))
      .mockResolvedValueOnce(makeSpec('f1-2026', 1))
      .mockResolvedValueOnce(makeSpec('flight-manager', 8, 'Updated Flights'));

    await loadPluginSpec('flight-manager');
    await loadPluginSpec('f1-2026');
    await loadPluginSpec('flight-manager');
    await whenPluginSpecCacheSettled();

    const snapshot = JSON.parse(String(await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY)));
    expect(snapshot.specs['flight-manager']).toMatchObject({ version: 8, title: 'Updated Flights' });
    expect(snapshot.specs['f1-2026']).toMatchObject({ version: 1 });
  });

  it.each([
    ['corrupt JSON', '{not-json'],
    ['schema-invalid entry', JSON.stringify({ version: 1, specs: { x: { id: 42 } } })],
    ['wrong internal id', JSON.stringify({ version: 1, specs: { x: makeSpec('other') } })],
  ])('ignores %s in the cache', async (_label, raw) => {
    await AsyncStorage.setItem(PLUGIN_SPEC_CACHE_KEY, raw);
    (getJSON as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    await expect(loadPluginSpec('x', new Date('2026-07-28T15:30:00Z'))).resolves.toMatchObject({
      id: 'tracking-demo',
    });
  });

  it('returns a valid network spec even when cache persistence fails', async () => {
    const online = makeSpec('flight-manager');
    (getJSON as jest.Mock).mockResolvedValue(online);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(loadPluginSpec('flight-manager')).resolves.toEqual(online);
  });

  it('does not let an in-flight pre-clear response resurrect the cache', async () => {
    let resolveRequest!: (value: TrackingPluginSpec) => void;
    (getJSON as jest.Mock).mockReturnValue(
      new Promise<TrackingPluginSpec>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const pending = loadPluginSpec('flight-manager');
    await clearPluginSpecCache();
    resolveRequest(makeSpec('flight-manager'));
    await expect(pending).resolves.toMatchObject({ id: 'flight-manager' });
    await whenPluginSpecCacheSettled();

    expect(await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY)).toBeNull();
  });
});

describe('listPlugins', () => {
  it('returns the server metadata list', async () => {
    (getJSON as jest.Mock).mockResolvedValue({
      plugins: [
        { id: 'tracking-demo', title: 'Tracking', description: 'Demo', version: 1 },
        { id: 'f1-2026', title: 'F1 2026', description: 'F1 season', version: 1 },
      ],
    });
    const metas = await listPlugins();
    expect(metas).toHaveLength(2);
    expect(metas[1]).toMatchObject({ id: 'f1-2026', title: 'F1 2026' });
  });

  it('skips invalid entries', async () => {
    (getJSON as jest.Mock).mockResolvedValue({
      plugins: [
        { id: 'good', title: 'Good', description: '', version: 1 },
        { id: 42 },
      ],
    });
    expect(await listPlugins()).toEqual([{ id: 'good', title: 'Good', description: '', version: 1 }]);
  });

  it('falls back to the default on failure', async () => {
    (getJSON as jest.Mock).mockRejectedValue(new Error('network'));
    const metas = await listPlugins();
    expect(metas[0].id).toBe('tracking-demo');
  });
});

describe('resolveSpecData', () => {
  it('converts ISO dates to Date and preserves extra fields', () => {
    const { franchises, items } = resolveSpecData(f12026Spec);
    expect(franchises).toHaveLength(1);
    const monaco = items.find((i) => i.id === 'f1-6')!;
    expect(monaco.start).toBeInstanceOf(Date);
    expect((monaco as unknown as Record<string, unknown>).round).toBe(6);
  });
});
