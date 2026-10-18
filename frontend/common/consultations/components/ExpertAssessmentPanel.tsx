import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationAssessment } from '../types/consultations';

interface ExpertAssessmentPanelProps {
  assessments: ConsultationAssessment[];
  expertName: string;
  /** The assigned expert's way in to add one; absent for everyone else. */
  action?: React.ReactNode;
}

/** The Expert Assessments, newest first, always labelled as the expert's and kept apart from the AI assessment (SRDS §35).
 * They are append-only: a later one supersedes an earlier one, so the history stays visible. */
export function ExpertAssessmentPanel({ assessments, expertName, action }: ExpertAssessmentPanelProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const newestFirst = useMemo(
    () => [...assessments].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [assessments],
  );

  return (
    <Card style={styles.card}>
      <Text style={styles.overline} accessibilityRole="header">
        Expert assessment
      </Text>
      <Text style={styles.byline}>{`By ${expertName}`}</Text>
      {newestFirst.length === 0 ? (
        <Text style={styles.empty}>The expert has not given an assessment yet.</Text>
      ) : (
        newestFirst.map((assessment, index) => (
          <View key={assessment.id} style={[styles.entry, index > 0 && styles.divided]}>
            <View style={styles.entryHeader}>
              <StatusBadge kind="assessment" status={assessment.verdict} size="sm" />
              <Text style={styles.date}>{new Date(assessment.created_at).toLocaleDateString()}</Text>
            </View>
            {assessment.diagnosis ? (
              <>
                <Text style={styles.label}>Diagnosis</Text>
                <Text style={styles.text}>{assessment.diagnosis}</Text>
              </>
            ) : null}
            {assessment.recommendations ? (
              <>
                <Text style={styles.label}>Recommendations</Text>
                <Text style={styles.text}>{assessment.recommendations}</Text>
              </>
            ) : null}
          </View>
        ))
      )}
      {action ? <View style={styles.action}>{action}</View> : null}
    </Card>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    card: {
      marginTop: space[3],
    },
    overline: {
      ...typography.overline,
      color: colors.ink2,
    },
    byline: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    empty: {
      ...typography.body,
      color: colors.ink2,
    },
    entry: {
      paddingVertical: space[2],
    },
    divided: {
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space[2],
      marginBottom: space[1],
    },
    date: {
      ...typography.caption,
      color: colors.ink2,
    },
    label: {
      ...typography.label,
      color: colors.ink,
      marginTop: space[2],
    },
    text: {
      ...typography.body,
      color: colors.ink,
    },
    action: {
      marginTop: space[3],
    },
  });
}
