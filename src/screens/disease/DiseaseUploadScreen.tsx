import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Button, SelectField } from '../../components/ui';
import { lightTheme } from '../../theme';
import { useMarketplaceStore } from '../../store/marketplaceStore';

const { colors, spacing, radii, typography } = lightTheme;

// Registered in the shared `HomeNavigator` (Buyer/Farmer/Dealer's Home stack), but farmer-only
// in practice — only `SellerDashboard.tsx`'s farmer branch has a Quick Action leading here,
// the same pattern that already makes Farms/Crops farmer-only and Inventory dealer-only within
// this same shared stack. Untyped navigation, matching that stack's own conventions.
export function DiseaseUploadScreen() {
  const navigation = useNavigation<any>();
  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);
  const [cropId, setCropId] = useState<string | null>(null);
  const [image, setImage] = useState<Asset | null>(null);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const pickImage = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (result.assets?.[0]) setImage(result.assets[0]);
  };

  const onAnalyze = () => {
    if (!image?.uri) return;
    navigation.navigate('DiseaseProcessing', {
      imageUri: image.uri,
      imageFileName: image.fileName ?? null,
      imageType: image.type ?? null,
      cropId,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Identify a Crop Disease</Text>
      <Text style={styles.subtitle}>
        Upload a clear photo of the affected leaf or plant. This is an AI advisory only — not a
        replacement for professional consultation.
      </Text>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
    lineHeight: typography.lineHeights.sm,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.sm,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    backgroundColor: colors.neutral.gray100,
    marginBottom: spacing.md,
  },
  addImage: {
    height: 160,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  addImageLabel: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
  },
  submit: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
});
