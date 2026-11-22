import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { ApiError } from '../../services/api/errors';
import { ConfirmSheet, type ConfirmSheetProps } from './ConfirmSheet';

function sheet(props: Partial<ConfirmSheetProps> = {}) {
  return (
    <ConfirmSheet
      visible
      onClose={() => undefined}
      title="Reject this order?"
      message="Nadia Batool is told it was rejected."
      confirmLabel="Reject order"
      keepLabel="Keep the order"
      onConfirm={() => undefined}
      {...props}
    />
  );
}

/** A promise a test settles when it chooses. */
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ConfirmSheet', () => {
  it('names the question, the consequence, the act and the quiet way out', async () => {
    await render(sheet());
    expect(screen.getByRole('header', { name: 'Reject this order?' })).toBeTruthy();
    expect(screen.getByText('Nadia Batool is told it was rejected.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject order' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep the order' })).toBeTruthy();
  });

  it('draws a destructive act as a danger button and an approval as a primary one', async () => {
    await render(sheet({ destructive: true }));
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Reject order' }).props.style).backgroundColor).toBe(lightTheme.colors.status.danger.fill);
    await render(sheet({ destructive: false, confirmLabel: 'Approve application' }));
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Approve application' }).props.style).backgroundColor).toBe(lightTheme.colors.accent.brand.fill);
  });

  it('runs the act and closes when it succeeds', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    await render(sheet({ onConfirm, onClose }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('keeps things as they are with the quiet button', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    await render(sheet({ onConfirm, onClose }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep the order' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('stays open, busy and unable to be dismissed, while the request runs', async () => {
    const request = deferred();
    const onClose = jest.fn();
    await render(sheet({ onConfirm: () => request.promise, onClose }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
    expect(screen.getByRole('button', { name: 'Reject order' }).props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByRole('button', { name: 'Keep the order' }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).not.toHaveBeenCalled();
    request.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('shows a failure inside the sheet, stays open and keeps what was typed', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn().mockRejectedValue(new ApiError({ status: 409, code: 'invalid_transition', kind: 'conflict', message: 'x' }));
    await render(sheet({ onConfirm, onClose, reason: { label: 'Reason for rejecting', minLength: 5 } }));
    await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'Out of stock today');
    await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
    expect(await screen.findByText('That cannot be done at this stage.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Out of stock today')).toBeTruthy();
    // And it can be tried again.
    expect(screen.getByRole('button', { name: 'Reject order' }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  describe('with a reason', () => {
    const reason = { label: 'Reason for rejecting', chips: ['Out of stock', 'Price changed'], minLength: 8, helper: 'Nadia Batool sees this' };

    it('will not act until a reason of the least length is written', async () => {
      const onConfirm = jest.fn().mockResolvedValue(undefined);
      await render(sheet({ reason, onConfirm }));
      expect(screen.getByRole('button', { name: 'Reject order' }).props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'Short');
      expect(screen.getByText('Write at least 8 characters')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
      expect(onConfirm).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'Out of stock until Friday');
      expect(screen.getByRole('button', { name: 'Reject order' }).props.accessibilityState).toMatchObject({ disabled: false });
    });

    it('does not open already scolding', async () => {
      await render(sheet({ reason }));
      expect(screen.queryByText(/Write at least/)).toBeNull();
      expect(screen.getByText('Nadia Batool sees this')).toBeTruthy();
    });

    it('fills the box from a quick answer, and sends the reason with the act', async () => {
      const onConfirm = jest.fn().mockResolvedValue(undefined);
      await render(sheet({ reason: { ...reason, minLength: 5 }, onConfirm }));
      await fireEvent.press(screen.getByRole('button', { name: 'Out of stock' }));
      expect(screen.getByDisplayValue('Out of stock')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Out of stock' })).toBeSelected();
      await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Out of stock'));
    });

    it('lets an optional reason be left empty', async () => {
      const onConfirm = jest.fn().mockResolvedValue(undefined);
      await render(sheet({ reason: { label: 'Note', optional: true }, onConfirm }));
      expect(screen.getByText('Optional')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Reject order' }));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(''));
    });

    it('starts clean the next time it is opened', async () => {
      const { rerender } = await render(sheet({ reason }));
      await fireEvent.changeText(screen.getByLabelText('Reason for rejecting'), 'Out of stock until Friday');
      await rerender(sheet({ reason, visible: false }));
      await rerender(sheet({ reason, visible: true }));
      expect(screen.getByLabelText('Reason for rejecting').props.value).toBe('');
    });
  });
});
