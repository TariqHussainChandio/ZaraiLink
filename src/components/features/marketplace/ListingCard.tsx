import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoleBadge } from '../../ui';
import { lightTheme } from '../../../theme';
import type { ListingWithRelations } from '../../../types/marketplace';

export interface ListingCardProps {
  listing: ListingWithRelations;
  onPress: () => void;
}

const { colors, spacing, radii, typography, shadows } = lightTheme;

export function ListingCard({ listing, onPress }: ListingCardProps) {
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
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: spacing.xs,
    backgroundColor: colors.neutral.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  image: {
    width: '100%',
    height: 110,
    backgroundColor: colors.neutral.gray100,
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  price: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.brand.primary,
    fontWeight: typography.weights.semibold as any,
  },
  category: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
});
