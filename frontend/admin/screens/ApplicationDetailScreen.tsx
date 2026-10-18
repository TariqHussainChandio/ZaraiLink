import { CircleCheck, CircleX } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  DocumentTile,
  ScreenState,
  Sheet,
  StatusBadge,
  TextField,
} from '../../common/components';
import {
  BUSINESS_TYPE_LABELS,
  SPECIALIZATION_LABELS,
} from '../../common/constants/labels';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { ApplicationDecision } from '../../expert';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import {
  useApplicationDocumentUrl,
  useDealerApplication,
  useDecideDealerApplication,
  useExpertApplication,
  useReviewVerification,
} from '../hooks/admin';

// The applicant reads a rejection's reason in the app and in the email, so it must say something (A3a).
const MIN_REASON = 10;
const longDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface Document {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  required_document: { label: string } | null;
}

interface Section {
  title: string;
  rows: [string, string | null | undefined][];
}

/**
 * One dealer or expert application, as SRDS §12 lists it: the applicant, the business or professional information, the
 * submitted documents (each opened from a short-lived link), then the decision. Approving or rejecting needs the
 * second factor and writes the audit row with the decision; the applicant is emailed after it (SRDS §9).
 */
export function ApplicationDetailScreen({
  route,
  navigation,
}: AdminScreenProps<typeof ADMIN_HOME_ROUTES.ApplicationDetail>) {
  const { role, id } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dealer = useDealerApplication(role === 'dealer' ? id : '');
  const expert = useExpertApplication(role === 'expert' ? id : '');
  const decideDealer = useDecideDealerApplication();
  const decideExpert = useReviewVerification();
  const documentUrl = useApplicationDocumentUrl();
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<ApplicationDecision | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const query = role === 'dealer' ? dealer : expert;
  if (!query.data) {
    return (
      <ScreenState
        query={query}
        errorTitle="Couldn't load this application"
        empty={{
          title: 'Application not found',
          description: 'Go back and open it again.',
        }}
      />
    );
  }

  let name: string;
  let phone: string | null | undefined;
  let status: 'pending' | 'approved' | 'rejected';
  let statusReason: string | null | undefined;
  let submittedAt: string | null | undefined;
  let sections: Section[];
  let documents: Document[];
  let specializations: string[] = [];
  if (role === 'dealer' && dealer.data) {
    const d = dealer.data;
    const business = d.dealer_profile;
    name = d.full_name;
    phone = d.phone;
    status = d.account_status;
    statusReason = d.account_status_reason;
    submittedAt = d.application_submitted_at;
    documents = d.dealer_documents;
    sections = [
      {
        title: 'Business information',
        rows: [
          ['Business name', business?.business_name],
          [
            'Business type',
            business ? BUSINESS_TYPE_LABELS[business.business_type] : null,
          ],
          ['Registration number', business?.registration_number],
          ['Address', business?.business_address],
          [
            'Location',
            business
              ? [business.city, business.province, business.country].join(', ')
              : null,
          ],
        ],
      },
    ];
  } else {
    const e = expert.data;
    name = e?.profile?.full_name ?? '';
    phone = e?.profile?.phone;
    status = e?.profile?.account_status ?? 'pending';
    statusReason = e?.profile?.account_status_reason;
    submittedAt = e?.profile?.application_submitted_at;
    documents = e?.expert_documents ?? [];
    specializations = (e?.expert_specializations ?? []).map(
      s => SPECIALIZATION_LABELS[s.specialization],
    );
    sections = [
      {
        title: 'Professional information',
        rows: [
          ['Qualifications', e?.qualifications],
          ['Degree', e?.degree],
          ['Professional experience', e?.experience],
          ['About', e?.professional_description],
        ],
      },
      {
        title: 'Experience',
        rows: [['Years of experience', e?.years_experience?.toString()]],
      },
      {
        title: 'Institution affiliation',
        rows: [['Institution', e?.institution_affiliation]],
      },
    ];
  }
  const decidable = status === 'pending' && !!submittedAt;
  const deciding = decideDealer.isPending || decideExpert.isPending;

  const decide = async (decision: 'approved' | 'rejected', text?: string) => {
    setFailure(null);
    try {
      const result =
        role === 'dealer'
          ? await decideDealer.mutateAsync({
              id,
              status: decision,
              reason: text,
            })
          : await decideExpert.mutateAsync({
              expertId: id,
              decision,
              notes: text ?? '',
            });
      setOutcome(result);
      await query.refetch();
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const reject = async () => {
    if (reason.trim().length < MIN_REASON) {
      setReasonError(`Write at least ${MIN_REASON} characters`);
      return;
    }
    setRejecting(false);
    await decide('rejected', reason.trim());
  };

  const open = async (document: Document) => {
    setFailure(null);
    try {
      const url = await documentUrl.mutateAsync({
        role,
        applicantId: id,
        documentId: document.id,
      });
      // A photo opens here; a PDF in the phone's own viewer, which reads PDFs better than an image view can.
      if (document.mime_type?.startsWith('image/')) {
        navigation.navigate(ADMIN_HOME_ROUTES.DocumentViewer, {
          url,
          title: document.file_name,
        });
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={styles.header}>
          <Text style={styles.name} accessibilityRole="header">
            {name || 'Unnamed applicant'}
          </Text>
          <StatusBadge kind="application" status={status} />
        </View>
        <Text style={styles.meta}>
          {role === 'dealer' ? 'Dealer application' : 'Expert application'}
        </Text>
        {phone ? <Text style={styles.meta}>{phone}</Text> : null}
        <Text style={styles.meta}>
          {submittedAt
            ? `Sent ${longDate.format(new Date(submittedAt))}`
            : 'Not sent yet'}
        </Text>
      </Card>

      {status === 'rejected' && statusReason ? (
        <Banner tone="danger" title="Reason given">
          {statusReason}
        </Banner>
      ) : null}

      {sections.map(section => (
        <Card key={section.title}>
          <Text style={styles.heading}>{section.title}</Text>
          {section.rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.term}>{label}</Text>
              <Text style={styles.value}>{value || '—'}</Text>
            </View>
          ))}
        </Card>
      ))}

      {specializations.length ? (
        <Card>
          <Text style={styles.heading}>Specializations</Text>
          <View style={styles.badges}>
            {specializations.map(label => (
              <Badge key={label} label={label} tone="info" />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.heading}>Submitted documents</Text>
        {documents.length === 0 ? (
          <Text style={styles.meta}>No documents attached.</Text>
        ) : null}
        <View style={styles.documents}>
          {documents.map(document => (
            <View key={document.id} style={styles.document}>
              <Text style={styles.term}>
                {document.required_document?.label ?? 'Earlier document'}
              </Text>
              <DocumentTile
                fileName={document.file_name}
                mimeType={document.mime_type}
                sizeBytes={document.size_bytes}
                onView={() => open(document)}
                busy={
                  documentUrl.isPending &&
                  documentUrl.variables?.documentId === document.id
                }
              />
            </View>
          ))}
        </View>
      </Card>

      {outcome ? (
        <Banner
          tone={outcome.email_delivered ? 'success' : 'warning'}
          title="Decision recorded"
        >
          {outcome.email_delivered
            ? 'The applicant has been emailed.'
            : 'The email to the applicant could not be sent. They will see the decision in the app.'}
        </Banner>
      ) : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}

      {decidable ? (
        <View style={styles.actions}>
          <Button
            label="Approve"
            icon={CircleCheck}
            loading={deciding}
            onPress={() => setApproving(true)}
          />
          <Button
            label="Reject"
            icon={CircleX}
            variant="danger"
            disabled={deciding}
            onPress={() => {
              setReason('');
              setReasonError(undefined);
              setRejecting(true);
            }}
          />
        </View>
      ) : null}

      {/* An approval opens the account to trade or advise and cannot be taken back here, so it is confirmed first, like
          a rejection: one stray tap on the button used to decide it. */}
      <Sheet
        visible={approving}
        onClose={() => setApproving(false)}
        title={`Approve ${name || 'this application'}`}
      >
        <View style={styles.sheet}>
          <Text style={styles.meta}>
            {role === 'dealer'
              ? 'The dealer can sell on the marketplace once they sign in again.'
              : 'The expert can take consultations once they sign in again.'}
          </Text>
          <Button
            label="Approve application"
            icon={CircleCheck}
            onPress={() => {
              setApproving(false);
              decide('approved');
            }}
          />
          <Button
            label="Not now"
            variant="secondary"
            onPress={() => setApproving(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject ${name || 'this application'}`}
      >
        <View style={styles.sheet}>
          <TextField
            label="Reason"
            helper="The applicant reads this in the app and in the email, and can correct the application."
            value={reason}
            onChangeText={setReason}
            error={reasonError}
            multiline
          />
          <Button
            label="Reject application"
            icon={CircleX}
            variant="danger"
            onPress={reject}
          />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[3] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
    },
    name: { ...typography.title, color: colors.ink, flexShrink: 1 },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    heading: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
    row: { paddingVertical: space[1], gap: space[1] },
    term: { ...typography.caption, color: colors.ink3 },
    value: { ...typography.body, color: colors.ink },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
    documents: { gap: space[3] },
    document: { gap: space[1] },
    actions: { gap: space[2] },
    sheet: { gap: space[3] },
  });
}
