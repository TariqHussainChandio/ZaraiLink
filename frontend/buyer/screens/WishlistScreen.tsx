// Wishlist screen: listings the buyer saved on this phone, with remove and open.
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart, Trash2 } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { EmptyState, IconButton, ListGroup, ListRow, ScreenScaffold } from '../../common/components';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../common/constants/routes';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../state/authStore';
import { useWishlist, useWishlistStore } from '../../state/wishlistStore';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';

/** The buyer's saved listings (D20), kept on this phone. Each row opens the listing as it is now, where the price and
 * stock are current; the row itself shows what was saved. */
export function WishlistScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const tabs = useAppTabNavigation();
  const userId = useAuthStore(state => state.user?.id);
  const items = useWishlist(userId);
  const remove = useWishlistStore(state => state.remove);

  if (items.length === 0) {
    return (
      <ScreenScaffold>
        <EmptyState
          title="Nothing saved yet"
          description="Tap the heart on a listing to keep it here for later."
          icon={Heart}
          actionLabel="Browse the market"
          onAction={() => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.Browse)}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold>
      <Text style={styles.count}>{items.length === 1 ? '1 saved listing' : `${items.length} saved listings`}</Text>
      <ListGroup>
        {items.map(item => (
          <ListRow
            key={item.listingId}
            title={item.title}
            meta={[`${formatRs(item.price)} per ${item.unit}`, item.sellerName].filter(Boolean).join(' · ')}
            leading={
              item.image ? (
                <Image source={{ uri: item.image }} style={styles.thumb} accessible={false} accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.thumb, styles.noThumb]}>
                  <Heart color={theme.colors.ink3} size={theme.size.iconMd} />
                </View>
              )
            }
            trailing={userId ? <IconButton icon={Trash2} label={`Remove ${item.title}`} onPress={() => remove(userId, item.listingId)} /> : undefined}
            onPress={() => navigation.navigate(MARKETPLACE_ROUTES.ListingDetail, { listingId: item.listingId })}
          />
        ))}
      </ListGroup>
    </ScreenScaffold>
  );
}

// Builds the screen's styles from the theme.
function makeStyles({ colors, size, radius, typography }: Theme) {
  return StyleSheet.create({
    count: { ...typography.caption, color: colors.ink2 },
    thumb: { width: size.avatarMd, height: size.avatarMd, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken },
    noThumb: { alignItems: 'center', justifyContent: 'center' },
  });
}
