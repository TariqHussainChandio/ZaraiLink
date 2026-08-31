import { act } from '@testing-library/react-native';
import { useThemeStore } from './themeStore';

beforeEach(() => {
  act(() => {
    useThemeStore.setState({ mode: 'system' });
  });
});

describe('useThemeStore', () => {
  it('defaults to system mode', () => {
    expect(useThemeStore.getState().mode).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)('sets mode to %s', mode => {
    act(() => {
      useThemeStore.getState().setMode(mode);
    });
    expect(useThemeStore.getState().mode).toBe(mode);
  });
});
