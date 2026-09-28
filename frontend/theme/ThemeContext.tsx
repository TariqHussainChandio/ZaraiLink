import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '../state/themeStore';
import { darkTheme, lightTheme, type Theme } from './themes';

const ThemeReactContext = createContext<Theme>(lightTheme);

/**
 * Resolves `mode: 'system' | 'light' | 'dark'` (from the persisted store) against the OS
 * setting to a single boolean. Exported (not just used internally by `ThemeProvider`) so
 * `App.tsx` can compute the same answer for `NavigationContainer`'s own `theme` prop — React
 * Navigation styles its native chrome (headers, tab bar) from that prop, not from `useTheme()`,
 * so both need to agree or the screen content and the surrounding chrome would fall out of sync.
 */
export function useIsDarkMode(): boolean {
  const mode = useThemeStore(state => state.mode);
  const systemScheme = useColorScheme();
  return mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
}

/**
 * The provider itself has no UI — it just resolves the active `Theme` object once per render
 * and makes it available to `useTheme()`. Mount this once, near the root (see App.tsx), above
 * anything that calls `useTheme()`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isDark = useIsDarkMode();
  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  return <ThemeReactContext.Provider value={theme}>{children}</ThemeReactContext.Provider>;
}

/**
 * The dark-mode-aware replacement for `import { lightTheme } from '../../theme'` — returns
 * whichever theme is currently active. Must be called inside a component (not at module scope,
 * the way `lightTheme` used to be destructured), since it needs to re-run on every render to
 * react to a theme change.
 */
export function useTheme(): Theme {
  return useContext(ThemeReactContext);
}
