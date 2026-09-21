import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../components/ui';
import { createDiseaseCase, predictDisease, uploadDiseaseImage } from '../../services/modules/ai/diseaseService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import { navigateToConsultExpert } from './expertHandoff';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
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
        <Text style={styles.status}>{t('disease.processing.analyzingStatus')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.errorTitle}>{t('disease.processing.errorTitle')}</Text>
      <Text style={styles.errorText}>{error}</Text>

      <Button label={t('common.retry')} onPress={run} style={styles.action} />
      <Button
        label={t('disease.processing.talkToExpertButton')}
        variant="secondary"
        onPress={() => navigateToConsultExpert(navigation, { cropId, imageUrl: uploadedImageUrl })}
        style={styles.action}
      />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    status: {
      marginTop: spacing.md,
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
    },
    errorTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    errorText: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    action: {
      marginTop: spacing.sm,
      alignSelf: 'stretch',
    },
  });
}
