import { useNavigation, useRoute } from '@react-navigation/native';
import { CircleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Badge, Banner, Button, EmptyState, ScreenScaffold, Spinner, StickyActionBar } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { RoleScopeProvider, useTheme, type Theme } from '../../theme';
import { useDiseaseCase } from '../hooks/disease';
import { confidenceLevel, splitPredictedDisease, type ConfidenceLevel } from '../types/disease';
import { navigateToConsultExpert } from './expertHandoff';

interface RouteParams {
  diseaseCaseId: string;
  /** From the predict answer: false when the model read the photo as another crop than the chosen one (D16). */
  cropMatches?: boolean | null;
  chosenCropName?: string | null;
}

// Confidence in words first, the number second: a percentage alone means little in the field, and it is never a
// success-green badge beside a disease (FA-06).
const CONFIDENCE_WORDS: Record<ConfidenceLevel, { badge: string; sentence: string }> = {
  high: { badge: 'Very likely', sentence: 'The scan is very sure' },
  medium: { badge: 'Likely', sentence: 'The scan is fairly sure' },
  low: { badge: 'Not sure', sentence: 'The scan is not sure' },
};

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the farmer home's "Is a crop sick?" card, so the expert action
// can assume a farmer's nav tree.
export function DiseaseResultScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { diseaseCaseId, cropMatches, chosenCropName } = useRoute().params as RouteParams;
  const navigation = useNavigation<any>();
  const tabs = useAppTabNavigation();
  const { data: diseaseCase, isPending: loading, error, refetch } = useDiseaseCase(diseaseCaseId);

  if (loading) return <Spinner fullscreen />;
  if (error || !diseaseCase) {
    return (
      <EmptyState
        title="Couldn't load this result"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => refetch()}
      />
    );
  }

  const prediction = diseaseCase.prediction;
  const mismatch = cropMatches === false;
  const level = confidenceLevel(prediction?.confidence_score ?? 0);
  const isLow = level === 'low';
  const percent = Math.round((prediction?.confidence_score ?? 0) * 100);
  const { crop, condition } = splitPredictedDisease(prediction?.predicted_disease ?? '');
  // The report text and steps are shown only for a matching crop and a sure-enough scan (BR-13, D16).
  const showReport = !!prediction && !mismatch && !isLow;

  const askExpert = () =>
    navigateToConsultExpert(tabs, {
      cropId: diseaseCase.crop_id,
      cropName: diseaseCase.crop?.name ?? chosenCropName,
      imageUrl: diseaseCase.image_signed_url,
      diseaseCaseId: diseaseCase.id,
    });

  const footer = (
    <StickyActionBar>
      <Button label="Ask an expert" size="lg" onPress={askExpert} />
    </StickyActionBar>
  );

  return (
    <RoleScopeProvider scope="ai">
      <ScreenScaffold footer={footer}>
        {mismatch ? (
          <Banner tone="advisory" title={chosenCropName ? `This does not look like ${chosenCropName.toLowerCase()}` : 'This does not look like the crop you chose'}>
            The scan reads this photo as a different plant, so it cannot give advice. An expert can look at your photo.
          </Banner>
        ) : (
          <Banner tone="advisory" title="A suggestion, not a diagnosis">
            Results can be wrong. Check with an expert before you spray.
          </Banner>
        )}

        <Image source={{ uri: diseaseCase.image_signed_url }} style={styles.photo} accessibilityLabel="Your leaf photo" accessibilityIgnoresInvertColors />

        {prediction && !mismatch ? (
          <View style={styles.stack}>
            <Text style={styles.name} accessibilityRole="header">
              {condition}
            </Text>
            {crop ? <Text style={styles.meta}>{crop}</Text> : null}
            <View style={styles.inline}>
              <Badge label={CONFIDENCE_WORDS[level].badge} tone={isLow ? 'warning' : 'info'} icon={CircleAlert} />
              <Text style={styles.meta}>{`${CONFIDENCE_WORDS[level].sentence}: ${percent}% match`}</Text>
            </View>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${percent} percent match`}
              accessibilityValue={{ min: 0, max: 100, now: percent }}
            >
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
          </View>
        ) : null}

        {!prediction && !mismatch ? <Text style={styles.body}>No prediction is available for this case.</Text> : null}

        {isLow && !mismatch && prediction ? (
          <Banner tone="warning" title="The scan is not sure">
            Take another photo in daylight, one leaf filling the frame, or ask an expert. We are not showing treatment steps for a result this unsure.
          </Banner>
        ) : null}

        {showReport && prediction.description ? (
          <View style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              What the scan found
            </Text>
            <Text style={styles.body}>{prediction.description}</Text>
          </View>
        ) : null}

        {showReport && prediction.recommended_actions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              What to do now
            </Text>
            {prediction.recommended_actions.map(action => (
              <Text key={action} style={styles.body}>
                {`•  ${action}`}
              </Text>
            ))}
          </View>
        ) : null}

        <Button label="Scan another plant" variant="quiet" onPress={() => navigation.navigate(HOME_ROUTES.DiseaseAdvisory)} />
      </ScreenScaffold>
    </RoleScopeProvider>
  );
}

function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    photo: { width: '100%', height: size.photoHero, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
    stack: { gap: space[2] },
    name: { ...typography.titleLg, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
    track: { height: space[2], borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent.ai.mark },
    section: { gap: space[2] },
    heading: { ...typography.title, color: colors.ink },
    body: { ...typography.bodyLg, color: colors.ink },
  });
}
