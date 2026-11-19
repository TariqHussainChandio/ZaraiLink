import React, { useState } from 'react';
import { ConfirmSheet, type ConfirmSheetProps, useSnackbar } from '../../common/components';
import { errorMessage } from '../../utils/errorMessage';

/** One admin act that needs a confirmation (AD-04, BR-15): what it does in words, the reason the audit log keeps where the
 * API takes one, and what to say when it is done. */
export interface AdminAction {
  /** The question, naming the person or item: "Suspend Bilal Khan?". */
  title: string;
  /** The consequence, in a sentence or two. */
  message: string;
  /** Names the act: "Suspend Bilal Khan", "Remove listing". */
  confirmLabel: string;
  /** Destructive acts are red; a restore or an approval is the primary colour. */
  destructive?: boolean;
  /** Present only where the API stores a reason (report notes, an application decision). */
  reason?: ConfirmSheetProps['reason'];
  /** Does it. Resolves when the server has recorded it; a rejection is shown inside the sheet. */
  run: (reason: string) => Promise<unknown>;
  /** The Snackbar text, in the past tense: "Bilal Khan suspended". */
  done: string;
  /** Takes it back, for an act that can be reversed; offered as "Undo" on the Snackbar. */
  undo?: () => Promise<unknown>;
}

interface Props {
  /** The act being confirmed; null keeps the sheet closed. */
  action: AdminAction | null;
  onClose: () => void;
}

/** The one confirmation every admin act goes through (suspend, hide, dismiss, retire, remove): a ConfirmSheet whose button
 * names the act, which stays open with the typed reason if the server refuses, and then a Snackbar with Undo where the
 * act is reversible. */
export function AdminActionSheet({ action, onClose }: Props) {
  const snackbar = useSnackbar();
  // Kept after `action` goes back to null, so the sheet slides away with its words still in it.
  const [shown, setShown] = useState(action);
  if (action && action !== shown) setShown(action);

  if (!shown) return null;

  const confirm = async (reason: string) => {
    await shown.run(reason);
    const undo = shown.undo;
    snackbar.show(
      shown.done,
      undo
        ? {
            label: 'Undo',
            onPress: () => {
              undo().then(
                () => snackbar.show('Undone'),
                error => snackbar.show(errorMessage(error)),
              );
            },
          }
        : undefined,
    );
  };

  return (
    <ConfirmSheet
      visible={action !== null}
      onClose={onClose}
      title={shown.title}
      message={shown.message}
      confirmLabel={shown.confirmLabel}
      destructive={shown.destructive}
      reason={shown.reason}
      onConfirm={confirm}
    />
  );
}
