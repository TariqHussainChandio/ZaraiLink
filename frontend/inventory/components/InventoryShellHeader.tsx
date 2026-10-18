import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Check, ChevronDown, LogOut, MapPin, TriangleAlert } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ListGroup, ListRow, Sheet, TopAppBar } from '../../common/components';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';
import { useBusinessName } from '../hooks/business';
import { useStockAlerts } from '../hooks/inventory';
import { useSelectedLocation } from '../hooks/location';
import { LOCATION_KIND_LABELS } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryStackParamList } from '../types/navigation';
import { useExitInventory } from './InventoryExit';

/**
 * The app bar of each inventory tab's first screen (SRDS §16): the system's band and name, the dealer's business, the
 * location switcher, the alert centre and the way back to ZaraiLink. Inner screens use the stack's inventory app bar.
 */
export function InventoryShellHeader() {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const navigation = useNavigation<NavigationProp<InventoryStackParamList>>();
  const exit = useExitInventory();
  const businessName = useBusinessName();
  const { data: alerts = [] } = useStockAlerts();
  const { location, locations, isPending, select } = useSelectedLocation();
  // A new dealer has no location until they add one; the switcher then says so and opens the form.
  const noLocation = !location && !isPending;
  const [choosing, setChoosing] = useState(false);

  return (
    <View>
      <TopAppBar
        title={businessName}
        variant="inventory"
        actions={[
          {
            icon: TriangleAlert,
            label: 'Stock alerts',
            onPress: () => navigation.navigate(INVENTORY_ROUTES.Alerts),
            count: alerts.length,
            countLabel: count => (count === 1 ? '1 product needs attention' : `${count} products need attention`),
          },
          { icon: LogOut, label: 'Back to ZaraiLink', onPress: exit },
        ]}
      />
      <Pressable
        style={styles.switcher}
        onPress={() => (noLocation ? navigation.navigate(INVENTORY_ROUTES.LocationForm, {}) : setChoosing(true))}
        disabled={!noLocation && locations.length === 0}
        accessibilityRole="button"
        accessibilityLabel={
          location ? `Location: ${location.name}. Change location` : noLocation ? 'Add a location' : 'Loading locations'
        }
        accessibilityState={{ disabled: !noLocation && locations.length === 0 }}
      >
        <MapPin color={accent.ink} size={theme.size.iconSm} />
        <Text style={styles.switcherText} numberOfLines={1}>
          {location ? location.name : noLocation ? 'Add a location' : 'Loading locations'}
        </Text>
        <ChevronDown color={theme.colors.ink2} size={theme.size.iconSm} />
      </Pressable>
      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Location">
        <ListGroup>
          {locations.map(item => (
            <ListRow
              key={item.id}
              title={item.name}
              meta={item.is_default ? `${LOCATION_KIND_LABELS[item.kind]} · Default` : LOCATION_KIND_LABELS[item.kind]}
              trailing={item.id === location?.id ? <Check color={accent.ink} size={theme.size.iconMd} /> : undefined}
              onPress={() => {
                select(item.id);
                setChoosing(false);
              }}
            />
          ))}
        </ListGroup>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, size, borders, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    switcher: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      minHeight: size.touchMin,
      paddingHorizontal: space[4],
      backgroundColor: accent.soft,
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    switcherText: { ...typography.label, color: colors.ink, flexShrink: 1 },
  });
}
