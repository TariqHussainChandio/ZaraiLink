// Inventory: list row that a screen reader reads as one item.
import { ChevronRight } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListRow, type ListRowProps } from '../../common/components';
import { type Theme, useTheme } from '../../theme';

export interface SpokenRowProps extends ListRowProps {
  /** Everything the row says, in the order a dealer reads it, status and figure included: TalkBack stops once. */
  label: string;
  /** For a choice in a list (the location switcher): read as selected. */
  selected?: boolean;
}

/**
 * A ListRow that TalkBack reads as one stop (A8 accessibility run). A plain ListRow read its title, meta and every
 * trailing badge or figure as separate fragments, and a pressable one left its status badge out of the button's name.
 * Here the row is one accessible element whose label carries the status and the figure; a pressable row is a single
 * button (with the chevron ListRow draws for one), a static row a single text. The row's own text stays on screen as
 * it was.
 */
export function SpokenRow({ label, selected, onPress, trailing, ...row }: SpokenRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }}>
        <ListRow {...row} trailing={trailing} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <ListRow
        {...row}
        trailing={
          <View style={styles.trailing}>
            {trailing}
            <ChevronRight color={theme.colors.ink3} size={theme.size.iconButton} />
          </View>
        }
      />
    </Pressable>
  );
}

// Builds this component's styles from the theme.
function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    trailing: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    pressed: { opacity: 0.6 },
  });
}
