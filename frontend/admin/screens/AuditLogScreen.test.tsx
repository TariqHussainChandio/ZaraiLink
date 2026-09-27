import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AuditLogScreen } from './AuditLogScreen';
import { fetchAuditLogs } from '../../services/modules/admin/adminService';
import type { AuditLogEntryWithActor } from '../../types/audit';

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

jest.mock('../../services/modules/admin/adminService', () => ({
  fetchAuditLogs: jest.fn(),
}));

const mockFetchAuditLogs = fetchAuditLogs as jest.Mock;

const entry = (overrides: Partial<AuditLogEntryWithActor> = {}): AuditLogEntryWithActor => ({
  id: 'log-1',
  actor_id: 'admin-1',
  action: 'suspend_user',
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
});

describe('AuditLogScreen', () => {
  it('shows an empty state when there are no entries', async () => {
    mockFetchAuditLogs.mockResolvedValue([]);
    await renderWithQuery(<AuditLogScreen />);
    expect(await screen.findByText('No audit log entries yet')).toBeTruthy();
  });

  it('lists entries with actor, action, and target', async () => {
    mockFetchAuditLogs.mockResolvedValue([entry()]);
    await renderWithQuery(<AuditLogScreen />);

    expect(await screen.findByText('suspend_user')).toBeTruthy();
    expect(screen.getByText('Admin One')).toBeTruthy();
    expect(screen.getByText(/profiles #user-9/)).toBeTruthy();
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

  it('filters entries by target entity', async () => {
    mockFetchAuditLogs.mockResolvedValue([
      entry({ id: 'log-1', target_entity: 'profiles', action: 'suspend_user' }),
      entry({ id: 'log-2', target_entity: 'listings', action: 'deactivate_listing', target_id: 'listing-9' }),
    ]);
    await renderWithQuery(<AuditLogScreen />);

    await screen.findByText('suspend_user');
    expect(screen.getByText('deactivate_listing')).toBeTruthy();

    await fireEvent.press(screen.getByText('listings'));

    expect(screen.queryByText('suspend_user')).toBeNull();
    expect(screen.getByText('deactivate_listing')).toBeTruthy();
  });
});
