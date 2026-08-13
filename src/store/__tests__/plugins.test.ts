jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act } from '@testing-library/react-native';
import { usePlugins } from '@/store/plugins';

const F1 = { id: 'f1-2026', title: 'F1 2026', description: 'F1 season', version: 1 };
const TRACK = { id: 'tracking-demo', title: 'Tracking', description: 'Demo', version: 1 };

describe('usePlugins', () => {
  beforeEach(() => {
    act(() => {
      usePlugins.setState({ added: [], hiddenBuiltIns: [] });
    });
  });

  it('adds a plugin (dedupes by id)', () => {
    act(() => {
      usePlugins.getState().add(F1);
      usePlugins.getState().add(F1);
    });
    expect(usePlugins.getState().added).toEqual([F1]);
  });

  it('removes a plugin', () => {
    act(() => {
      usePlugins.setState({ added: [F1] });
      usePlugins.getState().remove('f1-2026');
    });
    expect(usePlugins.getState().added).toEqual([]);
  });

  it('toggles a plugin on then off', () => {
    act(() => usePlugins.getState().toggle(F1));
    expect(usePlugins.getState().added).toEqual([F1]);
    act(() => usePlugins.getState().toggle(F1));
    expect(usePlugins.getState().added).toEqual([]);
  });

  it('toggle adds different plugins independently', () => {
    act(() => {
      usePlugins.getState().toggle(F1);
      usePlugins.getState().toggle(TRACK);
    });
    expect(usePlugins.getState().added).toEqual([F1, TRACK]);
  });

  it('toggles a built-in segment on then off', () => {
    expect(usePlugins.getState().hiddenBuiltIns).toEqual([]);
    act(() => usePlugins.getState().toggleBuiltIn('ask'));
    expect(usePlugins.getState().hiddenBuiltIns).toEqual(['ask']);
    act(() => usePlugins.getState().toggleBuiltIn('ask'));
    expect(usePlugins.getState().hiddenBuiltIns).toEqual([]);
  });
});
