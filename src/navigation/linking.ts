import type { LinkingOptions } from '@react-navigation/native';

// Stub — no deep links are wired up yet. Fill in `prefixes`/`config` when a module needs them
// (e.g. password-reset email links, shared listing URLs).
export const linking: LinkingOptions<Record<string, unknown>> = {
  prefixes: [],
  config: {
    screens: {},
  },
};
