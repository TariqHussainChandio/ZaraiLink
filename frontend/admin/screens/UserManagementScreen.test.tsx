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
});
