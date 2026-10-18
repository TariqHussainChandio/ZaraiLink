import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { MovementHistory } from '../components/MovementHistory';
import { makeScreenStyles } from '../components/screenStyles';
import type { INVENTORY_ROUTES, InventoryScreenProps } from '../types/navigation';

/** The activity history: every stock movement, filtered by source, product and period. */
export function MovementsScreen({ route }: InventoryScreenProps<typeof INVENTORY_ROUTES.Movements>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  return (
    <View style={styles.screen}>
      <MovementHistory initialProductId={route.params?.productId} />
    </View>
  );
}
