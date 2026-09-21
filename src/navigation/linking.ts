import type { LinkingOptions } from '@react-navigation/native';

// The zarailink:// scheme is registered natively from `scheme` in app.config.ts.
// `config.screens` stays empty deliberately: the one deep link currently in use
// (zarailink://reset-password) isn't a registered route — it's handled by a raw `Linking`
// listener in authStore.ts, since RootNavigator swaps its entire navigator tree by auth status
// rather than exposing a single route tree a link could target. Add entries here (e.g. for
// shared listing URLs) only once a link needs to land on an actual registered screen.
export const linking: LinkingOptions<Record<string, unknown>> = {
  prefixes: ['zarailink://'],
  config: {
    screens: {},
  },
};
