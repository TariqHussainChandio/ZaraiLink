// Scan Disease result screen: the advisory AI report with an "Ask an expert" button (BR-13).
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CircleAlert, ImageOff } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  ScreenScaffold,
  ScreenState,
  Skeleton,
  StatusBadge,
  StickyActionBar,
} from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { RoleScopeProvider, useTheme, type Theme } from '../../theme';
import { useDiseaseCase } from '../hooks/disease';
import { confidenceLevel, type ConfidenceLevel, type DiseaseCaseWithPrediction } from '../types/disease';
import { navigateToConsultExpert } from './expertHandoff';

// What the processing screen passes in: the case id and whether the crop matched.
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

// The style sheet type, passed down to the child components.
type Styles = ReturnType<typeof makeStyles>;

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the farmer home's "Is a crop sick?" card, so the expert action and the
// marketplace tap-through can assume a farmer's nav tree.
// Loads the case and shows the result, a loading skeleton, or an error.
export function DiseaseResultScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { diseaseCaseId, cropMatches, chosenCropName } = useRoute().params as RouteParams;
  const diseaseCaseQuery = useDiseaseCase(diseaseCaseId);
  const { refetch } = diseaseCaseQuery;

  // The photo link is signed for ten minutes only (access is re-checked through RLS on every fetch), so the case is
  // fetched again whenever the screen regains focus: a farmer coming back to it gets a fresh link, never a dead one.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <RoleScopeProvider scope="ai">
      <ScreenState
        query={diseaseCaseQuery}
        errorTitle="Couldn't load this result"
        // A case is one record, never a list: only a missing record counts as empty.
        isEmpty={() => false}
        empty={{
          title: "Couldn't load this result",
          description: 'Check your connection and try again.',
          actionLabel: 'Try again',
          onAction: () => {
            diseaseCaseQuery.refetch();
          },
        }}
        skeleton={<ResultSkeleton styles={styles} />}
      >
        {diseaseCase => (
          <ResultContent
            diseaseCase={diseaseCase}
            mismatch={cropMatches === false}
            chosenCropName={chosenCropName ?? null}
            styles={styles}
          />
        )}
      </ScreenState>
    </RoleScopeProvider>
  );
}

/** The loading shape of the result: the photo, the disease name and a few report lines. */
function ResultSkeleton({ styles }: { styles: Styles }) {
  return (
    <View style={styles.skeleton} accessible accessibilityLabel="Loading your result">
      <Skeleton style={styles.photo} />
      <Skeleton style={styles.skeletonTitle} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={styles.skeletonLineShort} />
    </View>
  );
}

// The result body: disclaimer, photo, disease name, confidence and the report lists.
function ResultContent({
  diseaseCase,
  mismatch,
  chosenCropName,
  styles,
}: {
  diseaseCase: DiseaseCaseWithPrediction;
  mismatch: boolean;
  chosenCropName: string | null;
  styles: Styles;
}) {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const tabs = useAppTabNavigation();
  const report = diseaseCase.report ?? null;
  // Null when the photo is no longer in storage: the result still shows, with a placeholder for the picture.
  const imageUrl = diseaseCase.image_signed_url ?? null;
  const level = report ? confidenceLevel(report) : 'low';
  // The backend decides the band (threshold 0.60) so the app and the expert's view never disagree on it.
  const isLow = level === 'low';
  const percent = Math.round((report?.confidence_score ?? 0) * 100);

  // BR-13: every result routes to an expert, so the action is always on screen, whatever the result says.
  const askExpert = () =>
    navigateToConsultExpert(tabs, {
      cropId: diseaseCase.crop_id,
      cropName: diseaseCase.crop?.name ?? chosenCropName,
      imageUrl,
      predictedDisease: mismatch ? undefined : report?.predicted_disease,
      diseaseCaseId: diseaseCase.id,
    });

  const footer = (
    <StickyActionBar>
      <Button label="Ask an expert" size="lg" onPress={askExpert} />
    </StickyActionBar>
  );

  return (
    <ScreenScaffold footer={footer}>
      {mismatch ? (
        <Banner
          tone="advisory"
          title={chosenCropName ? `This does not look like ${chosenCropName.toLowerCase()}` : 'This does not look like the crop you chose'}
        >
          The scan reads this photo as a different plant, so it cannot give advice. An expert can look at your photo.
        </Banner>
      ) : report ? (
        // BR-13: every result carries the advisory disclaimer, worded by the knowledge base, never by the app.
        <Banner tone="advisory" title="A suggestion, not a diagnosis">
          {report.disclaimer}
        </Banner>
      ) : null}

      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.photo}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Your leaf photo"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.photo, styles.photoMissing]} accessible accessibilityLabel="The photo is no longer available">
          <ImageOff size={theme.size.iconMd} color={theme.colors.ink2} />
          <Text style={styles.meta}>The photo is no longer available</Text>
        </View>
      )}

      {report && !mismatch ? (
        <>
          <View style={styles.stack}>
            <Text style={styles.name} accessibilityRole="header">
              {report.is_healthy ? 'Healthy leaf' : report.disease}
            </Text>
            <Text style={styles.meta}>{report.crop}</Text>
            {/* Read as words first: "Not sure" means more to a listener than a bare percentage. */}
            <View
              style={styles.inline}
              accessible
              accessibilityLabel={`${CONFIDENCE_WORDS[level].badge}, ${percent} percent match`}
            >
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

          {report.review_status === 'pending_review' ? (
            <View style={styles.inline}>
              <StatusBadge kind="knowledge" status={report.review_status} size="sm" />
              {/* The badge already says "Pending agronomist review"; the line beside it says what that means for the
                  farmer, so the status is not read twice (A8). */}
              <Text style={styles.meta}>Draft advice, not yet checked</Text>
            </View>
          ) : null}

          {isLow ? (
            <Banner tone="warning" title="Low confidence: ask an expert to check">
              The app is not sure about this photo. Take another photo in daylight, one leaf filling the frame, or ask an
              expert. Use the notes below only as a first idea.
            </Banner>
          ) : null}

          {report.is_healthy ? (
            <>
              {/* BR-13: a healthy class is still the AI's estimate from one photo, never an all-clear; the expert
                  action stays visible for it too. */}
              <Banner tone="info" title="The AI found no sign of disease">
                This is an estimate from one photo, not a diagnosis. If the plant still looks unwell, ask an expert to
                check.
              </Banner>
              <ReportList title="Preventive care" items={report.precautions} styles={styles} />
            </>
          ) : (
            <>
              <ReportList title="Symptoms" items={report.symptoms} styles={styles} />
              <ReportList title="What to do now" items={report.treatment} styles={styles} />
              <ReportList title="Precautions" items={report.precautions} styles={styles} />
            </>
          )}

          {report.advisory ? (
            <View style={styles.section}>
              <Text style={styles.heading} accessibilityRole="header">
                Advisory
              </Text>
              <Text style={styles.body}>{report.advisory}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {!report && !mismatch ? (
        <Text style={styles.body}>
          {diseaseCase.status === 'failed'
            ? 'This photo could not be analysed. An expert can still look at it.'
            : 'No prediction is available for this case.'}
        </Text>
      ) : null}

      <Button label="Scan another plant" variant="quiet" onPress={() => navigation.navigate(HOME_ROUTES.DiseaseAdvisory)} />
    </ScreenScaffold>
  );
}

/** One titled list of the report; an empty list is left out rather than shown as a bare heading. */
function ReportList({ title, items = [], styles }: { title: string; items?: string[]; styles: Styles }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={index} style={styles.body}>
          {`•  ${item}`}
        </Text>
      ))}
    </View>
  );
}

// Builds the screen's styles from the theme.
function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    skeleton: { flex: 1, backgroundColor: colors.surface, padding: space[4], gap: space[2] },
    photo: { width: '100%', height: size.photoHero, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
    photoMissing: { alignItems: 'center', justifyContent: 'center', gap: space[2] },
    skeletonTitle: { width: '60%', height: typography.title.fontSize },
    skeletonLine: { width: '100%', height: typography.caption.fontSize },
    skeletonLineShort: { width: '40%', height: typography.caption.fontSize },
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
