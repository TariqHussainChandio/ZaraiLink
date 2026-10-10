import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoleBadge, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ListingWithRelations } from '../types/marketplace';
import { formatRs } from '../../../utils/money';

export interface ListingCardProps {
  listing: ListingWithRelations;
  onPress: () => void;
}

export function ListingCard({ listing, onPress }: ListingCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const imageUri = listing.images[0];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} />
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
        {listing.category ? <Text style={styles.category}>{listing.category.name}</Text> : null}
        {listing.availability ? (
          <View style={styles.stock}>
            <StatusBadge kind="stock" status={listing.availability} size="sm" />
          </View>
        ) : null}
        {listing.brand || listing.condition ? (
          <View style={styles.chipRow}>
            {listing.brand ? (
              <View style={styles.chip}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {listing.brand}
                </Text>
              </View>
            ) : null}
            {listing.condition ? (
              <View style={styles.chip}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {listing.condition}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, radius, typography, borders, fontWeight, size, components }: Theme) {
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
