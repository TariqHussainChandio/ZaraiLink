import { StyleSheet } from 'react-native';
import type { Theme } from '../../theme';

/** The page every inventory screen sits on: the ground colour, the standard gutter and room above the tab bar. */
export function makeScreenStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], paddingBottom: space[12], gap: space[4] },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    grow: { flex: 1 },
    actions: { gap: space[3] },
    body: { ...typography.body, color: colors.ink },
    caption: { ...typography.caption, color: colors.ink2 },
    figure: { ...typography.figure, color: colors.ink },
    overline: { ...typography.overline, color: colors.ink2 },
  });
}
