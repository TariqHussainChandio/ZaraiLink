import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import { Button } from '../Button';

interface QuickAction {
  label: string;
  onPress: () => void;
}

export interface QuickActionsProps {
  actions: QuickAction[];
}

/** A dashboard's shortcuts: secondary buttons in the role's accent, so none competes with a screen's one primary action.
 * Each is a Button, so TalkBack reads its label as a button and it keeps the 48dp target.
 *
 * @example
 * <QuickActions actions={[{ label: 'Stock in', onPress: () => operate('in') }]} />
 */
export function QuickActions({ actions }: QuickActionsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      {actions.map(action => (
        <Button key={action.label} label={action.label} variant="secondary" fullWidth={false} onPress={action.onPress} />
      ))}
    </View>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
  });
}
