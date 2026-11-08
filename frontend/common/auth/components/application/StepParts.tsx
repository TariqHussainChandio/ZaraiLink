import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Theme, useTheme } from '../../../../theme';
import { Banner, Button, Skeleton } from '../../../components';
import { errorMessage } from '../../../../utils/errorMessage';

/** The shape of a form that is still loading: a label and a box, four times. A blank form would read as "nothing was ever
 * saved", which is the wrong thing to tell a rejected applicant who is about to correct what they sent. */
export function FormSkeleton() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading your saved details" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.skeletonField}>
          <Skeleton style={styles.skeletonLabel} />
          <Skeleton style={styles.skeletonBox} />
        </View>
      ))}
    </View>
  );
}

/** A load that failed. The form is not drawn behind it: saving an empty form over what was sent before, or starting a new
 * application where one exists, is worse than waiting for a retry. */
export function StepLoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Banner tone="danger" title="Couldn't load your saved details" actionLabel="Try again" onAction={onRetry}>
      {errorMessage(error)}
    </Banner>
  );
}

export interface StepActionsProps {
  /** Present from the second step on. */
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/** Back and the step's main action side by side, at the end of the step. Back is the way between steps: the header's and the
 * system's Back leave the whole application and are caught by the wizard too. */
export function StepActions({ onBack, primaryLabel, onPrimary, loading, disabled }: StepActionsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.actions}>
      {onBack ? (
        <View style={styles.back}>
          <Button label="Back" variant="secondary" size="lg" onPress={onBack} />
        </View>
      ) : null}
      <View style={styles.primary}>
        <Button label={primaryLabel} size="lg" loading={loading} disabled={disabled} onPress={onPrimary} />
      </View>
    </View>
  );
}

function makeStyles({ space, size }: Theme) {
  return StyleSheet.create({
    skeleton: { gap: space[4] },
    skeletonField: { gap: space[2] },
    skeletonLabel: { height: size.iconSm, width: '35%' },
    skeletonBox: { height: size.input },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    back: { flexGrow: 1, flexBasis: 0, minWidth: size.touchMin * 2 },
    primary: { flexGrow: 2, flexBasis: 0, minWidth: size.touchMin * 3 },
  });
}
