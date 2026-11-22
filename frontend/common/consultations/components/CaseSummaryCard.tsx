import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationWithRelations } from '../../../expert';
import { formatAgo } from '../../../utils/dates';
import { AiSuggestionBlock, type AiSuggestion } from './AiSuggestionBlock';
import { PriorityBadge } from './PriorityBadge';
import { isActiveStatus } from '../utils/requests';

export interface CaseSummaryCardProps {
  consultation: ConsultationWithRelations;
  /** The other person in the case, from the viewer's side. */
  counterpartyName: string;
  /** Signed URL for each of `consultation.images`, in order; a photo whose URL has not arrived is skipped. */
  photoUrls: (string | undefined)[];
  onOpenPhoto: (index: number) => void;
  ai?: AiSuggestion | null;
}

/** The top of a case thread (D4): status, urgency and age; the requester's own words in `bodyLg`; their photos, each
 * opening full screen; and the AI's suggestion as its own advisory block, kept apart from both people (BR-13). It folds
 * to the header so a long thread can have the room. */
export function CaseSummaryCard({ consultation, counterpartyName, photoUrls, onOpenPhoto, ai }: CaseSummaryCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(true);
  const requesterName = consultation.user?.full_name || 'The requester';
  const total = consultation.images.length;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityLabel={`${consultation.subject}, case details`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the details' : 'Shows the details'}
        android_ripple={{ color: theme.colors.ripple }}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.subject}>{consultation.subject}</Text>
          <View style={styles.badges}>
            <StatusBadge kind="consultation" status={consultation.status} />
            {isActiveStatus(consultation.status) ? <PriorityBadge priority={consultation.priority} /> : null}
            <Text style={styles.age}>{formatAgo(consultation.created_at)}</Text>
          </View>
        </View>
        <Chevron color={theme.colors.ink2} size={theme.size.iconMd} />
      </Pressable>

      {open ? (
        <View style={styles.details}>
          <Text style={styles.meta}>
            {`With ${counterpartyName}${consultation.crop ? ` · ${consultation.crop.name}` : ''}`}
          </Text>
          {consultation.problem_description ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>{`${requesterName}'s description`}</Text>
              <Text style={styles.problem}>{consultation.problem_description}</Text>
            </View>
          ) : null}
          {total > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {photoUrls.map((url, index) =>
                url ? (
                  <Pressable
                    key={url}
                    onPress={() => onOpenPhoto(index)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Photo ${index + 1} of ${total} from ${requesterName}`}
                    accessibilityHint="Opens the photo full screen"
                  >
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                ) : null,
              )}
            </ScrollView>
          ) : null}
          {ai ? <AiSuggestionBlock suggestion={ai} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, size }: Theme) {
  return StyleSheet.create({
    card: { gap: space[3] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: size.touchMin,
    },
    headerText: { flex: 1, gap: space[1] },
    subject: { ...typography.title, color: colors.ink },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space[2],
    },
    age: { ...typography.caption, color: colors.ink2 },
    details: { gap: space[3] },
    meta: { ...typography.caption, color: colors.ink2 },
    block: { gap: space[1] },
    blockLabel: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
    },
    // The requester's own words are what the expert acts on: reading size, not caption.
    problem: { ...typography.bodyLg, color: colors.ink },
    photos: { gap: space[2] },
    photo: {
      width: size.photoLg,
      height: size.photoLg,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSunken,
    },
  });
}
