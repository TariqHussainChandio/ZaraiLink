import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuditLogScreen } from './AuditLogScreen';
import { fetchAuditLogsPage } from '../services/adminService';
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
}));

const mockFetchPage = fetchAuditLogsPage as jest.Mock;

const entry = (overrides: Partial<AuditLogEntryWithActor> = {}): AuditLogEntryWithActor => ({
  id: 'log-1',
  actor_id: 'admin-1',
  action: 'suspend_user',
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
    expect(screen.queryByText('suspend_user')).toBeNull();
    expect(screen.queryByText(/previous:/)).toBeNull();
  });

  it('groups earlier days under their date', async () => {
    mockFetchPage.mockResolvedValue(
      page([entry(), entry({ id: 'log-2', created_at: '2020-03-07T10:00:00Z', action: 'dismiss_report', target_entity: 'reports' })]),
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

  it('filters by area, asking the server when one table holds it', async () => {
    mockFetchPage.mockImplementation(async (params: { targetEntity?: string }) =>
      page(
        params.targetEntity === 'listings'
          ? [entry({ id: 'log-2', action: 'update_listing_status', target_entity: 'listings', previous_state: null, new_state: { status: 'inactive' } })]
          : [entry()],
      ),
    );
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(screen.getByRole('button', { name: 'Listings' }));

    expect(await screen.findByText('Sana hid a listing')).toBeTruthy();
    expect(screen.queryByText('Sana suspended an account')).toBeNull();
    expect(mockFetchPage).toHaveBeenLastCalledWith({ targetEntity: 'listings' }, 0);
  });

  it('matches an area that spans actions in the app, and keeps looking when a page has none of it', async () => {
    mockFetchPage.mockImplementation(async (_params: unknown, offset: number) =>
      offset === 0
        ? page([entry()], { limit: 50, offset: 50 })
        : page([entry({ id: 'log-9', action: 'expert_application_approved', previous_state: { account_status: 'pending' }, new_state: { account_status: 'approved' } })]),
    );
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(screen.getByRole('button', { name: 'Applications' }));

    expect(await screen.findByText('Sana approved an expert application')).toBeTruthy();
    expect(screen.queryByText('Sana suspended an account')).toBeNull();
  });

  it('loads older entries on request', async () => {
    mockFetchPage.mockResolvedValueOnce(page([entry()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([entry({ id: 'log-101', actor: { id: 'a2', full_name: 'Bilal' } })]));
    await renderWithQuery(<AuditLogScreen />);
    await screen.findByText('Sana suspended an account');

    await fireEvent.press(screen.getByRole('button', { name: 'Load more older entries' }));

    expect(await screen.findByText('Bilal suspended an account')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith({ targetEntity: undefined }, 50);
  });
});
