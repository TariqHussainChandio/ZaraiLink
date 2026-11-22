import { Bell, ClipboardList, History, LogOut, MapPin, RefreshCw, Scale, Truck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { Button, ListGroup, ListRow, ListRowIcon } from '../../common/components';
import { useTheme } from '../../theme';
import { useExitInventory } from '../components/InventoryExit';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** Everything else in the inventory system: buying, locations, settings, history, and the way back to ZaraiLink. */
export function MoreScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.More>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const exit = useExitInventory();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="Buying">
        <ListGroup>
          <ListRow
            title="Purchases"
            meta="Restocks from your suppliers, received into stock"
            leading={<ListRowIcon icon={ClipboardList} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Purchases)}
          />
          <ListRow
            title="Suppliers"
            meta="Who you buy from"
            leading={<ListRowIcon icon={Truck} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Suppliers)}
          />
        </ListGroup>
      </Section>
      <Section title="Setup">
        <ListGroup>
          <ListRow
            title="Locations"
            meta="Your shop, godowns and shelves"
            leading={<ListRowIcon icon={MapPin} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Locations)}
          />
          <ListRow
            title="Alert settings"
            meta="Default reorder level and notifications"
            leading={<ListRowIcon icon={Bell} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.AlertSettings)}
          />
        </ListGroup>
      </Section>
      <Section title="History">
        <ListGroup>
          <ListRow
            title="Activity history"
            meta="Every stock movement"
            leading={<ListRowIcon icon={History} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Movements)}
          />
          <ListRow
            title="Marketplace sync"
            meta="What each marketplace dispatch did to your stock"
            leading={<ListRowIcon icon={RefreshCw} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.SyncLog)}
          />
          <ListRow
            title="Reconciliation"
            meta="Whether each product's movements add up to its stock"
            leading={<ListRowIcon icon={Scale} />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Reconciliation)}
          />
        </ListGroup>
      </Section>
      <Button label="Back to ZaraiLink" variant="secondary" icon={LogOut} onPress={exit} />
    </ScrollView>
  );
}
