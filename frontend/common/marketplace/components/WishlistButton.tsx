import { Heart } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../state/authStore';
import { useWishlist, useWishlistStore } from '../../../state/wishlistStore';
import { type Theme, useTheme } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import type { ListingWithRelations } from '../types/marketplace';

/** The heart that saves a listing to the buyer's wishlist (D20), on a listing card's photo and on the listing page.
 * Only a buyer has a wishlist, so for anyone else it draws nothing. A filled heart in earth brown means saved. */
export function WishlistButton({ listing }: { listing: ListingWithRelations }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => (state.role === 'buyer' ? state.user?.id : undefined));
  const items = useWishlist(userId);
  const toggle = useWishlistStore(state => state.toggle);
  if (!userId) return null;
  const saved = items.some(item => item.listingId === listing.id);

  return (
    <Pressable
      style={styles.button}
      onPress={() => {
        hapticTap();
        toggle(userId, {
          listingId: listing.id,
          title: listing.title,
          price: listing.price,
          unit: listing.unit,
          image: listing.images[0] ?? null,
          sellerName: listing.owner?.full_name ?? null,
        });
      }}
      android_ripple={{ color: theme.colors.ripple, borderless: true, radius: theme.size.touchMin / 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? `Remove ${listing.title} from your wishlist` : `Save ${listing.title} to your wishlist`}
    >
      <Heart
        color={theme.colors.secondary.mark}
        fill={saved ? theme.colors.secondary.mark : 'transparent'}
        size={theme.size.iconMd}
        strokeWidth={theme.size.iconStroke}
      />
    </Pressable>
  );
}

function makeStyles({ colors, size, radius, shadows }: Theme) {
  return StyleSheet.create({
    // A paper disc, so the heart reads on any photo.
    button: {
      width: size.touchMin,
      height: size.touchMin,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      ...shadows.elev1,
    },
  });
}
