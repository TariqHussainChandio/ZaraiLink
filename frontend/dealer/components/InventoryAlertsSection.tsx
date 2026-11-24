// Dealer: inventory stock alerts shown at the top of the dealer's notifications.
import { TriangleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListGroup, ListRow, ListRowIcon, StatusBadge } from '../../common/components';
import { useStockAlerts } from '../../inventory';
import { useOpenInventorySystem } from '../../navigation/stacks/useOpenInventorySystem';
import { selectAccount, useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';

/**
 * The inventory system's stock alerts at the top of an approved dealer's notifications (D20): the dealer reads every
 * alert in one list, the shop's notifications below these. Each row opens the inventory system, where the restocking is
 * done. Nothing is drawn while there is no alert, or for a dealer who may not use the inventory system (BR-03/04).
 */
export function InventoryAlertsSection() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const allowed = useAuthStore(state => state.role === 'dealer' && selectAccount(state)?.account_status === 'approved');
  const { data: alerts = [] } = useStockAlerts(allowed);
  const openInventorySystem = useOpenInventorySystem();
  if (!allowed || alerts.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        Stock alerts
      </Text>
      <ListGroup>
        {alerts.map(alert => (
          <ListRow
            key={`${alert.product_id}-${alert.location_id ?? 'all'}`}
            title={alert.name}
            meta={`${alert.quantity.toLocaleString('en-PK')}${alert.unit ? ` ${alert.unit}` : ''} left · Inventory system`}
            leading={<ListRowIcon icon={TriangleAlert} />}
            status={<StatusBadge kind="stock" status={alert.status} size="sm" />}
            onPress={openInventorySystem}
          />
        ))}
      </ListGroup>
    </View>
  );
}

// Builds this component's styles from the theme.
function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    section: { gap: space[2] },
    title: { ...typography.title, color: colors.ink },
  });
}
