import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoleBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ListingWithRelations } from '../types/marketplace';

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
          Rs. {listing.price.toFixed(0)} / {listing.unit}
        </Text>
        {listing.category ? <Text style={styles.category}>{listing.category.name}</Text> : null}
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

function makeStyles({ colors, spacing, radii, typography, shadows }: Theme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      margin: spacing.xs,
      backgroundColor: colors.background.surface,
      borderRadius: radii.lg,
      overflow: 'hidden',
      ...shadows.sm,
    },
    image: {
      width: '100%',
      height: 110,
      backgroundColor: colors.border,
    },
    roleBadge: {
      position: 'absolute',
      top: spacing.xs,
      left: spacing.xs,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      padding: spacing.sm,
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    price: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold,
    },
    category: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    // Quiet, muted pills — deliberately unstyled relative to `price` (no brand color, no bold)
    // so brand/condition read as secondary detail, never competing with it for attention.
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs / 2,
      marginTop: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radii.sm,
      backgroundColor: colors.background.default,
    },
    chipLabel: {
      fontSize: 10,
      color: colors.text.secondary,
    },
  });
}
