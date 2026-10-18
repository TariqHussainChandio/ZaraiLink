import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { ImageOff, Stethoscope } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Banner, Button, Card, ScreenState, Skeleton, StatusBadge } from '../../common/components';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../common/constants/routes';
import { useDiseaseCase } from '../hooks/disease';
import { useRelatedListings } from '../../common/marketplace';
import { useTheme, type Theme } from '../../theme';
import { navigateToConsultExpert } from './expertHandoff';
import { formatRs } from '../../utils/money';
import type { DiseaseCaseWithPrediction } from '../types/disease';

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the Quick Actions level (`SellerDashboard.tsx`), so both the
// "Consult an Expert" CTA (needs the requester-side Consultations tab) and the marketplace
// tap-through below can assume a farmer's nav tree.
export function DiseaseResultScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { diseaseCaseId } = useRoute().params as { diseaseCaseId: string };
  const diseaseCaseQuery = useDiseaseCase(diseaseCaseId);
  const { refetch } = diseaseCaseQuery;
  const { data: relatedListings = [] } = useRelatedListings(diseaseCaseQuery.data?.crop?.name);

  // The photo link is signed for ten minutes only (access is re-checked through RLS on every fetch), so the case is
  // fetched again whenever the screen regains focus: a farmer coming back to it gets a fresh link, never a dead one.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScreenState
      query={diseaseCaseQuery}
      errorTitle="Couldn't load this result"
      // A case is one record, never a list: only a missing record counts as empty.
      isEmpty={() => false}
      empty={{
        title: "Couldn't load this result",
        description: 'Check your connection and try again.',
        actionLabel: 'Retry',
        onAction: () => {
          diseaseCaseQuery.refetch();
        },
      }}
      skeleton={<ResultSkeleton styles={styles} />}
    >
      {diseaseCase => (
        <ResultContent
          diseaseCase={diseaseCase}
          relatedListings={relatedListings}
          styles={styles}
        />
      )}
    </ScreenState>
  );
}

/** The loading shape of the result: the photo, the disease name and a few report lines. */
function ResultSkeleton({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.container, styles.content]} accessible accessibilityLabel="Loading your result">
      <Skeleton style={styles.image} />
      <Skeleton style={styles.skeletonTitle} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={styles.skeletonLineShort} />
    </View>
  );
}

function ResultContent({
  diseaseCase,
  relatedListings,
  styles,
}: {
  diseaseCase: DiseaseCaseWithPrediction;
  relatedListings: NonNullable<ReturnType<typeof useRelatedListings>['data']>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const report = diseaseCase.report ?? null;
  // Null when the photo is no longer in storage: the result still shows, with a placeholder for the picture.
  const imageUrl = diseaseCase.image_signed_url ?? null;
  // The backend decides the band (threshold 0.60) so the app and the expert's view never disagree on it.
  const isLowConfidence = report?.confidence_band === 'low';
  const consultExpert = () =>
    navigateToConsultExpert(navigation, {
      cropId: diseaseCase.crop_id,
      imageUrl,
      predictedDisease: report?.predicted_disease,
      diseaseCaseId: diseaseCase.id,
    });
  const consultButton = (
    <Button
      label="Consult an Expert"
      icon={Stethoscope}
      variant={isLowConfidence || !report ? 'primary' : 'secondary'}
      onPress={consultExpert}
      style={styles.action}
    />
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Your leaf photo"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.image, styles.imageMissing]} accessible accessibilityLabel="The photo is no longer available">
          <ImageOff size={theme.size.iconMd} color={theme.colors.ink2} />
          <Text style={styles.imageMissingText}>The photo is no longer available</Text>
        </View>
      )}

      {report ? (
        <>
          {/* BR-13: every result carries the advisory disclaimer, worded by the knowledge base, never by the app. */}
          <View style={styles.block}>
            <Banner tone="advisory">{report.disclaimer}</Banner>
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.disease} accessibilityRole="header">
              {report.predicted_disease}
            </Text>
            {/* Read as words first: "Low confidence" means more to a listener than a bare percentage. */}
            <View
              accessible
              accessibilityLabel={`${isLowConfidence ? 'Low' : 'Good'} confidence, ${Math.round(report.confidence_score * 100)} percent`}
            >
              <Badge
                label={`${Math.round(report.confidence_score * 100)}% confidence`}
                tone={isLowConfidence ? 'warning' : 'success'}
              />
            </View>
          </View>

          {report.review_status === 'pending_review' ? (
            <View style={styles.reviewRow}>
              <StatusBadge kind="knowledge" status={report.review_status} size="sm" />
              <Text style={styles.reviewText}>Draft, pending agronomist review</Text>
            </View>
          ) : null}

          {isLowConfidence ? (
            <View style={styles.block}>
              <Banner tone="warning" title="Low confidence: ask an expert to check">
                The app is not sure about this photo. Use the notes below only as a first idea.
              </Banner>
            </View>
          ) : null}
          {/* BR-13: when the model is unsure, the expert route comes before the report, not after it. */}
          {isLowConfidence ? consultButton : null}

          {report.is_healthy ? (
            <>
              <View style={styles.block}>
                {/* BR-13: a healthy class is still the AI's estimate from one photo, never an all-clear; the expert
                    route below stays visible for it too. */}
                <Banner tone="info" title="The AI found no sign of disease">
                  This is an estimate from one photo, not a diagnosis. If the plant still looks unwell, ask an expert to
                  check.
                </Banner>
              </View>
              <ReportList title="Preventive care" items={report.precautions} styles={styles} />
            </>
          ) : (
            <>
              <ReportList title="Symptoms" items={report.symptoms} styles={styles} />
              <ReportList title="Treatment" items={report.treatment} styles={styles} />
              <ReportList title="Precautions" items={report.precautions} styles={styles} />
            </>
          )}

          {report.advisory ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Advisory
              </Text>
              <Text style={styles.description}>{report.advisory}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.description}>
          {diseaseCase.status === 'failed'
            ? 'This photo could not be analysed. An expert can still look at it.'
            : 'No prediction is available for this case.'}
        </Text>
      )}

      {isLowConfidence ? null : consultButton}

      {relatedListings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Related Products
          </Text>
          <Text style={styles.sectionCaption}>These may help. They are not a sure cure.</Text>
          {relatedListings.map(listing => (
            <Pressable
              key={listing.id}
              accessibilityRole="button"
              accessibilityLabel={`${listing.title}, ${formatRs(listing.price)} per ${listing.unit}`}
              accessibilityHint="Opens the product in the marketplace"
              onPress={() =>
                navigation
                  .getParent?.()
                  ?.navigate(APP_TABS.Marketplace, {
                    screen: MARKETPLACE_ROUTES.ListingDetail,
                    params: { listingId: listing.id },
                  })
              }
            >
              <Card style={styles.listingCard}>
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {listing.title}
                </Text>
                <Text style={styles.listingPrice}>
                  {`${formatRs(listing.price)}/${listing.unit}`}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** One titled list of the report; an empty list is left out rather than shown as a bare heading. */
function ReportList({
  title,
  items = [],
  styles,
}: {
  title: string;
  items?: string[];
  styles: ReturnType<typeof makeStyles>;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={index} style={styles.bullet}>
          {'•'} {item}
        </Text>
      ))}
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, size }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    image: {
      width: '100%',
      height: size.photoHero,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
      marginBottom: space[3],
    },
    imageMissing: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
    },
    imageMissingText: {
      ...typography.caption,
      color: colors.ink2,
    },
    block: {
      marginBottom: space[3],
    },
    skeletonTitle: {
      width: '60%',
      height: typography.title.fontSize,
      marginBottom: space[3],
    },
    skeletonLine: {
      width: '100%',
      height: typography.caption.fontSize,
      marginBottom: space[2],
    },
    skeletonLineShort: {
      width: '40%',
      height: typography.caption.fontSize,
    },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      marginBottom: space[3],
    },
    reviewText: {
      flex: 1,
      ...typography.caption,
      color: colors.ink2,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[2],
    },
    disease: {
      flex: 1,
      marginRight: space[2],
      ...typography.title,
      color: colors.ink,
    },
    description: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[3],
    },
    section: {
      marginBottom: space[4],
    },
    sectionTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
      marginBottom: space[1],
    },
    sectionCaption: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    bullet: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1] / 2,
    },
    action: {
      marginBottom: space[4],
    },
    listingCard: {
      marginBottom: space[2],
    },
    listingTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    listingPrice: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
