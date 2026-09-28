import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Identify a Crop Disease</Text>
      <Text style={styles.subtitle}>Upload a clear photo of the affected leaf or plant. This is an AI advisory only — not a replacement for professional consultation.</Text>

      <SelectField
        label="Crop (optional)"
        value={cropId}
        options={crops.map(c => ({ id: c.id, label: c.name }))}
        onSelect={setCropId}
      />

      <Text style={styles.label}>Photo</Text>
      {image?.uri ? (
        <TouchableOpacity onPress={pickImage}>
          <Image source={{ uri: image.uri }} style={styles.preview} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.addImage} onPress={pickImage}>
          <Text style={styles.addImageLabel}>+ Add Photo</Text>
        </TouchableOpacity>
      )}

      <Button label="Analyze" onPress={onAnalyze} disabled={!image?.uri} style={styles.submit} />
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    title: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      lineHeight: typography.lineHeights.sm,
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    preview: {
      width: '100%',
      height: 220,
      borderRadius: radii.md,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    addImage: {
      height: 160,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    addImageLabel: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    submit: {
      marginTop: spacing.md,
      marginBottom: spacing['2xl'],
    },
  });
}
