import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuditLogScreen } from './AuditLogScreen';
import { fetchAuditEvents, fetchAuditLogsPage } from '../services/adminService';
import type { AuditLogEntryWithActor } from '../types/audit';

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
  fetchAuditLogsPage: jest.fn(),
  fetchAuditEvents: jest.fn(),
}));

const mockFetchPage = fetchAuditLogsPage as jest.Mock;
const mockFetchAuditEvents = fetchAuditEvents as jest.Mock;

const EVENTS = [
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
  target_id: 'user-9abcdef',
  previous_state: { is_suspended: false },
  new_state: { is_suspended: true },
  metadata: null,
  created_at: new Date().toISOString(),
  actor: { id: 'admin-1', full_name: 'Sana' },
  ...overrides,
});

const page = (rows: AuditLogEntryWithActor[], next: { limit: number; offset: number } | null = null) => ({ data: rows, next });

beforeEach(() => {
  mockFetchPage.mockReset();
  mockFetchAuditEvents.mockReset().mockResolvedValue(EVENTS);
});

describe('AuditLogScreen', () => {
  it('shows an empty state when there are no entries', async () => {
    mockFetchPage.mockResolvedValue(page([]));
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText('Nothing logged yet')).toBeTruthy();
  });

  it('says the load failed instead of "No audit log entries yet" (AD-07)', async () => {
    mockFetchPage.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText("Couldn't load the audit log")).toBeTruthy();
    expect(screen.queryByText('Nothing logged yet')).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('writes each entry as a sentence under a Today heading, with the change in words', async () => {
    mockFetchPage.mockResolvedValue(page([entry()]));
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText('Sana suspended an account')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText(/Active → Suspended/)).toBeTruthy();
    // No machine names or JSON.
    expect(screen.queryByText('user_suspended')).toBeNull();
    expect(screen.queryByText(/previous:/)).toBeNull();
  });

  it('groups earlier days under their date', async () => {
    mockFetchPage.mockResolvedValue(
      page([entry(), entry({ id: 'log-2', created_at: '2020-03-07T10:00:00Z', action: 'report_dismissed', target_entity: 'reports' })]),
    );
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.getByText('7 Mar 2020')).toBeTruthy();
  });

  it('shows the reason in the row and the whole change in the detail sheet', async () => {
    mockFetchPage.mockResolvedValue(
      page([
        entry({
          action: 'dealer_application_rejected',
          previous_state: { account_status: 'pending' },
          new_state: { account_status: 'rejected' },
          metadata: { reason: 'CNIC photo blurred' },
        }),
      ]),
    );
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText(/"CNIC photo blurred"/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Sana rejected a dealer application'));

    expect(await screen.findByText('What happened')).toBeTruthy();
    expect(screen.getByText('Application: Under review → Not approved')).toBeTruthy();
    expect(screen.getByText('Reason given')).toBeTruthy();
    expect(screen.getByText('Account user-9ab')).toBeTruthy();
  });

  it('falls back to "The system" when there is no actor', async () => {
    mockFetchPage.mockResolvedValue(page([entry({ actor: null })]));
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText('The system suspended an account')).toBeTruthy();
  });

  it('offers every SRDS §51 event by its label and asks the server for the one chosen (A7)', async () => {
    mockFetchPage.mockImplementation(async (params: { action?: string }) =>
      page(
        params.action === 'product_moderated'
          ? [entry({ id: 'log-2', action: 'product_moderated', target_entity: 'listings', previous_state: null, new_state: { status: 'inactive' } })]
          : [entry()],
      ),
    );
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(await screen.findByLabelText('Event, Every event'));
    for (const event of EVENTS) {
      expect(screen.getAllByText(event.label).length).toBeGreaterThan(0);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Product Moderated' }));

    expect(await screen.findByText('Sana hid a listing')).toBeTruthy();
    expect(screen.queryByText('Sana suspended an account')).toBeNull();
    expect(mockFetchPage).toHaveBeenLastCalledWith({ action: 'product_moderated', targetEntity: undefined }, 0);
  });

  it('suggests another event when the chosen one has no entries', async () => {
    mockFetchPage.mockImplementation(async (params: { action?: string }) => page(params.action ? [] : [entry()]));
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(await screen.findByLabelText('Event, Every event'));
    await fireEvent.press(screen.getByRole('button', { name: 'Review Moderated' }));

    expect(await screen.findByText('Nothing matches')).toBeTruthy();
    expect(screen.getByText('Try another event or a different name.')).toBeTruthy();
  });

  it('loads older entries on request', async () => {
    mockFetchPage.mockResolvedValueOnce(page([entry()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([entry({ id: 'log-101', actor: { id: 'a2', full_name: 'Bilal' } })]));
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(screen.getByRole('button', { name: 'Load more older entries' }));

    expect(await screen.findByText('Bilal suspended an account')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith({ action: undefined, targetEntity: undefined }, 50);
  });
});
