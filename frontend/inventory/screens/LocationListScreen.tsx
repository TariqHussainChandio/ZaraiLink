import { FlashList } from '@shopify/flash-list';
import { MapPin, Plus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { Badge, Button, EmptyState, ListRow, ListRowIcon, ScreenState } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { makeScreenStyles } from '../components/screenStyles';
import { useLocations } from '../hooks/inventory';
import { LOCATION_KIND_LABELS } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** Where the dealer keeps stock (SRDS §17). The default location is the one the marketplace sells from (D8). */
export function LocationListScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Locations>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useLocations();
  const { data, refetch, isRefetching } = result;

  return (
    <View style={styles.screen}>
      <FlashList
        data={data ?? []}
        keyExtractor={location => location.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="Add location" icon={Plus} onPress={() => navigation.navigate(INVENTORY_ROUTES.LocationForm, {})} />
          </View>
        }
        renderItem={({ item: location }) => (
          <ListRow
            title={location.name}
            meta={[LOCATION_KIND_LABELS[location.kind], location.address].filter(Boolean).join(' · ')}
            leading={<ListRowIcon icon={MapPin} />}
            trailing={
              location.is_default ? (
                <Badge label="Default" tone="info" size="sm" />
              ) : location.is_active ? undefined : (
                <Badge label="Inactive" size="sm" />
              )
            }
            onPress={() => navigation.navigate(INVENTORY_ROUTES.LocationForm, { locationId: location.id })}
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState icon={MapPin} title="No locations" description="Add your shop or godown to keep stock there." />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load your locations" />
          )
        }
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { marginBottom: theme.space[3] },
  };
}
