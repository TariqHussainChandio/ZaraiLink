import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  Card,
  ListGroup,
  ListRow,
  QueryState,
  ScreenScaffold,
  StatusBadge,
  StickyActionBar,
} from '../../common/components';
import { BUSINESS_TYPE_LABELS, SPECIALIZATION_LABELS } from '../../common/constants/labels';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { ApplicationDecision } from '../../expert';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { formatDay } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessage';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { DocumentViewer } from '../components/DocumentViewer';
import {
  useApplicationDocumentUrl,
  useDealerApplication,
  useDecideDealerApplication,
  useExpertApplication,
  useReviewVerification,
} from '../hooks/admin';

// The applicant reads a rejection's reason in the app and in the email, so it must say something (A3a).
const MIN_REASON = 10;
const REJECTION_REASONS = ['A document is unclear', 'A document is missing', 'The details do not match the documents'];
const DAY_MS = 24 * 60 * 60 * 1000;

interface Document {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  required_document: { label: string } | null;
}

interface Section {
  title: string;
  /** Shown in the code face: an identifier, not a sentence. */
  rows: [label: string, value: string | null | undefined, code?: boolean][];
}

/** Whole days since an ISO time. */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
}

const isImage = (document: Document) => document.mime_type?.startsWith('image/') ?? false;

/** "Photo · 1.2 MB", "PDF · 340 KB": what the file is and how big, never its file name. */
function fileFacts(document: Document): string {
  const kind = isImage(document) ? 'Photo' : document.mime_type === 'application/pdf' ? 'PDF' : 'File';
  const size = document.size_bytes;
  if (size === null || size === undefined) return kind;
  return `${kind} · ${size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`}`;
}

/**
 * One dealer or expert application, as SRDS §12 lists it (D4): who applied and where it stands, the documents named by
 * what they are (each opens in a zoomable viewer, or the phone's PDF viewer), the business or professional details, and the
 * decision in a bar at the bottom. Approving or rejecting needs the second factor and writes the audit row with the
 * decision; the applicant is emailed after it (SRDS §9).
 */
export function ApplicationDetailScreen({ route }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.ApplicationDetail>) {
  const { role, id } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dealer = useDealerApplication(role === 'dealer' ? id : '');
  const expert = useExpertApplication(role === 'expert' ? id : '');
  const decideDealer = useDecideDealerApplication();
  const decideExpert = useReviewVerification();
  const documentUrl = useApplicationDocumentUrl();
  const [action, setAction] = useState<AdminAction | null>(null);
  const [outcome, setOutcome] = useState<{ verb: string; result: ApplicationDecision } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const query = role === 'dealer' ? dealer : expert;

  let name = '';
  let phone: string | null | undefined;
  let status: 'pending' | 'approved' | 'rejected' = 'pending';
  let statusReason: string | null | undefined;
  let submittedAt: string | null | undefined;
  let sections: Section[] = [];
  let documents: Document[] = [];
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
        title: 'Business details',
        rows: [
          ['Business name', business?.business_name],
          ['Business type', business ? BUSINESS_TYPE_LABELS[business.business_type] : null],
          ['Registration number', business?.registration_number, true],
          ['Address', business?.business_address],
          ['Location', business ? [business.city, business.province, business.country].join(', ') : null],
        ],
      },
    ];
  } else if (role === 'expert' && expert.data) {
    const e = expert.data;
    name = e.profile?.full_name ?? '';
    phone = e.profile?.phone;
    status = e.profile?.account_status ?? 'pending';
    statusReason = e.profile?.account_status_reason;
    submittedAt = e.profile?.application_submitted_at;
    documents = e.expert_documents ?? [];
    specializations = (e.expert_specializations ?? []).map(s => SPECIALIZATION_LABELS[s.specialization]);
    sections = [
      {
        title: 'Professional details',
        rows: [
          ['Qualifications', e.qualifications],
          ['Degree', e.degree],
          ['Experience', e.experience],
          ['Years of experience', e.years_experience?.toString()],
          ['Institution', e.institution_affiliation],
          ['About', e.professional_description],
        ],
      },
    ];
  }

  const decidable = status === 'pending' && !!submittedAt;
  const applicant = name || 'this applicant';
  const roleWord = role === 'dealer' ? 'dealer' : 'expert';
  const requirement = (document: Document) => document.required_document?.label ?? 'Other document';
  const imageDocuments = documents.filter(isImage).map(d => ({ id: d.id, label: requirement(d) }));
  const waitingDays = submittedAt ? daysSince(submittedAt) : 0;

  const decide = async (decision: 'approved' | 'rejected', reason?: string) => {
    const result =
      role === 'dealer'
        ? await decideDealer.mutateAsync({ id, status: decision, reason })
        : await decideExpert.mutateAsync({ expertId: id, decision, notes: reason ?? '' });
    setOutcome({ verb: decision === 'approved' ? `${roleWord[0]?.toUpperCase()}${roleWord.slice(1)} approved` : 'Application rejected', result });
    await query.refetch();
  };

  const askApprove = () => {
    setOutcome(null);
    setAction({
      title: `Approve ${applicant}?`,
      message: `${applicant} is emailed and can ${role === 'dealer' ? 'sell on ZaraiLink' : 'take consultations'} at once.`,
      confirmLabel: `Approve ${roleWord}`,
      run: () => decide('approved'),
      done: `${applicant} approved`,
    });
  };

  const askReject = () => {
    setOutcome(null);
    setAction({
      title: `Reject ${applicant}'s application?`,
      message: `${applicant} is emailed with your reason and can correct the application and send it again.`,
      confirmLabel: 'Reject application',
      destructive: true,
      reason: {
        label: 'Reason',
        chips: REJECTION_REASONS,
        minLength: MIN_REASON,
        helper: `At least ${MIN_REASON} characters. ${applicant} reads this in the app and in the email.`,
      },
      run: reason => decide('rejected', reason),
      done: `${applicant}'s application rejected`,
    });
  };

  const open = async (document: Document) => {
    setFailure(null);
    if (isImage(document)) {
      setViewing(document.id);
      return;
    }
    // A PDF opens in the phone's own viewer, which reads PDFs better than an image view can.
    setOpeningId(document.id);
    try {
      const url = await documentUrl.mutateAsync({ role, applicantId: id, documentId: document.id });
      await Linking.openURL(url);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      <ScreenScaffold
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching}
        footer={
          decidable ? (
            <StickyActionBar>
              <View style={styles.decision}>
                <View style={styles.decisionButton}>
                  <Button label="Reject…" variant="secondary" size="lg" onPress={askReject} />
                </View>
                <View style={styles.decisionButton}>
                  <Button label={`Approve ${roleWord}`} size="lg" onPress={askApprove} />
                </View>
              </View>
            </StickyActionBar>
          ) : undefined
        }
      >
        <QueryState query={query} failureTitle="Couldn't load this application">
          {query.data ? (
            <>
              <Card>
                <View style={styles.header}>
                  <Text style={styles.name} accessibilityRole="header">
                    {name || 'Unnamed applicant'}
                  </Text>
                  <StatusBadge kind="application" status={status} />
                </View>
                <Text style={styles.meta}>
                  {[
                    roleWord[0]?.toUpperCase() + roleWord.slice(1),
                    submittedAt ? `sent ${formatDay(submittedAt)}${status === 'pending' ? `, waiting ${waitingDays === 0 ? 'since today' : waitingDays === 1 ? '1 day' : `${waitingDays} days`}` : ''}` : 'not sent yet',
                    phone,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Card>

              {statusReason && status !== 'approved' ? (
                <Banner tone="warning" title={status === 'rejected' ? 'Not approved' : 'Not approved before'}>
                  {statusReason}
                </Banner>
              ) : null}

              {outcome ? (
                <Banner tone={outcome.result.email_delivered ? 'success' : 'warning'} title={outcome.verb}>
                  {outcome.result.email_delivered
                    ? `${applicant} was emailed.`
                    : `The email to ${applicant} could not be sent. They will see the decision in the app.`}
                </Banner>
              ) : null}
              {failure ? <Banner tone="danger">{failure}</Banner> : null}

              <View>
                <Text style={styles.heading} accessibilityRole="header">
                  Documents
                </Text>
                {documents.length === 0 ? (
                  <Text style={styles.meta}>No documents attached.</Text>
                ) : (
                  <ListGroup>
                    {documents.map(document => (
                      <ListRow
                        key={document.id}
                        title={requirement(document)}
                        meta={openingId === document.id ? 'Opening…' : fileFacts(document)}
                        onPress={() => open(document)}
                        accessibilityLabel={`${requirement(document)}, ${fileFacts(document)}, ${isImage(document) ? 'opens the photo' : 'opens the PDF'}`}
                      />
                    ))}
                  </ListGroup>
                )}
              </View>

              {sections.map(section => (
                <Card key={section.title}>
                  <Text style={styles.heading} accessibilityRole="header">
                    {section.title}
                  </Text>
                  {section.rows.map(([label, value, code]) => (
                    <View key={label} style={styles.row}>
                      <Text style={styles.term}>{label}</Text>
                      <Text style={code ? styles.code : styles.value}>{value || '—'}</Text>
                    </View>
                  ))}
                </Card>
              ))}

              {specializations.length ? (
                <Card>
                  <Text style={styles.heading} accessibilityRole="header">
                    Specializations
                  </Text>
                  <View style={styles.badges}>
                    {specializations.map(label => (
                      <Badge key={label} label={label} tone="info" />
                    ))}
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}
        </QueryState>
      </ScreenScaffold>

      <DocumentViewer
        visible={viewing !== null}
        onClose={() => setViewing(null)}
        role={role}
        applicantId={id}
        documents={imageDocuments}
        startId={viewing ?? undefined}
      />
      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    name: { ...typography.title, color: colors.ink, flexShrink: 1 },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    heading: { ...typography.bodyStrong, color: colors.ink, marginBottom: space[2] },
    row: { paddingVertical: space[1], gap: space[1] },
    term: { ...typography.caption, color: colors.ink3 },
    value: { ...typography.body, color: colors.ink },
    code: { ...typography.code, color: colors.ink },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
    decision: { flex: 1, flexDirection: 'row', gap: space[3] },
    decisionButton: { flex: 1 },
  });
}
