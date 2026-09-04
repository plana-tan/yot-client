jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act, render } from '@testing-library/react-native';

import TrackingView from '@/components/feed/TrackingView';
import { loadPluginSpec } from '@/plugins/loader';
import type { TrackingPluginSpec } from '@/plugins/schema';

/**
 * TrackingView list-chrome behaviour: the `list.groupHeader` toggle hides the
 * time-period group headers ("This week", "Later", …) while keeping the rows.
 */

jest.mock('@/plugins/loader', () => {
  const actual = jest.requireActual('@/plugins/loader');
  return {
    ...actual,
    loadPluginSpec: jest.fn(),
  };
});

const loadPluginSpecMock = loadPluginSpec as jest.Mock;

const FRANCHISE = { name: 'ANA', abbr: 'ANA', color: '#0066B3' };

function makeSpec(list: TrackingPluginSpec['list']): TrackingPluginSpec {
  return {
    id: 'no-headers',
    title: 'No Headers',
    description: 'test',
    version: 1,
    data: {
      franchises: [FRANCHISE],
      items: [
        // One dated (lands in a deadline group) and one TBA.
        { id: 'a1', title: 'Dated', desc: 'flight', franchise: 'ANA', type: 'flight', start: '2026-08-17', end: '2026-08-17' },
        { id: 'a2', title: 'TBA', desc: 'flight', franchise: 'ANA', type: 'flight', start: null, end: null },
      ],
    },
    listRow: {
      type: 'Row',
      children: [{ type: 'Text', value: '{{item.title}}' }],
    },
    list,
  };
}

beforeEach(() => {
  loadPluginSpecMock.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TrackingView list chrome — groupHeader', () => {
  it('hides the group headers when list.groupHeader is false', async () => {
    loadPluginSpecMock.mockResolvedValue(makeSpec({ groupHeader: false }));

    const { findByTestId, getByTestId, queryByTestId } = await render(
      <TrackingView pluginId="no-headers" onOpenItem={() => {}} />,
    );

    // Rows still render from the plugin spec…
    expect(await findByTestId('tracking-row-a1')).toBeTruthy();
    expect(getByTestId('tracking-row-a2')).toBeTruthy();

    // …but no time-period group header is shown.
    expect(queryByTestId('tracking-group-Active')).toBeNull();
    expect(queryByTestId('tracking-group-TBA')).toBeNull();
  });

  it('shows the group headers by default', async () => {
    loadPluginSpecMock.mockResolvedValue(makeSpec(undefined));

    const { findByTestId, getByTestId } = await render(
      <TrackingView pluginId="no-headers" onOpenItem={() => {}} />,
    );

    expect(await findByTestId('tracking-group-TBA')).toBeTruthy();
    expect(getByTestId('tracking-row-a1')).toBeTruthy();
  });
});

describe('TrackingView live derived values', () => {
  it('refreshes elapsed-time progress every minute without refetching the spec', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-04T11:00:00Z'));

    loadPluginSpecMock.mockResolvedValue({
      ...makeSpec({ groupHeader: false }),
      derive: { progress: { mode: 'range', basis: 'elapsed-time' } },
      data: {
        franchises: [FRANCHISE],
        items: [
          {
            id: 'flight-1',
            title: 'HND → LHR',
            desc: 'flight',
            franchise: 'ANA',
            type: 'flight',
            start: '2026-09-04T10:00:00Z',
            end: '2026-09-04T14:00:00Z',
          },
        ],
      },
      listRow: { type: 'Text', value: '{{derived.progress}}' },
    });

    const view = await render(<TrackingView pluginId="flight-manager" onOpenItem={() => {}} />);
    expect(await view.findByText('0.25')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(view.getByText(String(61 / 240))).toBeTruthy();
    expect(loadPluginSpecMock).toHaveBeenCalledTimes(1);
  });
});
