import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { UserManagementScreen } from './UserManagementScreen';
import { decideDealerApplication, fetchAllProfiles, setProfileSuspended, updateUserRole } from '../services/adminService';
import { useAuthStore } from '../../state/authStore';
import type { Profile } from '../../common/types/profile';

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
  fetchAllProfiles: jest.fn(),
  setProfileSuspended: jest.fn(),
  updateUserRole: jest.fn(),
  decideDealerApplication: jest.fn(),
}));

const mockDecide = decideDealerApplication as jest.Mock;

const mockFetchAllProfiles = fetchAllProfiles as jest.Mock;
const mockSetProfileSuspended = setProfileSuspended as jest.Mock;
const mockUpdateUserRole = updateUserRole as jest.Mock;

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'user-1',
  role: 'farmer',
  full_name: 'Farmer Sana',
  phone: null,
  avatar_url: null,
  location: null,
  country: null,
  province: null,
  city: null,
  village: null,
  street: null,
  is_suspended: false,
  account_status: 'approved',
  account_status_reason: null,
  account_status_changed_at: null,
  notifications_enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mockFetchAllProfiles.mockReset();
  mockSetProfileSuspended.mockReset();
  mockUpdateUserRole.mockReset();
  mockDecide.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

describe('UserManagementScreen', () => {
  it('shows an empty state when there are no users', async () => {
    mockFetchAllProfiles.mockResolvedValue([]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('No users found')).toBeTruthy();
  });

  it('lists users with their role', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('Farmer Sana')).toBeTruthy();
    expect(screen.getByText('Farmer')).toBeTruthy();
  });

  it('reads an empty name like a missing one, in the row and the role sheet', async () => {
    // profiles.full_name is never null but defaults to ''.
    mockFetchAllProfiles.mockResolvedValue([profile({ full_name: '' })]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('Unknown user')).toBeTruthy();
    await fireEvent.press(screen.getByText('Change Role'));
    expect(await screen.findByText('Change role for this user')).toBeTruthy();
  });

  it('shows a Suspended badge for suspended users', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile({ is_suspended: true })]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('Suspended')).toBeTruthy();
  });

  it('hides row actions for the currently signed-in admin', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile({ id: 'admin-1', full_name: 'Me, Admin' })]);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Me, Admin');
    expect(screen.queryByText('Suspend')).toBeNull();
    expect(screen.queryByText('Change Role')).toBeNull();
  });

  it('suspends and unsuspends a user', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Suspend'));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-1', true);
  });

  it('unsuspends an already-suspended user', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile({ is_suspended: true })]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Unsuspend'));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-1', false);
  });

  it('changes a user role through the sheet', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    mockUpdateUserRole.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Change Role'));
    expect(await screen.findByText('Change role for Farmer Sana')).toBeTruthy();

    await fireEvent.press(screen.getByText('Dealer'));

    expect(mockUpdateUserRole).toHaveBeenCalledWith('user-1', 'dealer');
  });

  // A3a: dealer applications are decided here (experts in Approvals).
  const pendingDealer = () => profile({ id: 'dealer-1', role: 'dealer', full_name: 'Dealer Bilal', account_status: 'pending' });

  it('asks the API for the dealers waiting for a decision (the server filters, not one page in the app)', async () => {
    mockFetchAllProfiles.mockImplementation((filter?: { role?: string }) =>
      Promise.resolve(filter?.role === 'dealer' ? [pendingDealer()] : [profile(), pendingDealer()]),
    );
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');
    expect(screen.getByText('Under review')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Pending dealers' }));

    expect(mockFetchAllProfiles).toHaveBeenLastCalledWith({ role: 'dealer', accountStatus: 'pending' });
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
    expect(screen.queryByText('Farmer Sana')).toBeNull();
  });

  it('approves a pending dealer', async () => {
    mockFetchAllProfiles.mockResolvedValue([pendingDealer()]);
    mockDecide.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Dealer Bilal');

    await fireEvent.press(screen.getByText('Approve'));

    expect(mockDecide).toHaveBeenCalledWith('dealer-1', 'approved', undefined);
  });

  it('rejects a pending dealer only with a reason the dealer can read', async () => {
    mockFetchAllProfiles.mockResolvedValue([pendingDealer()]);
    mockDecide.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Dealer Bilal');

    await fireEvent.press(screen.getByText('Reject'));
    expect(await screen.findByText('Reject Dealer Bilal')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'short');
    await fireEvent.press(screen.getByText('Reject application'));
    expect(await screen.findByText('Write at least 10 characters')).toBeTruthy();
    expect(mockDecide).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), 'The business licence is missing.');
    await fireEvent.press(screen.getByText('Reject application'));
    expect(mockDecide).toHaveBeenCalledWith('dealer-1', 'rejected', 'The business licence is missing.');
  });

  it('offers no decision on a farmer or an approved dealer', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile(), profile({ id: 'dealer-2', role: 'dealer', full_name: 'Approved Dealer' })]);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });
});
