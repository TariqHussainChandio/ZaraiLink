import { ImageOff } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, RatePlate, RoleBadge, StatusBadge } from '../../components';
import { statusMeta } from '../../constants/status';
import { useTheme, type Theme } from '../../../theme';
import { formatRs } from '../../../utils/money';
import type { ListingWithRelations } from '../types/marketplace';

export interface ListingCardProps {
  listing: ListingWithRelations;
  onPress: () => void;
}

/** "Chaudhry Seeds · Sargodha": who sells it and where, the two facts a buyer weighs next to the price (MK-08). Either may
 * be missing (a listing without a location, an owner the API could not join), so the line shows what it has. */
function sellerLine(listing: Pick<ListingWithRelations, 'owner' | 'location'>): string {
  return [listing.owner?.full_name, listing.location?.city].filter(Boolean).join(' · ');
}

/** One listing in the market grid: the photo, the rate plate (price first, with its unit), the name, who sells it, and the
 * stock word. The whole card is one button whose spoken label carries all of it. */
export function ListingCard({ listing, onPress }: ListingCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const imageUri = listing.images[0];
  const seller = sellerLine(listing);
  const stock = listing.availability ? statusMeta('stock', listing.availability).label : null;
  const spoken = [listing.title, `${formatRs(listing.price)} per ${listing.unit}`, seller, stock].filter(Boolean).join(', ');

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      android_ripple={{ color: theme.colors.ripple }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <ImageOff color={theme.colors.ink3} size={theme.size.iconLg} />
        </View>
      )}
      {listing.seller_role ? (
        <View style={styles.roleBadge}>
          <RoleBadge role={listing.seller_role} />
        </View>
      ) : null}
      <View style={styles.body}>
        <RatePlate amount={listing.price} unit={`per ${listing.unit}`} size="lg" />
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        {seller ? (
          <Text style={styles.seller} numberOfLines={1}>
            {seller}
          </Text>
        ) : null}
        {listing.availability ? (
          <View style={styles.tag}>
            <StatusBadge kind="stock" status={listing.availability} size="sm" />
          </View>
        ) : null}
        {listing.brand || listing.condition ? (
          <View style={styles.tags}>
            {/* Plain tags, not chips: they look like facts because they are not tappable. */}
            {listing.brand ? <Badge label={listing.brand} size="sm" /> : null}
            {listing.condition ? <Badge label={listing.condition} size="sm" /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function makeStyles({ colors, space, typography, borders, size, components }: Theme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      margin: space[1],
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      overflow: 'hidden',
      borderWidth: borders.hairline,
      borderColor: colors.line,
    },
    // The loading skeleton uses this same height (`photoLg`), so the grid does not jump when data arrives.
    image: {
      width: '100%',
      height: size.photoLg,
      backgroundColor: colors.surfaceSunken,
    },
    imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    roleBadge: { position: 'absolute', top: space[1], left: space[1] },
    body: { padding: space[2], gap: space[1] },
    title: { ...typography.bodyStrong, color: colors.ink },
    seller: { ...typography.caption, color: colors.ink2 },
    tag: { flexDirection: 'row' },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
  });
}
