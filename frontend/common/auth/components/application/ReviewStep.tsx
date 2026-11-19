import { Check, CircleAlert, Send } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, SkeletonList, useToast } from '../../../components';
import { BUSINESS_TYPE_LABELS, SPECIALIZATION_LABELS } from '../../../constants/labels';
import { useOwnExpertProfile } from '../../../../expert';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';
import { useApplicationDocuments, useDealerApplication, useRequiredDocuments, useSubmitApplication } from '../../hooks/application';
import type { ApplicationRole } from '../../types/application';

export interface ReviewStepProps {
  role: ApplicationRole;
  /** False while under review: the summary only, no submit. */
  editable: boolean;
  onSubmitted: () => void;
}

const YEARS_FORMAT = new Intl.NumberFormat('en-PK');

/**
 * Everything the applicant is about to send, with anything missing called out before they submit. The server checks the
 * same again (submit_application()), and its answer, naming what is missing, is shown if it disagrees.
 */
export function ReviewStep({ role, editable, onSubmitted }: ReviewStepProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dealer = useDealerApplication(role === 'dealer');
  const expert = useOwnExpertProfile(role === 'expert');
  const required = useRequiredDocuments();
  const documents = useApplicationDocuments(role);
  const submit = useSubmitApplication();
  const toast = useToast();

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
          ['Degree', expert.data?.degree],
          [
            'Years of experience',
            expert.data?.years_experience == null ? null : YEARS_FORMAT.format(expert.data.years_experience),
          ],
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
    if (sent) {
      toast.success('Application sent');
      onSubmitted();
    }
  };

  // Every part of the summary must be read before it is judged: a read still loading or failed would otherwise show as
  // "Not filled in" and keep Submit off for no reason. isLoading (not isPending) so the other role's idle query counts
  // as settled.
  const reads = [role === 'dealer' ? dealer : expert, required, documents];
  if (reads.some(read => read.isLoading)) return <SkeletonList count={3} />;
  const failed = reads.find(read => read.isError && read.data === undefined);
  if (failed) {
    return (
      <Banner
        tone="danger"
        title="Couldn't load your application"
        actionLabel={reads.some(read => read.isFetching) ? undefined : 'Retry'}
        onAction={() => {
          for (const read of reads) if (read.isError) read.refetch();
        }}
      >
        {errorMessage(failed.error)}
      </Banner>
    );
  }

  return (
    <View style={styles.list}>
      <Card>
        <Text style={styles.heading}>{role === 'dealer' ? 'Business' : 'Professional details'}</Text>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.term}>{label}</Text>
            <Text style={[styles.value, !value && styles.missing]}>{value || 'Not filled in'}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={styles.heading}>Required documents</Text>
        {checklist.map(item => {
          const Icon = item.done ? Check : CircleAlert;
          return (
            <View key={item.label} style={styles.check} accessible accessibilityLabel={`${item.label}, ${item.done ? 'added' : 'missing'}`}>
              <Icon
                color={item.done ? theme.colors.status.success.mark : theme.colors.status.warning.mark}
                size={theme.size.iconSm}
                strokeWidth={theme.size.iconStrokeBold}
              />
              <Text style={styles.value}>{item.label}</Text>
            </View>
          );
        })}
      </Card>
      {editable && !ready ? (
        <Banner tone="warning">Add what is missing above before you submit.</Banner>
      ) : null}
      {submit.error ? <Banner tone="danger">{errorMessage(submit.error)}</Banner> : null}
      {editable ? (
        <Button label="Submit for review" icon={Send} disabled={!ready} loading={submit.isPending} onPress={onSubmit} />
      ) : (
        <Banner tone="info">Your application is with an administrator. It cannot be changed until they decide.</Banner>
      )}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    list: { gap: space[3] },
    heading: { ...typography.bodyStrong, color: colors.ink, marginBottom: space[2] },
    row: { paddingVertical: space[1], gap: space[1] },
    term: { ...typography.caption, color: colors.ink3 },
    value: { ...typography.body, color: colors.ink, flexShrink: 1 },
    missing: { color: colors.status.warning.mark },
    check: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[1] },
  });
}
