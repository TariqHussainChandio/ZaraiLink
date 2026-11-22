import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Sheet } from '../../common/components';
import { type Theme, useTheme } from '../../theme';

export interface ConfirmSheetProps {
  visible: boolean;
  /** The question: "Receive this purchase?" */
  title: string;
  /** What happens, in one or two plain sentences. */
  message: string;
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  /** A change that removes or closes something takes the danger button. */
  destructive?: boolean;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Asks before a change that cannot be taken back (receive a purchase, remove a product), in the app's own bottom sheet
 * rather than the system `Alert` (maintainer decision 2026-10-11; the dispatch confirmation in OrderDetailScreen is
 * the model). The sheet stays open while the change runs, so the button shows its progress, and the screen closes it.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  confirmIcon,
  destructive = false,
  cancelLabel = 'Not now',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.body}>
        <Text style={styles.message}>{message}</Text>
        <Button
          label={confirmLabel}
          icon={confirmIcon}
          variant={destructive ? 'danger' : 'primary'}
          loading={loading}
          onPress={onConfirm}
        />
        <Button label={cancelLabel} variant="secondary" disabled={loading} onPress={onClose} />
      </View>
    </Sheet>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    body: { gap: space[3] },
    message: { ...typography.body, color: colors.ink },
  });
}
