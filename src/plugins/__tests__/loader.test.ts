jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/client', () => ({ getJSON: jest.fn() }));

import { getJSON } from '@/api/client';
import { f12026Spec } from '@/plugins/examples/f1-2026';
import { listPlugins, loadPluginSpec, resolveSpecData } from '@/plugins/loader';

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
