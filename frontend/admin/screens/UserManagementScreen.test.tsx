import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { UserManagementScreen } from './UserManagementScreen';
import { fetchAllProfiles, setProfileSuspended, updateUserRole } from '../services/adminService';
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
}));

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
  application_submitted_at: null,
  notifications_enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  mockFetchAllProfiles.mockReset();
  mockSetProfileSuspended.mockReset();
  mockUpdateUserRole.mockReset();
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

  it('tells apart profiles with no name by their short id, in the row and the role sheet', async () => {
    // profiles.full_name is never null but defaults to ''. Two of them must not read as the same "Unknown user".
    mockFetchAllProfiles.mockResolvedValue([
      profile({ id: 'aaaaaaaa-1111', full_name: '' }),
      profile({ id: 'bbbbbbbb-2222', full_name: '' }),
    ]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('User aaaaaaaa')).toBeTruthy();
    expect(screen.getByText('User bbbbbbbb')).toBeTruthy();
    expect(screen.queryByText('Unknown user')).toBeNull();
    const [firstChangeRole] = screen.getAllByText('Change Role');
    if (!firstChangeRole) throw new Error('No Change Role button');
    await fireEvent.press(firstChangeRole);
    expect(await screen.findByText('Change role for User aaaaaaaa')).toBeTruthy();
  });

  it('shows an identifier line: phone, city, join date and short id', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile({ phone: '+923001234567', city: 'Multan' })]);
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText(/\+923001234567 · Multan · Joined .* · #user-1/)).toBeTruthy();
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

  it('suspends a user only after confirming in a sheet', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Suspend'));
    // The row's button only asks.
    expect(mockSetProfileSuspended).not.toHaveBeenCalled();
    expect(await screen.findByText('Suspend Farmer Sana')).toBeTruthy();
    expect(screen.getByText(/cannot buy, sell, message or consult/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Suspend user'));
    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-1', true);
    expect(await screen.findByText('User suspended')).toBeTruthy();
  });

  it('backing out of a suspension changes nothing', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Suspend'));
    await fireEvent.press(await screen.findByText('Not now'));

    expect(screen.queryByText('Suspend user')).toBeNull();
    expect(mockSetProfileSuspended).not.toHaveBeenCalled();
  });

  it('tells the admin when the suspension is refused', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile()]);
    mockSetProfileSuspended.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Suspend'));
    await fireEvent.press(screen.getByText('Suspend user'));

    expect(await screen.findByText(/Could not update the user/)).toBeTruthy();
  });

  it('unsuspends an already-suspended user', async () => {
    mockFetchAllProfiles.mockResolvedValue([profile({ is_suspended: true })]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByText('Unsuspend'));
    expect(mockSetProfileSuspended).not.toHaveBeenCalled();
    expect(await screen.findByText('They can sign in and use ZaraiLink again.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Unsuspend user'));

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

  // A3b: an application is decided in Approvals, after reading it and its documents; this list only shows the status.
  it('shows a dealer waiting for a decision but offers no decision here', async () => {
    mockFetchAllProfiles.mockResolvedValue([
      profile({ id: 'dealer-1', role: 'dealer', full_name: 'Dealer Bilal', account_status: 'pending' }),
    ]);
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Dealer Bilal');
    expect(screen.getByText('Under review')).toBeTruthy();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(mockFetchAllProfiles).toHaveBeenCalledWith();
  });
});
