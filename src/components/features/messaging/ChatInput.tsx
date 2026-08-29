import { ImagePlus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, Text, View } from 'react-native';
import { lightTheme } from '../../../theme';

export interface ChatInputProps {
  onSend: (body: string, images: Asset[]) => void;
  sending?: boolean;
}

const { colors, spacing, radii } = lightTheme;

export function ChatInput({ onSend, sending = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<Asset[]>([]);

  const pickImages = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 4 });
    if (result.assets) setImages(current => [...current, ...result.assets!].slice(0, 4));
  };

  const removeImage = (uri: string | undefined) => {
    setImages(current => current.filter(image => image.uri !== uri));
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;
    onSend(trimmed, images);
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
              <TouchableOpacity style={styles.removeButton} onPress={() => removeImage(image.uri)}>
                <X size={12} color={colors.neutral.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImages} disabled={sending}>
          <ImagePlus size={22} color={colors.neutral.gray600} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.neutral.gray400}
          value={value}
          onChangeText={setValue}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !value.trim() && images.length === 0 && styles.sendButtonDisabled]}
          onPress={submit}
          disabled={(!value.trim() && images.length === 0) || sending}
        >
          <Text style={styles.sendLabel}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral.gray200,
    backgroundColor: colors.neutral.white,
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
    backgroundColor: colors.neutral.gray100,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.neutral.gray700,
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
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.neutral.gray900,
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
