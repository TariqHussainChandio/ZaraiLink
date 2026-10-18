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

  it('lists entries with actor, the SRDS §51 label of the action, and target', async () => {
    mockFetchAuditLogs.mockResolvedValue([entry()]);
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText('User Suspended')).toBeTruthy();
    // The raw event name is the API's; the admin reads the label.
    expect(screen.queryByText('user_suspended')).toBeNull();
    expect(screen.getByText('Admin One')).toBeTruthy();
    expect(screen.getByText(/profiles #user-9/)).toBeTruthy();
    expect(mockFetchAuditLogs).toHaveBeenCalledWith({ action: undefined });
  });

  it('renders previous/new state when present', async () => {
    mockFetchAuditLogs.mockResolvedValue([
      entry({ previous_state: { is_suspended: false }, new_state: { is_suspended: true } }),
    ]);
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText(/previous: /)).toBeTruthy();
    expect(screen.getByText(/new: /)).toBeTruthy();
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
    await waitFor(() => expect(screen.queryByText(/profiles #user-9/)).toBeNull());
    expect(screen.getByText(/reviews #user-9/)).toBeTruthy();
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
