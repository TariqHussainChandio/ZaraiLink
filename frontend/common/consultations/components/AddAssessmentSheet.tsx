import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Chip, Sheet, TextField, useToast } from '../../components';
import { statusMeta } from '../../constants/status';
import { useCreateConsultationAssessment } from '../hooks/consultations';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { VERDICTS_NEEDING_DIAGNOSIS, type AssessmentVerdict } from '../types/consultations';

const VERDICTS: AssessmentVerdict[] = ['agree', 'correct', 'additional_diagnosis', 'request_information'];

interface AddAssessmentSheetProps {
  consultationId: string;
  visible: boolean;
  onClose: () => void;
}

/** The assigned expert records an Expert Assessment: a verdict on the AI result plus their own diagnosis and advice. It is
 * stored apart from the AI report (SRDS §35); the server enforces who may add one and when, this form only helps. */
export function AddAssessmentSheet({ consultationId, visible, onClose }: AddAssessmentSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const create = useCreateConsultationAssessment(consultationId);
  const toast = useToast();
  const [verdict, setVerdict] = useState<AssessmentVerdict | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [verdictError, setVerdictError] = useState<string | undefined>();
  const [diagnosisError, setDiagnosisError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const needsDiagnosis = verdict !== null && VERDICTS_NEEDING_DIAGNOSIS.includes(verdict);

  const reset = () => {
    setVerdict(null);
    setDiagnosis('');
    setRecommendations('');
    setVerdictError(undefined);
    setDiagnosisError(undefined);
    setSubmitError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = async () => {
    setSubmitError(null);
    if (!verdict) {
      setVerdictError('Choose a verdict');
      return;
    }
    const trimmedDiagnosis = diagnosis.trim();
    // Mirrors the server's 422 for these verdicts, so the expert is told before a round trip.
    if (needsDiagnosis && !trimmedDiagnosis) {
      setDiagnosisError('Enter your diagnosis');
      return;
    }
    try {
      await create.mutateAsync({
        verdict,
        diagnosis: trimmedDiagnosis || null,
        recommendations: recommendations.trim() || null,
      });
      close();
      toast.success('Assessment saved');
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Add assessment">
      <Text style={styles.label}>Your verdict on the AI result</Text>
      <View style={styles.verdicts} accessibilityRole="radiogroup">
        {VERDICTS.map(option => (
          <Chip
            key={option}
            label={statusMeta('assessment', option).label}
            selected={verdict === option}
            onPress={() => {
              setVerdict(option);
              setVerdictError(undefined);
              setDiagnosisError(undefined);
            }}
          />
        ))}
      </View>
      {verdictError ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {verdictError}
        </Text>
      ) : null}

      <TextField
        label="Diagnosis"
        optional={!needsDiagnosis}
        value={diagnosis}
        onChangeText={text => {
          setDiagnosis(text);
          setDiagnosisError(undefined);
        }}
        error={diagnosisError}
        multiline
        numberOfLines={3}
      />
      <TextField
        label="Recommendations"
        optional
        value={recommendations}
        onChangeText={setRecommendations}
        multiline
        numberOfLines={4}
      />

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" title="Could not save the assessment">
            {submitError}
          </Banner>
        </View>
      ) : null}

      <Button label="Save assessment" loading={create.isPending} onPress={onSubmit} />
    </Sheet>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    label: {
      ...typography.label,
      color: colors.ink,
      marginBottom: space[2],
    },
    verdicts: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginBottom: space[2],
    },
    error: {
      ...typography.caption,
      color: colors.status.danger.ink,
      marginBottom: space[2],
    },
    banner: {
      marginBottom: space[3],
    },
  });
}
