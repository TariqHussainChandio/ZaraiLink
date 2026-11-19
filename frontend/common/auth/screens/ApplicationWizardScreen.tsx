import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { ScreenScaffold, StepIndicator } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { DealerBusinessStep } from '../components/application/DealerBusinessStep';
import { DocumentsStep } from '../components/application/DocumentsStep';
import { ExpertProfessionalStep } from '../components/application/ExpertProfessionalStep';
import { RejectionReason } from '../components/application/RejectionReason';
import { ReviewStep } from '../components/application/ReviewStep';

// The account step (name, email, phone, password) was the sign-up form, so it is always done here.
const DETAILS = 1;
const DOCUMENTS = 2;
const REVIEW = 3;

/**
 * A dealer's or expert's application (A3b; SRDS §7–§11): the details, the documents, then a review and the submission.
 * A draft or a rejected application can be changed; one under review opens on the review, read only, because the
 * database freezes it until the admin decides. Back (the button, the app bar's arrow and the system gesture) goes to the
 * step before, and leaves the application only from the first step.
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
  const leaving = useRef(false);
  const heading = useRef<Text>(null);

  // Back inside the application steps one step back instead of dropping everything typed. `leaving` lets the screen's own
  // exit (after the application was sent) through.
  useEffect(() => {
    if (underReview || step === DETAILS) return;
    return navigation.addListener('beforeRemove', event => {
      if (leaving.current) return;
      event.preventDefault();
      setStep(current => Math.max(DETAILS, current - 1));
    });
  }, [navigation, step, underReview]);

  // A new step starts at its top (the scaffold is keyed by the step) and TalkBack moves to its title, so a person who
  // cannot see the screen hears where they are instead of staying on the button that is gone.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [step]);

  const onSubmitted = async () => {
    await refreshProfile().catch(() => undefined);
    leaving.current = true;
    navigation.goBack();
  };

  const back = () => setStep(current => Math.max(DETAILS, current - 1));

  return (
    <ScreenScaffold key={step}>
      <StepIndicator steps={steps} current={step} />
      <Text ref={heading} style={styles.stepTitle} accessibilityRole="header">
        {`Step ${step + 1} of ${steps.length}: ${step === REVIEW ? (underReview ? 'Your application' : 'Review') : steps[step]}`}
      </Text>
      <RejectionReason />
      {step === DETAILS && role === 'dealer' ? <DealerBusinessStep onDone={() => setStep(DOCUMENTS)} /> : null}
      {step === DETAILS && role === 'expert' ? <ExpertProfessionalStep onDone={() => setStep(DOCUMENTS)} /> : null}
      {step === DOCUMENTS ? (
        <DocumentsStep role={role} userId={userId} editable={!underReview} onBack={back} onDone={() => setStep(REVIEW)} />
      ) : null}
      {step === REVIEW ? (
        <View style={styles.review}>
          <ReviewStep
            role={role}
            editable={!underReview}
            onBack={back}
            onSubmitted={onSubmitted}
            onChangeDetails={() => setStep(DETAILS)}
            onChangeDocuments={() => setStep(DOCUMENTS)}
          />
          {underReview ? <DocumentsStep role={role} userId={userId} editable={false} /> : null}
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    stepTitle: { ...typography.title, color: colors.ink },
    review: { gap: space[3] },
  });
}
