import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ApplicationStatusScreen } from './ApplicationStatusScreen';
import { APPROVAL_ROUTES } from '../../constants/routes';
import { fetchExpertProfile } from '../../../expert/services/expertService';
import { resubmitApplication } from '../../profile/services/profileService';
import { useRealtimeNotifications } from '../../../hooks/realtime/useRealtimeNotifications';
import { useAuthStore } from '../../../state/authStore';
import type { Profile } from '../../types/profile';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../../expert/services/expertService', () => ({ fetchExpertProfile: jest.fn() }));
jest.mock('../../profile/services/profileService', () => ({ resubmitApplication: jest.fn() }));
jest.mock('../../../hooks/realtime/useRealtimeNotifications', () => ({ useRealtimeNotifications: jest.fn() }));

const mockFetchExpertProfile = fetchExpertProfile as jest.Mock;
const mockResubmit = resubmitApplication as jest.Mock;
const mockRealtime = useRealtimeNotifications as jest.Mock;

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: 'user-1',
    role: 'dealer',
    full_name: 'Dealer Test',
    phone: null,
    avatar_url: null,
    location: null,
    country: null,
    province: null,
    city: null,
    village: null,
    street: null,
    is_suspended: false,
    account_status: 'pending',
    account_status_reason: null,
    account_status_changed_at: null,
    notifications_enabled: true,
    created_at: '2026-10-05T08:00:00Z',
    updated_at: '2026-10-05T08:00:00Z',
    ...overrides,
  };
}

const refreshProfile = jest.fn(() => Promise.resolve());
const signOut = jest.fn(() => Promise.resolve());

function signedInAs(p: Profile) {
  useAuthStore.setState({
    user: { id: p.id } as never,
    profile: p,
    role: p.role,
    status: 'awaitingApproval',
    refreshProfile,
    signOut,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchExpertProfile.mockResolvedValue(null);
});

describe('ApplicationStatusScreen (A3a, D10)', () => {
  it('tells a pending dealer an administrator is reviewing the account, and offers no dealer tools', async () => {
    signedInAs(profile({ role: 'dealer', account_status: 'pending' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText('Your dealer account')).toBeTruthy();
    expect(screen.getByText('Under review')).toBeTruthy();
    expect(screen.getByText(/An administrator reviews every dealer account/)).toBeTruthy();
    expect(screen.queryByText('Send again for review')).toBeNull();
    expect(screen.queryByText('Complete your application')).toBeNull();
    expect(screen.queryByText('View your application')).toBeNull();
  });

  it('shows a rejected dealer the reason and sends the application again', async () => {
    signedInAs(profile({ account_status: 'rejected', account_status_reason: 'The business licence is missing.' }));
    mockResubmit.mockResolvedValue(undefined);
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText('Not approved')).toBeTruthy();
    expect(screen.getByText('The business licence is missing.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send again for review'));

    await waitFor(() => expect(mockResubmit).toHaveBeenCalledTimes(1));
    expect(refreshProfile).toHaveBeenCalled();
  });

  it('asks a pending expert who has not applied to complete the application', async () => {
    signedInAs(profile({ role: 'expert', account_status: 'pending' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    await fireEvent.press(await screen.findByText('Complete your application'));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.ExpertApplication);
  });

  it('lets a pending expert who has applied view the application while it is reviewed', async () => {
    signedInAs(profile({ role: 'expert', account_status: 'pending' }));
    mockFetchExpertProfile.mockResolvedValue({ id: 'user-1', verification_status: 'pending' });
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(await screen.findByText('View your application')).toBeTruthy();
    expect(screen.queryByText('Complete your application')).toBeNull();
    expect(screen.getByText(/An administrator is reviewing your application/)).toBeTruthy();
  });

  it('checks again when the decision notification arrives, and on request', async () => {
    signedInAs(profile({ account_status: 'pending' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    const [userId, onChange] = mockRealtime.mock.calls[0];
    expect(userId).toBe('user-1');
    onChange({ type: 'new_message' });
    expect(refreshProfile).not.toHaveBeenCalled();
    onChange({ type: 'account_status_changed' });
    expect(refreshProfile).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Check again'));
    expect(refreshProfile).toHaveBeenCalledTimes(2);
  });

  it('signs out, and opens account deletion', async () => {
    signedInAs(profile({ account_status: 'pending' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    await fireEvent.press(screen.getByText('Sign out'));
    expect(signOut).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Delete account'));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.DeleteAccount);
  });
});
