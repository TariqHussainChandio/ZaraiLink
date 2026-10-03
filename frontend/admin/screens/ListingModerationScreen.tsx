import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, EmptyState, Spinner, StatusBadge } from '../../common/components';
import { useModerationListings, useSetListingStatus } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import type { ListingWithRelations } from '../../common/marketplace';
import { formatRs } from '../../utils/money';

export function ListingModerationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const actorId = useAuthStore(state => state.user?.id);
  const { data: listings = [], isPending: loading, refetch } = useModerationListings();
  const setListingStatus = useSetListingStatus();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const toggleActive = async (listing: ListingWithRelations) => {
    if (!actorId) return;
    setUpdatingId(listing.id);
    try {
      await setListingStatus.mutateAsync({ id: listing.id, status: listing.status === 'active' ? 'inactive' : 'active' });
    } catch (error) {
      Alert.alert('Could not update the listing', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <FlashList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={listings}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.owner} numberOfLines={1}>
              {`${item.owner?.full_name || 'Unknown'} · ${formatRs(item.price)}/${item.unit}`}
            </Text>
            <StatusBadge kind="listing" status={item.status} />
          </View>
          {item.status !== 'sold' ? (
            <Button
              label={item.status === 'active' ? 'Deactivate' : 'Activate'}
              variant={item.status === 'active' ? 'danger' : 'secondary'}
              fullWidth={false}
              loading={updatingId === item.id}
              onPress={() => toggleActive(item)}
            />
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          title="No listings yet"
          description="Listings will show up here once sellers start publishing."
        />
      }
    />
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    info: {
      flex: 1,
      marginRight: space[2],
    },
    title: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    owner: {
      ...typography.caption,
      color: colors.ink2,
      marginVertical: space[1],
    },
  });
}
