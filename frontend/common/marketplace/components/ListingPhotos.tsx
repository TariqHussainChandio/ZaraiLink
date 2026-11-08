import { CircleAlert, Plus, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';

/** The most photos a listing can carry. */
export const MAX_LISTING_PHOTOS = 5;

export interface ListingPhotosProps {
  /** The photos in order; the first is the cover. */
  uris: string[];
  /** Adds photos from the camera or gallery; the screen decides how many more fit. */
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Shown under the photos when the form is submitted without one. */
  error?: string;
  disabled?: boolean;
}

/** The photos of a listing form: "3 of 5", an add tile that stays until the limit, and a remove button on each photo
 * (MK-07). Adding appends to what is there; it never replaces it. */
export function ListingPhotos({ uris, onAdd, onRemove, error, disabled }: ListingPhotosProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const full = uris.length >= MAX_LISTING_PHOTOS;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.label}>Photos</Text>
        <Text style={styles.count} accessibilityLabel={`${uris.length} of ${MAX_LISTING_PHOTOS} photos`}>{`${uris.length} of ${MAX_LISTING_PHOTOS}`}</Text>
      </View>
      <View style={styles.row}>
        {uris.map((uri, index) => (
          <View key={uri} style={styles.tile}>
            <Image source={{ uri }} style={styles.photo} accessibilityLabel={index === 0 ? 'Cover photo' : `Photo ${index + 1}`} accessibilityIgnoresInvertColors />
            {index === 0 ? (
              <View style={styles.cover}>
                <Text style={styles.coverText}>Cover</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.remove}
              onPress={() => onRemove(index)}
              disabled={disabled}
              hitSlop={theme.components.hitSlop(theme.size.iconMd)}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
            >
              <X color={theme.colors.surface} size={theme.size.iconSm} />
            </Pressable>
          </View>
        ))}
        {full ? null : (
          <Pressable
            style={[styles.tile, styles.add]}
            onPress={onAdd}
            disabled={disabled}
            android_ripple={{ color: theme.colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
          >
            <Plus color={theme.colors.ink2} size={theme.size.iconMd} />
            <Text style={styles.addText}>Add photo</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <CircleAlert color={theme.colors.status.danger.mark} size={theme.size.iconSm} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <Text style={styles.helper}>The first photo is the cover buyers see in the market.</Text>
      )}
    </View>
  );
}

function makeStyles({ colors, space, radius, size, borders, typography }: Theme) {
  return StyleSheet.create({
    container: { gap: space[2] },
    head: { flexDirection: 'row', justifyContent: 'space-between' },
    label: { ...typography.label, color: colors.ink },
    count: { ...typography.figure, color: colors.ink2 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    tile: { width: size.photoMd, height: size.photoMd, borderRadius: radius.sm, overflow: 'hidden' },
    photo: { width: '100%', height: '100%', backgroundColor: colors.surfaceSunken },
    cover: { position: 'absolute', left: 0, bottom: 0, paddingHorizontal: space[1], backgroundColor: colors.ink },
    coverText: { ...typography.caption, color: colors.surface },
    remove: {
      position: 'absolute',
      top: space[1],
      right: space[1],
      width: size.iconMd,
      height: size.iconMd,
      borderRadius: radius.pill,
      backgroundColor: colors.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    add: {
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[1],
    },
    addText: { ...typography.caption, color: colors.ink2 },
    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    error: { ...typography.caption, flex: 1, color: colors.status.danger.mark },
    helper: { ...typography.caption, color: colors.ink3 },
  });
}
