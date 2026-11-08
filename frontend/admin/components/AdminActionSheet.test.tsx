import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { Button } from '../../common/components';
import { AdminActionSheet, type AdminAction } from './AdminActionSheet';

function Harness({ action }: { action: AdminAction }) {
  const [open, setOpen] = useState<AdminAction | null>(null);
  return (
    <>
      <Button label="Start" onPress={() => setOpen(action)} />
      <AdminActionSheet action={open} onClose={() => setOpen(null)} />
    </>
  );
}

const base = (overrides: Partial<AdminAction> = {}): AdminAction => ({
  title: 'Suspend Bilal Khan?',
  message: 'Bilal Khan cannot use ZaraiLink until you lift the suspension.',
  confirmLabel: 'Suspend Bilal Khan',
  destructive: true,
  run: jest.fn().mockResolvedValue(undefined),
  done: 'Bilal Khan suspended',
  ...overrides,
});

describe('AdminActionSheet', () => {
  it('states the consequence and does nothing until the act is confirmed', async () => {
    const action = base();
    await renderWithQuery(<Harness action={action} />);
    await fireEvent.press(screen.getByText('Start'));

    expect(await screen.findByText('Bilal Khan cannot use ZaraiLink until you lift the suspension.')).toBeTruthy();
    expect(action.run).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Suspend Bilal Khan' }));
    expect(action.run).toHaveBeenCalledWith('');
    expect(await screen.findByText('Bilal Khan suspended')).toBeTruthy();
  });

  it('asks for a required reason where the API stores one, and passes it on', async () => {
    const action = base({ reason: { label: 'Why', chips: ['Fake listing'], minLength: 5 } });
    await renderWithQuery(<Harness action={action} />);
    await fireEvent.press(screen.getByText('Start'));
    await screen.findByText('Suspend Bilal Khan?');

    await fireEvent.press(screen.getByRole('button', { name: 'Suspend Bilal Khan' }));
    expect(action.run).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Fake listing' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Suspend Bilal Khan' }));
    expect(action.run).toHaveBeenCalledWith('Fake listing');
  });

  it('offers Undo where the act can be reversed, and says when Undo itself fails', async () => {
    const undo = jest.fn().mockRejectedValue(new Error('Server said no'));
    await renderWithQuery(<Harness action={base({ undo })} />);
    await fireEvent.press(screen.getByText('Start'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Suspend Bilal Khan' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalled();
    expect(await screen.findByText('Server said no')).toBeTruthy();
  });

  it('offers no Undo for an act that cannot be taken back', async () => {
    await renderWithQuery(<Harness action={base()} />);
    await fireEvent.press(screen.getByText('Start'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Suspend Bilal Khan' }));

    await screen.findByText('Bilal Khan suspended');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('stays open and says why when the server refuses', async () => {
    const action = base({ run: jest.fn().mockRejectedValue(new Error('no')) });
    await renderWithQuery(<Harness action={action} />);
    await fireEvent.press(screen.getByText('Start'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Suspend Bilal Khan' }));

    expect(await screen.findByText("Couldn't finish")).toBeTruthy();
    expect(screen.queryByText('Bilal Khan suspended')).toBeNull();
  });
});
