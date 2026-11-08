import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { UserManagementScreen } from './UserManagementScreen';
import { fetchProfilesPage, setProfileSuspended, updateUserRole } from '../services/adminService';
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
  fetchProfilesPage: jest.fn(),
  setProfileSuspended: jest.fn(),
  updateUserRole: jest.fn(),
}));

const mockFetchPage = fetchProfilesPage as jest.Mock;
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

const page = (rows: Profile[], next: { limit: number; offset: number } | null = null) => ({ data: rows, next });

beforeEach(() => {
  mockFetchPage.mockReset();
  mockSetProfileSuspended.mockReset();
  mockUpdateUserRole.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

describe('UserManagementScreen', () => {
  it('shows an empty state when there are no users', async () => {
    mockFetchPage.mockResolvedValue(page([]));
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('No users yet')).toBeTruthy();
  });

  it('says the load failed, and tries again, instead of "No users found" (AD-11)', async () => {
    mockFetchPage.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText("Couldn't load users")).toBeTruthy();
    expect(screen.queryByText('No users yet')).toBeNull();

    mockFetchPage.mockResolvedValueOnce(page([profile()]));
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Farmer Sana')).toBeTruthy();
  });

  it('lists users with their role', async () => {
    mockFetchPage.mockResolvedValue(page([profile()]));
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('Farmer Sana')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenCalledWith({ role: undefined, accountStatus: undefined }, 0);
  });

  it('reads an empty name like a missing one, in the row and in the sheet', async () => {
    // profiles.full_name is never null but defaults to ''.
    mockFetchPage.mockResolvedValue(page([profile({ full_name: '' })]));
    await renderWithQuery(<UserManagementScreen />);
    await fireEvent.press(await screen.findByText('Unknown user'));
    expect(await screen.findByText('Suspend this user')).toBeTruthy();
  });

  it('shows a Suspended badge for suspended users', async () => {
    mockFetchPage.mockResolvedValue(page([profile({ is_suspended: true })]));
    await renderWithQuery(<UserManagementScreen />);
    expect(await screen.findByText('Suspended')).toBeTruthy();
  });

  it('has no actions on the signed-in admin\'s own row', async () => {
    mockFetchPage.mockResolvedValue(page([profile({ id: 'admin-1', full_name: 'Me, Admin', role: 'admin' })]));
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Me, Admin');
    expect(screen.queryByRole('button', { name: /Me, Admin/ })).toBeNull();
  });

  it('suspends only after the consequence is read and confirmed, then offers Undo (AD-04)', async () => {
    mockFetchPage.mockResolvedValue(page([profile()]));
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);

    await fireEvent.press(await screen.findByText('Farmer Sana'));
    await fireEvent.press(await screen.findByText('Suspend Farmer Sana'));
    expect(await screen.findByText('Suspend Farmer Sana?')).toBeTruthy();
    expect(screen.getByText(/cannot use ZaraiLink until you lift the suspension/)).toBeTruthy();
    // One tap on the row, one on the sheet's row, and still nothing has been done.
    expect(mockSetProfileSuspended).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Suspend Farmer Sana' }));
    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-1', true);
    expect(await screen.findByText('Farmer Sana suspended')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(mockSetProfileSuspended).toHaveBeenLastCalledWith('user-1', false);
  });

  it('lifts a suspension', async () => {
    mockFetchPage.mockResolvedValue(page([profile({ is_suspended: true })]));
    mockSetProfileSuspended.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);

    await fireEvent.press(await screen.findByText('Farmer Sana'));
    await fireEvent.press(await screen.findByText('Lift suspension for Farmer Sana'));
    await fireEvent.press(screen.getByRole('button', { name: 'Lift suspension for Farmer Sana' }));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-1', false);
  });

  it('keeps the confirmation open and says why when the server refuses', async () => {
    mockFetchPage.mockResolvedValue(page([profile()]));
    mockSetProfileSuspended.mockRejectedValue(new Error('no'));
    await renderWithQuery(<UserManagementScreen />);

    await fireEvent.press(await screen.findByText('Farmer Sana'));
    await fireEvent.press(await screen.findByText('Suspend Farmer Sana'));
    await fireEvent.press(screen.getByRole('button', { name: 'Suspend Farmer Sana' }));

    expect(await screen.findByText("Couldn't finish")).toBeTruthy();
    expect(screen.getByText('Suspend Farmer Sana?')).toBeTruthy();
  });

  it('changes a role only after the consequence is stated, and never offers Admin (D17)', async () => {
    mockFetchPage.mockResolvedValue(page([profile({ role: 'dealer', full_name: 'Dealer Bilal' })]));
    mockUpdateUserRole.mockResolvedValue(undefined);
    await renderWithQuery(<UserManagementScreen />);

    await fireEvent.press(await screen.findByText('Dealer Bilal'));
    await fireEvent.press(await screen.findByText('Change role'));
    expect(await screen.findByText('Change role for Dealer Bilal')).toBeTruthy();
    expect(screen.queryByText('Admin')).toBeNull();
    // Their current role is not a choice.
    expect(screen.queryByRole('button', { name: 'Dealer' })).toBeNull();

    await fireEvent.press(screen.getByText('Farmer'));
    expect(await screen.findByText('Change Dealer Bilal to farmer?')).toBeTruthy();
    expect(screen.getByText(/lose their dealer approval, and with it selling and inventory access/)).toBeTruthy();
    expect(mockUpdateUserRole).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Change Dealer Bilal to farmer' }));
    expect(mockUpdateUserRole).toHaveBeenCalledWith('user-1', 'farmer');
  });

  it('says a new dealer goes back to Under review', async () => {
    mockFetchPage.mockResolvedValue(page([profile()]));
    await renderWithQuery(<UserManagementScreen />);

    await fireEvent.press(await screen.findByText('Farmer Sana'));
    await fireEvent.press(await screen.findByText('Change role'));
    await fireEvent.press(screen.getByText('Dealer'));

    expect(await screen.findByText(/goes back to Under review/)).toBeTruthy();
  });

  // A3b: an application is decided in Approvals, after reading it and its documents; this list only shows the status.
  it('shows a dealer waiting for a decision but offers no decision here', async () => {
    mockFetchPage.mockResolvedValue(
      page([profile({ id: 'dealer-1', role: 'dealer', full_name: 'Dealer Bilal', account_status: 'pending' })]),
    );
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Dealer Bilal');
    expect(screen.getAllByText('Under review').length).toBeGreaterThan(0);
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });

  it('asks the server for the chosen role and status (AD-02)', async () => {
    mockFetchPage.mockResolvedValue(page([profile()]));
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.press(screen.getByRole('button', { name: 'Dealers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Under review' }));

    expect(mockFetchPage).toHaveBeenLastCalledWith({ role: 'dealer', accountStatus: 'pending' }, 0);
  });

  it('loads the next page, so user 101 can be reached (AD-02)', async () => {
    mockFetchPage.mockResolvedValueOnce(page([profile()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([profile({ id: 'user-101', full_name: 'Farmer 101' })]));
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');
    expect(screen.queryByText('Farmer 101')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Load more users' }));

    expect(await screen.findByText('Farmer 101')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith({ role: undefined, accountStatus: undefined }, 50);
  });

  it('searching loads the remaining pages and finds the match', async () => {
    mockFetchPage.mockResolvedValueOnce(page([profile()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValue(page([profile({ id: 'user-101', full_name: 'Bilal Khan' })]));
    await renderWithQuery(<UserManagementScreen />);
    await screen.findByText('Farmer Sana');

    await fireEvent.changeText(screen.getByLabelText('Find a person'), 'bilal');

    expect(await screen.findByText('Bilal Khan')).toBeTruthy();
    expect(screen.queryByText('Farmer Sana')).toBeNull();
  });
});
