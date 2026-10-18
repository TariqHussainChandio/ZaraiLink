import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ImagePlus, ScanSearch } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, SelectField } from '../../common/components';
import { useTheme, type Theme } from '../../theme';
import { useCrops } from '../../common/marketplace';
import { pickPhotos, type PickedPhoto } from '../../utils/photoPicker';

// Registered in the shared `HomeNavigator` (Buyer/Farmer/Dealer's Home stack), but farmer-only
// in practice — only `SellerDashboard.tsx`'s farmer branch has a Quick Action leading here,
// the same pattern that already makes Farms/Crops farmer-only and Inventory dealer-only within
// this same shared stack. Untyped navigation, matching that stack's own conventions.
export function DiseaseUploadScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const { data: crops = [] } = useCrops();
  const [cropId, setCropId] = useState<string | null>(null);
  const [image, setImage] = useState<PickedPhoto | null>(null);

  const pickImage = async () => {
    const assets = await pickPhotos({ selectionLimit: 1 });
    if (assets[0]) setImage(assets[0]);
  };

  const onAnalyze = () => {
    if (!image?.uri) return;
    navigation.navigate('DiseaseProcessing', {
      imageUri: image.uri,
      imageFileName: image.fileName ?? null,
      imageType: image.mimeType ?? null,
      cropId,
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title} accessibilityRole="header">
        Identify a Crop Disease
      </Text>
      <Text style={styles.subtitle}>
        Take a clear photo of the sick leaf. The app gives a best guess, not a
        sure answer. Ask an expert before you spray.
      </Text>

      <SelectField
        label="Crop (optional)"
        value={cropId}
        options={crops.map(c => ({ id: c.id, label: c.name }))}
        onSelect={setCropId}
      />

      <Text style={styles.label}>Photo</Text>
      {image?.uri ? (
        <Pressable
          onPress={pickImage}
          accessibilityRole="button"
          accessibilityLabel="Your leaf photo"
          accessibilityHint="Opens your photos to choose a different one"
          style={({ pressed }) => [
            styles.photoTarget,
            pressed && styles.pressed,
          ]}
        >
          <Image
            source={{ uri: image.uri }}
            style={styles.preview}
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      ) : (
        <Pressable
          onPress={pickImage}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          accessibilityHint="Opens your photos to choose a leaf photo"
          style={({ pressed }) => [styles.addImage, pressed && styles.pressed]}
        >
          <ImagePlus color={theme.colors.ink2} size={theme.size.iconLg} />
          <Text style={styles.addImageLabel}>+ Add Photo</Text>
        </Pressable>
      )}

      <Button
        label="Analyze"
        icon={ScanSearch}
        onPress={onAnalyze}
        disabled={!image?.uri}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({
  colors,
  space,
  radius,
  typography,
  size,
  borders,
}: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    title: {
      ...typography.title,
      color: colors.ink,
      marginBottom: space[1],
    },
    subtitle: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[4],
    },
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    // The photo frame gets its background from the start so the pressed colour never drops its corners (Android).
    photoTarget: {
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
    },
    preview: {
      width: '100%',
      height: size.photoHero,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
      marginBottom: space[3],
    },
    addImage: {
      height: size.cardImage,
      minHeight: size.touchMin,
      gap: space[2],
      borderRadius: radius.sm,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderStyle: 'dashed',
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[3],
    },
    addImageLabel: {
      ...typography.body,
      color: colors.ink2,
    },
    pressed: {
      backgroundColor: colors.surfaceSunken,
    },
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
