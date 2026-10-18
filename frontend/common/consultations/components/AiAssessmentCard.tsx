import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Banner, Card, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { AiCaseSummary } from '../types/consultations';

const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

const BAND_LABEL = {
  confident: 'Confident',
  low: 'Low confidence',
} as const;

interface AiAssessmentCardProps {
  summary: AiCaseSummary;
}

/** The AI result on the consultation's disease case. It is advisory only (BR-13) and kept visually and in data apart from
 * the Expert Assessment (SRDS §35), so it is always headed "AI assessment" and carries the disclaimer. */
export function AiAssessmentCard({ summary }: AiAssessmentCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { report, image_url: imageUrl } = summary;
  const symptoms = report.symptoms ?? [];
  // Worded as the AI's estimate, never a verdict: only the expert's assessment is an answer (BR-13).
  const finding = report.is_healthy ? 'AI found no sign of disease' : report.disease;

  return (
    <Card style={styles.card} pad="none">
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.photo}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Photo of the plant the AI assessed"
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.overline} accessibilityRole="header">
            AI assessment
          </Text>
          <StatusBadge kind="knowledge" status={report.review_status} size="sm" />
        </View>
        <Text style={styles.disease} accessibilityLabel={`AI finding: ${finding}`}>
          {finding}
        </Text>
        <Text style={styles.meta}>{`Crop: ${report.crop}`}</Text>
        <Text style={styles.meta}>
          {`${BAND_LABEL[report.confidence_band]} (${PERCENT.format(report.confidence_score)})`}
        </Text>

        {symptoms.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Symptoms
            </Text>
            {symptoms.map(symptom => (
              <Text key={symptom} style={styles.item} accessibilityLabel={symptom}>{`• ${symptom}`}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            AI advisory
          </Text>
          <Text style={styles.item}>{report.advisory}</Text>
        </View>

        <View style={styles.section}>
          <Banner tone="advisory">{report.disclaimer}</Banner>
        </View>
      </View>
    </Card>
  );
}

function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    card: {
      marginTop: space[3],
      overflow: 'hidden',
    },
    photo: {
      width: '100%',
      height: size.photoHero,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      backgroundColor: colors.line,
    },
    body: {
      padding: space[4],
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space[2],
      marginBottom: space[1],
    },
    overline: {
      ...typography.overline,
      color: colors.ink2,
    },
    disease: {
      ...typography.title,
      color: colors.ink,
      marginBottom: space[1],
    },
    meta: {
      ...typography.caption,
      color: colors.ink2,
    },
    section: {
      marginTop: space[3],
    },
    sectionTitle: {
      ...typography.label,
      color: colors.ink,
      marginBottom: space[1],
    },
    item: {
      ...typography.body,
      color: colors.ink,
    },
  });
}
