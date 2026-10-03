import { ImagePlus, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, Text, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';

export interface ChatInputProps {
  onSend: (body: string, images: PickedPhoto[]) => void;
  sending?: boolean;
}

export function ChatInput({ onSend, sending = false }: ChatInputProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const [value, setValue] = useState('');
  const [images, setImages] = useState<PickedPhoto[]>([]);

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
                hitSlop={theme.components.hitSlop(theme.size.countBadge)}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <X size={theme.size.iconSm} color={theme.colors.onAccent} />
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
          <ImagePlus size={theme.size.iconMd} color={theme.colors.ink2} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.ink2}
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

function makeStyles({ colors, space, radius, size, borders, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
      backgroundColor: colors.surface,
    },
    previewRow: {
      paddingHorizontal: space[3],
      paddingTop: space[2],
    },
    previewWrap: {
      marginRight: space[2],
    },
    previewImage: {
      width: size.thumb,
      height: size.thumb,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
    },
    removeButton: {
      position: 'absolute',
      top: -space[1],
      right: -space[1],
      backgroundColor: colors.ink2,
      borderRadius: radius.pill,
      width: size.countBadge,
      height: size.countBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: space[3],
    },
    attachButton: {
      minWidth: size.touchMin,
      minHeight: size.touchMin,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space[1],
    },
    input: {
      flex: 1,
      maxHeight: size.composerMax,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      ...typography.bodyLg,
      color: colors.ink,
      marginRight: space[2],
    },
    sendButton: {
      backgroundColor: accent.fill,
      borderRadius: radius.md,
      paddingHorizontal: space[4],
      minHeight: size.touchMin,
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendLabel: {
      ...typography.label,
      color: colors.onAccent,
    },
  });
}
