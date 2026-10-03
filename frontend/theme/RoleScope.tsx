import React, { createContext, useContext } from 'react';
import type { Accent, AccentKey } from './colors';
import { useTheme } from './ThemeContext';

// Each role shell has one accent (SRDS §44), set once on the shell; buttons, tabs, chips and the app bar read it here
// instead of choosing a colour themselves. Outside any shell (sign-in, splash) the scope is the brand green.
const RoleScopeContext = createContext<AccentKey>('brand');

export function RoleScopeProvider({ scope, children }: { scope: AccentKey; children: React.ReactNode }) {
  return <RoleScopeContext.Provider value={scope}>{children}</RoleScopeContext.Provider>;
}

/** The current shell's accent in the current theme: `mark`, `fill`, `ink`, `soft`. */
export function useRoleAccent(): Accent {
  const theme = useTheme();
  return theme.colors.accent[useContext(RoleScopeContext)];
}
