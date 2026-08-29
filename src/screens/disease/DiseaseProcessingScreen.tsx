import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../components/ui';
import { createDiseaseCase, predictDisease, uploadDiseaseImage } from '../../services/modules/ai/diseaseService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import { navigateToConsultExpert } from './expertHandoff';

const { colors, spacing, typography } = lightTheme;

interface RouteParams {
  imageUri: string;
  imageFileName: string | null;
  imageType: string | null;
  cropId: string | null;
}

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the Quick Actions level (`SellerDashboard.tsx`), so the "Talk to an
// Expert" fallback below can assume the requester-side Consultations tab is available.
export function DiseaseProcessingScreen() {
  const { imageUri, imageFileName, imageType, cropId } = useRoute().params as RouteParams;
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const imageUrl = uploadedImageUrl ?? (await uploadDiseaseImage(userId, { uri: imageUri, fileName: imageFileName ?? undefined, type: imageType ?? undefined }));
      setUploadedImageUrl(imageUrl);

      const diseaseCase = await createDiseaseCase(cropId, imageUrl);
      await predictDisease(diseaseCase.id);

      navigation.replace('DiseaseResult', { diseaseCaseId: diseaseCase.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [userId, imageUri, imageFileName, imageType, cropId, uploadedImageUrl, navigation]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!error) {
    return (
      <View style={styles.container}>
        <Spinner />
        <Text style={styles.status}>Analyzing your photo...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.errorTitle}>AI analysis isn't available right now</Text>
      <Text style={styles.errorText}>{error}</Text>

      <Button label="Retry" onPress={run} style={styles.action} />
      <Button
        label="Talk to an Expert"
        variant="secondary"
        onPress={() => navigateToConsultExpert(navigation, { cropId, imageUrl: uploadedImageUrl })}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral.white,
    padding: spacing.lg,
  },
  status: {
    marginTop: spacing.md,
    fontSize: typography.sizes.base,
    color: colors.neutral.gray600,
  },
  errorTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  errorText: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  action: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
});
