import { ImagePlus, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';

export interface ChatInputProps {
  /** Sends the message. The composer is cleared only once this resolves; if it rejects, the words and photos stay where
   * they were and the person is told (FA-03). A screen that shows the message itself as "Sending…" may resolve at once. */
  onSend: (body: string, images: PickedPhoto[]) => void | Promise<void>;
  /** A send is in flight elsewhere (a mutation the screen owns): holds the Send button. */
  sending?: boolean;
}

const MAX_PHOTOS = 4;

export function ChatInput({ onSend, sending = false }: ChatInputProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [value, setValue] = useState('');
  const [images, setImages] = useState<PickedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = sending || submitting;
  const empty = !value.trim() && images.length === 0;

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: MAX_PHOTOS });
    if (assets.length > 0) setImages(current => [...current, ...assets].slice(0, MAX_PHOTOS));
  };

  const removeImage = (uri: string | undefined) => {
    setImages(current => current.filter(image => image.uri !== uri));
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;
    hapticTap();
    setFailed(false);
    setSubmitting(true);
    try {
      await onSend(trimmed, images);
      setValue('');
      setImages([]);
    } catch {
      // The draft is untouched, so the person can press Send again.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {failed ? (
        <Text style={styles.failure} accessibilityRole="alert">
          {"Couldn't send. Your message is still here, so you can try again."}
        </Text>
      ) : null}
      {images.length > 0 ? (
        <ScrollView horizontal style={styles.previewRow} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {images.map((image, index) => (
            <View key={image.uri} style={styles.previewWrap}>
              <Image
                source={{ uri: image.uri }}
                style={styles.previewImage}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`Photo ${index + 1} of ${images.length} to send`}
              />
              <Pressable
                style={styles.removeButton}
                onPress={() => removeImage(image.uri)}
                hitSlop={theme.components.hitSlop(theme.size.countBadge)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
              >
                <X size={theme.size.iconSm} color={theme.colors.onAccent} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        {images.length < MAX_PHOTOS ? <IconButton icon={ImagePlus} label="Add photo" onPress={pickImages} /> : null}
        <TextInput
          style={styles.input}
          placeholder="Write a message"
          placeholderTextColor={theme.colors.ink3}
          accessibilityLabel="Message"
          value={value}
          onChangeText={setValue}
          editable={!busy}
          multiline
        />
        <Button label="Send" size="md" fullWidth={false} loading={busy} disabled={empty || busy} onPress={submit} accessibilityLabel="Send message" />
      </View>
    </View>
  );
}

function makeStyles({ colors, space, size, borders, components, typography }: Theme) {
  return StyleSheet.create({
    container: {
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
      backgroundColor: colors.surface,
    },
    failure: {
      ...typography.body,
      color: colors.status.danger.ink,
      paddingHorizontal: space[3],
      paddingTop: space[2],
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
      borderRadius: components.input.radius,
      backgroundColor: colors.surfaceSunken,
    },
    removeButton: {
      position: 'absolute',
      top: -space[1],
      right: -space[1],
      backgroundColor: colors.ink2,
      borderRadius: size.countBadge / 2,
      width: size.countBadge,
      height: size.countBadge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space[2],
      paddingHorizontal: space[2],
      paddingVertical: space[2],
    },
    input: {
      flex: 1,
      minHeight: size.input,
      maxHeight: size.composerMax,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      borderRadius: components.input.radius,
      backgroundColor: colors.surface,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      ...typography.bodyLg,
      color: colors.ink,
    },
  });
}
