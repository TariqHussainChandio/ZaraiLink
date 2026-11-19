import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoleBadge, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ListingWithRelations } from '../types/marketplace';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';
import { conditionLabel } from './listingCondition';

export interface ListingCardProps {
  listing: ListingWithRelations;
  onPress: () => void;
}

export function ListingCard({ listing, onPress }: ListingCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const imageUri = listing.images[0];
  const condition = conditionLabel(listing.condition);
  // One label for the whole card, so TalkBack reads the listing in one stop instead of each line in turn.
  const label = [
    listing.title,
    `${formatRs(listing.price)} per ${listing.unit}`,
    listing.category?.name,
    listing.availability
      ? statusMeta('stock', listing.availability).label
      : null,
    listing.brand,
    condition,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the listing"
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          accessible={false}
          importantForAccessibility="no"
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      {listing.seller_role ? (
        <View style={styles.roleBadge}>
          <RoleBadge role={listing.seller_role} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={styles.price}>
          {formatRs(listing.price)} / {listing.unit}
        </Text>
        {listing.category ? (
          <Text style={styles.category}>{listing.category.name}</Text>
        ) : null}
        {listing.availability ? (
          <View style={styles.stock}>
            <StatusBadge kind="stock" status={listing.availability} size="sm" />
          </View>
        ) : null}
        {listing.brand || condition ? (
          <View style={styles.chipRow}>
            {listing.brand ? (
              <View style={styles.chip}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {listing.brand}
                </Text>
              </View>
            ) : null}
            {condition ? (
              <View style={styles.chip}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {condition}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles({
  colors,
  space,
  radius,
  typography,
  borders,
  fontWeight,
  size,
  components,
}: Theme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      margin: space[1],
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: borders.hairline,
      borderColor: colors.line,
    },
    image: {
      width: '100%',
      height: size.photoLg,
      backgroundColor: colors.line,
    },
    roleBadge: {
      position: 'absolute',
      top: space[1],
      left: space[1],
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      padding: space[2],
    },
    title: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    price: {
      marginTop: space[1] / 2,
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.accent.brand.ink,
    },
    category: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    stock: {
      marginTop: space[1],
      flexDirection: 'row',
    },
    // Quiet, muted pills — deliberately unstyled relative to `price` (no brand color, no bold)
    // so brand/condition read as secondary detail, never competing with it for attention.
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1] / 2,
      marginTop: space[1],
    },
    chip: {
      paddingHorizontal: space[1],
      paddingVertical: components.badge.paddingY,
      borderRadius: radius.xs,
      backgroundColor: colors.ground,
    },
    chipLabel: {
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
