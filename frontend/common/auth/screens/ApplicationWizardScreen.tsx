import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { StepIndicator } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { DealerBusinessStep } from '../components/application/DealerBusinessStep';
import { DocumentsStep } from '../components/application/DocumentsStep';
import { ExpertProfessionalStep } from '../components/application/ExpertProfessionalStep';
import { ReviewStep } from '../components/application/ReviewStep';

// The account step (name, email, phone, password) was the sign-up form, so it is always done here.
const DETAILS = 1;
const DOCUMENTS = 2;
const REVIEW = 3;

/**
 * A dealer's or expert's application (A3b; SRDS §7–§11): the details, the documents, then a review and the submission.
 * A draft or a rejected application can be changed; one under review opens on the review, read only, because the
 * database freezes it until the admin decides.
 */
export function ApplicationWizardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation();
  const profile = useAuthStore(state => state.profile);
  const userId = useAuthStore(state => state.user?.id);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const role = profile?.role === 'expert' ? 'expert' : 'dealer';
  const underReview = profile?.account_status === 'pending' && !!profile.application_submitted_at;
  const [step, setStep] = useState(underReview ? REVIEW : DETAILS);
  const steps = ['Account', role === 'dealer' ? 'Business' : 'Professional', 'Documents', 'Review'];

  const onSubmitted = async () => {
    await refreshProfile().catch(() => undefined);
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <StepIndicator steps={steps} current={step} />
      {step === DETAILS && role === 'dealer' ? <DealerBusinessStep onDone={() => setStep(DOCUMENTS)} /> : null}
      {step === DETAILS && role === 'expert' ? <ExpertProfessionalStep onDone={() => setStep(DOCUMENTS)} /> : null}
      {step === DOCUMENTS ? (
        <DocumentsStep role={role} userId={userId} editable={!underReview} onDone={() => setStep(REVIEW)} />
      ) : null}
      {step === REVIEW ? (
        <>
          <ReviewStep role={role} editable={!underReview} onSubmitted={onSubmitted} />
          {underReview ? <DocumentsStep role={role} userId={userId} editable={false} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[4] },
  });
}
