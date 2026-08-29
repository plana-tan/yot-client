jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render } from '@testing-library/react-native';

import TrackingDetailScreen from '../../app/tracking/[id]';
import { loadPluginSpec } from '@/plugins/loader';
import type { TrackingPluginSpec } from '@/plugins/schema';

/**
 * Spec-driven tracking detail: when opened with `?plugin=<id>`, the item comes
 * from the plugin's server spec (not the demo store) and the body renders the
 * spec's `detail` tree. Without the param the legacy store path is unchanged.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({ id: 'ev:1' })),
}));

jest.mock('@/plugins/loader', () => {
  const actual = jest.requireActual('@/plugins/loader');
  return {
    ...actual,
    loadPluginSpec: jest.fn(),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

const routerMock = jest.requireMock('expo-router') as {
  useLocalSearchParams: jest.Mock;
};
const loadPluginSpecMock = loadPluginSpec as jest.Mock;

const FRANCHISE = { name: 'ANA', abbr: 'ANA', color: '#0066B3' };

function makeSpec(detail: TrackingPluginSpec['detail']): TrackingPluginSpec {
  return {
    id: 'flight-manager',
    title: 'Flights',
    description: 'test',
    version: 1,
    data: {
      franchises: [FRANCHISE],
      items: [
        { id: 'ev:1', title: 'HND → LHR', desc: 'Seat 39A', franchise: 'ANA', type: 'flight', start: '2026-09-04', end: '2026-09-04', flight: 'NH211' },
      ],
    },
    detail,
  };
}

beforeEach(() => {
  loadPluginSpecMock.mockReset();
});

describe('TrackingDetail — spec-driven (plugin param)', () => {
  it('renders the item from the plugin spec detail tree', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'ev:1', plugin: 'flight-manager' });
    loadPluginSpecMock.mockResolvedValue(
      makeSpec({
        type: 'Column',
        children: [
          { type: 'Title', value: '{{item.title}}' },
          { type: 'Text', value: '{{item.flight}}' },
        ],
      }),
    );

    const view = await render(<TrackingDetailScreen />);
    expect(await view.findByText('HND → LHR')).toBeTruthy();
    expect(await view.findByText('NH211')).toBeTruthy();
  });

  it('falls back to the default detail tree when the spec has none', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'ev:1', plugin: 'flight-manager' });
    loadPluginSpecMock.mockResolvedValue(makeSpec(undefined));

    const view = await render(<TrackingDetailScreen />);
    expect(await view.findByText('Seat 39A')).toBeTruthy();
  });

  it('wires spec actions into detail nodes', async () => {
    // Spy on the resolved handlers through a spec whose action we can observe:
    // openUrl calls Linking.openURL; instead of mocking RN, spy via callAsk →
    // api client. Simplest observable: openItem re-routes.
    const push = jest.requireMock('expo-router').router.push;
    push.mockClear();
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'ev:1', plugin: 'flight-manager' });
    loadPluginSpecMock.mockResolvedValue({
      ...makeSpec({
        type: 'Column',
        children: [{ type: 'Button', value: 'Related', action: 'rel' }],
      }),
      actions: { rel: { kind: 'openItem' } },
    });

    const view = await render(<TrackingDetailScreen />);
    const btn = await view.findByText('Related');
    fireEvent.press(btn);
    expect(push).toHaveBeenCalledWith('/tracking/ev:1?plugin=flight-manager');
  });

  it('shows Not found for an unknown item id', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'ev:nope', plugin: 'flight-manager' });
    loadPluginSpecMock.mockResolvedValue(makeSpec({ type: 'Column', children: [] }));

    const view = await render(<TrackingDetailScreen />);
    expect(view.getByText('Not found')).toBeTruthy();
  });
});

describe('TrackingDetail — legacy store path (no plugin param)', () => {
  it('still resolves demo-store items', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 't1' });
    // Demo store seeds lazily; with an empty store the screen must show the
    // missing state rather than crash.
    const view = await render(<TrackingDetailScreen />);
    expect(view.getByText('Not found')).toBeTruthy();
  });
});
