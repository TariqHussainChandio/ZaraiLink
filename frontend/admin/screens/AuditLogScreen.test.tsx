import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuditLogScreen } from './AuditLogScreen';
import { fetchAuditEvents, fetchAuditLogs } from '../services/adminService';
import type { AuditEventNameEntry, AuditLogEntryWithActor } from '../types/audit';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../services/adminService', () => ({
  fetchAuditLogs: jest.fn(),
  fetchAuditEvents: jest.fn(),
}));

const mockFetchAuditLogs = fetchAuditLogs as jest.Mock;
const mockFetchAuditEvents = fetchAuditEvents as jest.Mock;

const EVENTS: AuditEventNameEntry[] = [
  { name: 'product_moderated', label: 'Product Moderated' },
  { name: 'review_moderated', label: 'Review Moderated' },
  { name: 'user_suspended', label: 'User Suspended' },
];

const entry = (overrides: Partial<AuditLogEntryWithActor> = {}): AuditLogEntryWithActor => ({
  id: 'log-1',
  actor_id: 'admin-1',
  action: 'user_suspended',
  action_label: 'User Suspended',
  target_entity: 'profiles',
  target_id: 'user-9',
  previous_state: null,
  new_state: null,
  metadata: null,
  created_at: '2026-08-01T10:00:00Z',
  actor: { id: 'admin-1', full_name: 'Admin One' },
  ...overrides,
});

beforeEach(() => {
  mockFetchAuditLogs.mockReset();
  mockFetchAuditEvents.mockReset();
  mockFetchAuditEvents.mockResolvedValue(EVENTS);
});

describe('AuditLogScreen', () => {
  it('shows an empty state when there are no entries', async () => {
    mockFetchAuditLogs.mockResolvedValue([]);
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText('No audit log entries yet')).toBeTruthy();
  });

  it('lists entries with actor, the SRDS §51 label of the action, and a readable target', async () => {
    mockFetchAuditLogs.mockResolvedValue([entry()]);
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText('User Suspended')).toBeTruthy();
    // The raw event name is the API's; the admin reads the label.
    expect(screen.queryByText('user_suspended')).toBeNull();
    expect(screen.getByText('Admin One')).toBeTruthy();
    // The table name reads as the thing it holds: a profile row is a user.
    expect(screen.getByText(/user user-9/)).toBeTruthy();
    expect(screen.queryByText(/profiles/)).toBeNull();
    expect(mockFetchAuditLogs).toHaveBeenCalledWith({ action: undefined });
  });

  it('reads each entry as one stop: who, what, which target and when', async () => {
    mockFetchAuditLogs.mockResolvedValue([entry()]);
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('User Suspended');

    const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
      new Date('2026-08-01T10:00:00Z'),
    );
    const stop = screen.getByLabelText(`User Suspended by Admin One, on user user-9, ${when}`);
    expect(stop.props.accessible).toBe(true);
    // An entry with nothing to unfold is not a button.
    expect(stop.props.accessibilityRole).toBeUndefined();
  });

  it('keeps the before and after folded, then shows them as readable changes, never raw JSON', async () => {
    mockFetchAuditLogs.mockResolvedValue([
      entry({
        action: 'product_moderated',
        action_label: 'Product Moderated',
        target_entity: 'listings',
        target_id: 'abcdef12-3456',
        previous_state: { status: 'active' },
        new_state: { status: 'inactive' },
        metadata: { change: 'hide' },
      }),
    ]);
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Product Moderated');

    expect(screen.queryByText('status: active to inactive')).toBeNull();
    expect(screen.queryByText(/[{}"]/)).toBeNull();
    const entryButton = screen.getByRole('button', { name: /^Product Moderated by Admin One, on listing abcdef12/ });
    expect(entryButton.props.accessibilityState).toMatchObject({ expanded: false });

    await fireEvent.press(screen.getByText('Show details'));

    expect(screen.getByText('status: active to inactive')).toBeTruthy();
    expect(screen.getByText('change: hide')).toBeTruthy();
    expect(screen.queryByText(/[{}"]/)).toBeNull();
    const open = screen.getByRole('button', { name: /status: active to inactive\. change: hide$/ });
    expect(open.props.accessibilityState).toMatchObject({ expanded: true });

    await fireEvent.press(screen.getByText('Hide details'));
    expect(screen.queryByText('status: active to inactive')).toBeNull();
  });

  it('reads booleans and empty values in words', async () => {
    mockFetchAuditLogs.mockResolvedValue([
      entry({ previous_state: { is_suspended: false, hidden_reason: null }, new_state: { is_suspended: true, hidden_reason: 'Spam' } }),
    ]);
    await renderWithQuery(<AuditLogScreen />);
    await fireEvent.press(await screen.findByText('Show details'));

    expect(screen.getByText('is suspended: no to yes')).toBeTruthy();
    expect(screen.getByText('hidden reason: none to Spam')).toBeTruthy();
  });

  it('falls back to "System" when there is no actor', async () => {
    mockFetchAuditLogs.mockResolvedValue([entry({ actor: null })]);
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText('System')).toBeTruthy();
  });

  it('offers every §51 event by its label and asks the server for the one chosen', async () => {
    mockFetchAuditLogs.mockImplementation(({ action }: { action?: string }) =>
      Promise.resolve(
        action === 'review_moderated'
          ? [entry({ id: 'log-2', action: 'review_moderated', action_label: 'Review Moderated', target_entity: 'reviews' })]
          : [entry(), entry({ id: 'log-2', action: 'review_moderated', action_label: 'Review Moderated', target_entity: 'reviews' })],
      ),
    );
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('User Suspended');

    await fireEvent.press(await screen.findByLabelText('Event, Every event'));
    for (const event of EVENTS) {
      expect(screen.getAllByText(event.label).length).toBeGreaterThan(0);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Review Moderated' }));

    expect(mockFetchAuditLogs).toHaveBeenLastCalledWith({ action: 'review_moderated' });
    expect(await screen.findByLabelText('Event, Review Moderated')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/user user-9/)).toBeNull());
    expect(screen.getByText(/review user-9/)).toBeTruthy();
  });

  it('suggests another event when the chosen one has no entries', async () => {
    mockFetchAuditLogs.mockImplementation(({ action }: { action?: string }) =>
      Promise.resolve(action ? [] : [entry()]),
    );
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('User Suspended');

    await fireEvent.press(await screen.findByLabelText('Event, Every event'));
    await fireEvent.press(screen.getByRole('button', { name: 'Product Moderated' }));

    expect(await screen.findByText('No audit log entries yet')).toBeTruthy();
    expect(screen.getByText('Try a different event.')).toBeTruthy();
  });

  it("shows a retry state when the log cannot be loaded", async () => {
    mockFetchAuditLogs.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText("Couldn't load the audit log")).toBeTruthy();

    mockFetchAuditLogs.mockResolvedValueOnce([entry()]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('User Suspended')).toBeTruthy();
  });
});
