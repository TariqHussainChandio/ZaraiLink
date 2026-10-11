import { useNavigation, useRoute } from '@react-navigation/native';
import { RotateCcw, Stethoscope } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Spinner } from '../../common/components';
import { useRunDiseaseAnalysis } from '../hooks/disease';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { navigateToConsultExpert } from './expertHandoff';
import { errorMessage } from '../../utils/errorMessage';
import { isApiError } from '../../services/api/errors';

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
  const { imageUri, imageFileName, imageType, cropId } = useRoute().params as RouteParams;
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);
  const analysis = useRunDiseaseAnalysis();
  const { mutate: analyze } = analysis;
  const error = analysis.error ? errorMessage(analysis.error) : null;
  // 503 means the model itself is down (checkpoint missing or failing to load), not a problem with this photo, so it
  // gets its own wording; every other failure keeps the server's message.
  const modelUnavailable = isApiError(analysis.error) && analysis.error.status === 503;
  // Without a signed-in user the analysis can never start; show the failure state instead of a spinner that never ends.
  const signedOut = !userId;

  // The photo is uploaded to the private bucket and analysed; the "Talk to an Expert" fallback below uses the
  // original local `imageUri` route param instead, which stays valid whatever happens to the upload.
  const start = useCallback(() => {
    if (!userId) return;
    analyze(
      {
        userId,
        image: { uri: imageUri, fileName: imageFileName ?? undefined, mimeType: imageType ?? undefined },
        cropId,
      },
      { onSuccess: diseaseCase => navigation.replace('DiseaseResult', { diseaseCaseId: diseaseCase.id }) },
    );
  }, [userId, imageUri, imageFileName, imageType, cropId, navigation, analyze]);

  useEffect(() => {
    start();
    // Mount-only: the analysis starts once when the screen opens; a retry is the button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!error && !signedOut) {
    return (
      <View style={styles.container}>
        <Spinner />
        {/* Announced, so a TalkBack user knows the app is working and has not frozen. */}
        <Text style={styles.status} accessibilityLiveRegion="polite" accessibilityRole="progressbar">
          Analyzing your photo...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {signedOut ? (
        <>
          <Text style={styles.errorTitle} accessibilityRole="header">
            Please sign in again
          </Text>
          <Text style={styles.errorText}>Your session ended. Sign in, then try the scan again, or send the photo to an expert.</Text>
        </>
      ) : modelUnavailable ? (
        <>
          <Text style={styles.errorTitle} accessibilityRole="header">
            Disease scan is unavailable right now
          </Text>
          <Text style={styles.errorText}>Try again in a few minutes, or send the photo to an expert now.</Text>
        </>
      ) : (
        <>
          <Text style={styles.errorTitle} accessibilityRole="header">
            {"AI analysis isn't available right now"}
          </Text>
          <Text style={styles.errorText}>{error}</Text>
        </>
      )}

      {signedOut ? null : <Button label="Retry" icon={RotateCcw} onPress={start} style={styles.action} />}
      <Button
        label="Talk to an Expert"
        icon={Stethoscope}
        variant="secondary"
        onPress={() =>
          navigateToConsultExpert(navigation, { cropId, imageUrl: imageUri, diseaseCaseId: analysis.createdCaseId })
        }
        style={styles.action}
      />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      padding: space[4],
    },
    status: {
      marginTop: space[3],
      ...typography.body,
      color: colors.ink2,
    },
    errorTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      textAlign: 'center',
      marginBottom: space[1],
    },
    errorText: {
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
      marginBottom: space[4],
    },
    action: {
      marginTop: space[2],
      alignSelf: 'stretch',
    },
  });
}
