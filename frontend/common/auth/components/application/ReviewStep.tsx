import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, StatusBadge } from '../../../components';
import { BUSINESS_TYPE_LABELS, SPECIALIZATION_LABELS } from '../../../constants/labels';
import { useOwnExpertProfile } from '../../../../expert';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';
import { useApplicationDocuments, useDealerApplication, useRequiredDocuments, useSubmitApplication } from '../../hooks/application';
import type { ApplicationRole } from '../../types/application';
import { FormSkeleton, StepActions } from './StepParts';

export interface ReviewStepProps {
  role: ApplicationRole;
  /** False while under review: the summary only, no submit. */
  editable: boolean;
  onSubmitted: () => void;
  /** Back to the documents. */
  onBack?: () => void;
  /** "Change" beside each section; both are present while the application can still be edited. */
  onChangeDetails?: () => void;
  onChangeDocuments?: () => void;
}

/**
 * Everything the applicant is about to send, with anything missing called out before they submit. The server checks the
 * same again (submit_application()), and its answer, naming what is missing, is shown if it disagrees.
 */
export function ReviewStep({ role, editable, onSubmitted, onBack, onChangeDetails, onChangeDocuments }: ReviewStepProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dealer = useDealerApplication(role === 'dealer');
  const expert = useOwnExpertProfile(role === 'expert');
  const required = useRequiredDocuments();
  const documents = useApplicationDocuments(role);
  const submit = useSubmitApplication();

  const queries = [role === 'dealer' ? dealer : expert, required, documents];
  const loading = queries.some(query => query.isPending);
  const failed = queries.find(query => query.isError);

  // Until everything has loaded, "Not filled in" and a disabled button would claim the application is empty.
  if (loading) return <FormSkeleton />;
  if (failed) {
    return (
      <Banner tone="danger" title="Couldn't load your application" actionLabel="Try again" onAction={() => queries.forEach(query => query.refetch())}>
        {errorMessage(failed.error)}
      </Banner>
    );
  }

  const rows: [string, string | null | undefined][] =
    role === 'dealer'
      ? [
          ['Business name', dealer.data?.business_name],
          ['Business type', dealer.data ? BUSINESS_TYPE_LABELS[dealer.data.business_type] : null],
          ['Registration number', dealer.data?.registration_number],
          ['Address', dealer.data?.business_address],
          ['Location', dealer.data ? [dealer.data.city, dealer.data.province, dealer.data.country].join(', ') : null],
        ]
      : [
          ['Qualifications', expert.data?.qualifications],
          ['Highest degree or certification', expert.data?.degree],
          ['Years of experience', expert.data?.years_experience?.toString()],
          ['Institution', expert.data?.institution_affiliation],
          [
            'Specializations',
            expert.data?.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]).join(', ') || null,
          ],
        ];
  const detailsMissing = role === 'dealer' ? !dealer.data : !expert.data?.institution_affiliation || expert.data.years_experience === null;
  const attached = new Set((documents.data ?? []).map(d => d.required_document_id));
  const checklist = (required.data ?? []).filter(r => r.is_required).map(r => ({ label: r.label, done: attached.has(r.id) }));
  const ready = !detailsMissing && checklist.every(item => item.done);

  const onSubmit = async () => {
    // A refusal (application_incomplete) is shown from the mutation's own error.
    const sent = await submit.mutateAsync().then(() => true, () => false);
    if (sent) onSubmitted();
  };

  return (
    <View style={styles.list}>
      <Card>
        <View style={styles.heading}>
          <Text style={styles.headingText}>{role === 'dealer' ? 'Business' : 'Professional details'}</Text>
          {editable && onChangeDetails ? (
            <Button
              label="Change"
              variant="quiet"
              size="sm"
              fullWidth={false}
              onPress={onChangeDetails}
              accessibilityLabel={`Change ${role === 'dealer' ? 'business' : 'professional'} details`}
            />
          ) : null}
        </View>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.term}>{label}</Text>
            <Text style={[styles.value, !value && styles.missing]}>{value || 'Not filled in'}</Text>
          </View>
        ))}
      </Card>
      {/* Under review the same files are listed below in full, so the checklist is only for an application still being
          prepared. */}
      {editable ? (
        <Card>
          <View style={styles.heading}>
            <Text style={styles.headingText}>Required documents</Text>
            {onChangeDocuments ? (
              <Button label="Change" variant="quiet" size="sm" fullWidth={false} onPress={onChangeDocuments} accessibilityLabel="Change documents" />
            ) : null}
          </View>
          {checklist.map(item => (
            <View key={item.label} style={styles.check}>
              <Text style={styles.checkLabel}>{item.label}</Text>
              <StatusBadge kind="document" status={item.done ? 'added' : 'needed'} size="sm" />
            </View>
          ))}
        </Card>
      ) : null}
      {editable && !ready ? <Banner tone="warning">Add what is missing above before you send the application.</Banner> : null}
      {submit.error ? <Banner tone="danger">{errorMessage(submit.error)}</Banner> : null}
      {editable ? (
        <StepActions onBack={onBack} primaryLabel="Send for review" disabled={!ready} loading={submit.isPending} onPrimary={onSubmit} />
      ) : (
        <Banner tone="info">Your application is with an administrator. It cannot be changed until they decide.</Banner>
      )}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    list: { gap: space[3] },
    heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], marginBottom: space[2] },
    headingText: { ...typography.bodyStrong, color: colors.ink, flexShrink: 1 },
    row: { paddingVertical: space[1], gap: space[1] },
    term: { ...typography.caption, color: colors.ink2 },
    value: { ...typography.body, color: colors.ink, flexShrink: 1 },
    // The warning's `ink`, not its `mark`: text needs the 4.5:1 that the mark (an icon colour) is not held to.
    missing: { color: colors.status.warning.ink },
    check: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingVertical: space[1] },
    checkLabel: { ...typography.body, color: colors.ink, flexShrink: 1 },
  });
}
