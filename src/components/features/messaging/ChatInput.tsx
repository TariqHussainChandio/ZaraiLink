import { ImagePlus, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import type { Asset } from 'react-native-image-picker';
import { Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import { pickPhotos } from '../../../utils/photoPicker';

export interface ChatInputProps {
  onSend: (body: string, images: Asset[]) => void;
  sending?: boolean;
}

export function ChatInput({ onSend, sending = false }: ChatInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [value, setValue] = useState('');
  const [images, setImages] = useState<Asset[]>([]);

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: 4 });
    if (assets.length > 0) setImages(current => [...current, ...assets].slice(0, 4));
  };

  const removeImage = (uri: string | undefined) => {
    setImages(current => current.filter(image => image.uri !== uri));
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;
    onSend(trimmed, images);
    hapticTap();
    setValue('');
    setImages([]);
  };

  return (
    <View style={styles.container}>
      {images.length > 0 ? (
        <ScrollView horizontal style={styles.previewRow} showsHorizontalScrollIndicator={false}>
          {images.map(image => (
            <View key={image.uri} style={styles.previewWrap}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeImage(image.uri)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <X size={12} color={theme.colors.neutral.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={pickImages}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          <ImagePlus size={22} color={theme.colors.text.secondary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.text.secondary}
          value={value}
          onChangeText={setValue}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !value.trim() && images.length === 0 && styles.sendButtonDisabled]}
          onPress={submit}
          disabled={(!value.trim() && images.length === 0) || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendLabel}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles({ colors, spacing, radii }: Theme) {
  return StyleSheet.create({
    container: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background.surface,
    },
    previewRow: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    previewWrap: {
      marginRight: spacing.sm,
    },
    previewImage: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.border,
    },
    removeButton: {
      position: 'absolute',
      top: -6,
      right: -6,
      backgroundColor: colors.text.secondary,
      borderRadius: radii.full,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: spacing.md,
    },
    attachButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 14,
      color: colors.text.primary,
      marginRight: spacing.sm,
    },
    sendButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendLabel: {
      color: colors.neutral.white,
      fontWeight: '700',
    },
  });
}
