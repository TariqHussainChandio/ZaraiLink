import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Eye, EyeOff, Store } from 'lucide-react-native';
import { Button, ScreenState, Sheet, StatusBadge, useToast } from '../../common/components';
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
  const listings = useModerationListings();
  const { refetch } = listings;
  const toast = useToast();
  const setListingStatus = useSetListingStatus();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // The listing whose hiding waits for the admin's confirmation in the sheet.
  const [hiding, setHiding] = useState<ListingWithRelations | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const setStatus = async (listing: ListingWithRelations, next: 'active' | 'inactive') => {
    if (!actorId) return;
    setUpdatingId(listing.id);
    try {
      await setListingStatus.mutateAsync({ id: listing.id, status: next });
      toast.success(next === 'active' ? `${listing.title} activated` : `${listing.title} deactivated`);
    } catch (error) {
      toast.error(`Could not update the listing. ${errorMessage(error)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Hiding takes a listing off the marketplace while the seller may be mid-sale, so it is confirmed first; listing it
  // again is the undo and needs no sheet. The status route takes no reason yet (UpdateListingStatusRequest has only
  // `status`), so the sheet confirms and does not ask for one: a reason typed here would be dropped by the API.
  const confirmHide = () => {
    const listing = hiding;
    setHiding(null);
    if (listing) setStatus(listing, 'inactive');
  };

  return (
    <View style={styles.container}>
      <ScreenState
        query={listings}
        errorTitle="Couldn't load the listings"
        empty={{ title: 'No listings yet', description: 'Listings will show up here once sellers start publishing.', icon: Store }}
      >
        {data => (
          <FlashList
            style={styles.container}
            contentContainerStyle={styles.list}
            data={data}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.info}>
                  {/* Title and price wrap: at large font sizes a one-line limit cut the price to "Rs 3,9…" (A8). */}
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.owner}>
                    {`${item.owner?.full_name || 'Unknown'} · ${formatRs(item.price)}/${item.unit}`}
                  </Text>
                  <StatusBadge kind="listing" status={item.status} />
                </View>
                {item.status !== 'sold' ? (
                  <Button
                    label={item.status === 'active' ? 'Deactivate' : 'Activate'}
                    // Every row has the same button, so TalkBack names the listing it acts on.
                    accessibilityLabel={`${item.status === 'active' ? 'Deactivate' : 'Activate'} ${item.title}`}
                    icon={item.status === 'active' ? EyeOff : Eye}
                    variant={item.status === 'active' ? 'danger' : 'secondary'}
                    fullWidth={false}
                    loading={updatingId === item.id}
                    onPress={() => (item.status === 'active' ? setHiding(item) : setStatus(item, 'active'))}
                  />
                ) : null}
              </View>
            )}
          />
        )}
      </ScreenState>
      <Sheet visible={hiding !== null} onClose={() => setHiding(null)} title={hiding ? `Deactivate ${hiding.title}` : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.sheetBody}>
            Buyers stop seeing this listing on the marketplace. The seller keeps it, and you can activate it again here.
          </Text>
          <Button label="Deactivate listing" icon={EyeOff} variant="danger" onPress={confirmHide} />
          <Button label="Not now" variant="secondary" onPress={() => setHiding(null)} />
        </View>
      </Sheet>
    </View>
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
    sheet: {
      gap: space[3],
    },
    sheetBody: {
      ...typography.body,
      color: colors.ink2,
    },
  });
}
