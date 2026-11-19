import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { Banner } from './Banner';
import { Button } from './Button';
import { Chip } from './Chip';
import { Sheet } from './Sheet';
import { TextField } from './TextField';

interface ConfirmReason {
  /** The field's label: "Reason for rejecting". */
  label: string;
  /** Quick answers; choosing one fills the box, and the person can still edit it. */
  chips?: string[];
  /** The fewest characters that count as a reason (default 1). */
  minLength?: number;
  /** Ask, but do not insist. */
  optional?: boolean;
  /** Under the box: who sees it ("Ali Khan sees this"). */
  helper?: string;
}

export interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The question, naming the object: "Reject this order?". */
  title: string;
  /** The consequence, in a sentence: "Ali Khan is told it was rejected." */
  message: string;
  /** Names the act: "Reject order", "Suspend Bilal Khan". Never "OK" or "Confirm". */
  confirmLabel: string;
  /** The quiet way out, which keeps things as they are: "Keep the order". */
  keepLabel?: string;
  /** Destructive acts are `danger`; an approval or a payment is a primary button. */
  destructive?: boolean;
  /** Ask for a reason whenever the other person is told, or the audit log records it (BR-15). */
  reason?: ConfirmReason;
  /** Runs the act with the reason (or ""). The sheet stays open, with the typed reason, until this resolves; if it
   * rejects, the failure is shown inside the sheet. */
  onConfirm: (reason: string) => Promise<unknown> | void;
}

/** A sheet that asks before a destructive, money or approval action (D15, "Confirm and feedback"): it names the
 * consequence and the object, asks for a reason when someone else is told, and its button is named for the act. It closes
 * itself once `onConfirm` succeeds. */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  keepLabel = 'Go back',
  destructive = false,
  reason,
  onConfirm,
}: ConfirmSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // A sheet closed from outside starts clean next time: no old reason, no old failure.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setText('');
      setFailure(null);
    }
  }

  const trimmed = text.trim();
  const needed = reason ? (reason.optional ? 0 : (reason.minLength ?? 1)) : 0;
  const tooShort = reason !== undefined && trimmed.length < needed;
  // Only once something is typed, or an attempt was made: a fresh sheet does not open already scolding.
  const shortMessage = tooShort && text.length > 0 ? `Write at least ${needed} characters` : undefined;

  const dismiss = () => {
    if (!pending) onClose();
  };

  const confirm = async () => {
    setPending(true);
    setFailure(null);
    try {
      await onConfirm(trimmed);
      setPending(false);
      onClose();
    } catch (error) {
      // Stays open with the typed reason, so nothing has to be written twice.
      setFailure(error);
      setPending(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={dismiss}
      title={title}
      footer={
        <View style={styles.footer}>
          <Button
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            size="lg"
            loading={pending}
            disabled={tooShort}
            onPress={() => {
              // Not returned: the press itself is done at once; the request is tracked by `pending`.
              confirm();
            }}
          />
          <Button label={keepLabel} variant="quiet" size="md" disabled={pending} onPress={dismiss} />
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.message}>{message}</Text>
        {reason ? (
          <View>
            {reason.chips?.length ? (
              <View style={styles.chips}>
                {reason.chips.map(chip => (
                  <Chip key={chip} label={chip} selected={text === chip} disabled={pending} onPress={() => setText(chip)} />
                ))}
              </View>
            ) : null}
            <TextField
              label={reason.label}
              optional={reason.optional}
              helper={reason.helper}
              error={shortMessage}
              value={text}
              onChangeText={setText}
              editable={!pending}
              multiline
              textAlignVertical="top"
              style={styles.reasonInput}
            />
          </View>
        ) : null}
        {failure ? <Banner tone="danger" title="Couldn't finish">{errorMessage(failure)}</Banner> : null}
      </View>
    </Sheet>
  );
}

function makeStyles({ colors, space, size, typography }: Theme) {
  return StyleSheet.create({
    body: { gap: space[4] },
    message: { ...typography.body, color: colors.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
    reasonInput: { minHeight: size.input * 2 },
    footer: { gap: space[2] },
  });
}
