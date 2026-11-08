import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ApplicationStatusScreen } from './ApplicationStatusScreen';
import { APPROVAL_ROUTES } from '../../constants/routes';
import { useRealtimeNotifications } from '../../../hooks/realtime/useRealtimeNotifications';
import { useAuthStore } from '../../../state/authStore';
import type { Profile } from '../../types/profile';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../../hooks/realtime/useRealtimeNotifications', () => ({ useRealtimeNotifications: jest.fn() }));

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
    application_submitted_at: null,
    notifications_enabled: true,
    created_at: '2026-10-05T08:00:00Z',
    updated_at: '2026-10-05T08:00:00Z',
    ...overrides,
  };
}

const refreshProfile = jest.fn((): Promise<void> => Promise.resolve());
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

beforeEach(() => jest.clearAllMocks());

describe('ApplicationStatusScreen (A3a, A3b, D10)', () => {
  it('leads a dealer who has sent nothing yet to the application', async () => {
    signedInAs(profile({ role: 'dealer' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText('Finish your dealer application')).toBeTruthy();
    expect(screen.getByText(/Send your business details and documents/)).toBeTruthy();
    expect(screen.queryByText('Under review')).toBeNull();
    // A draft has no decision to check on, and no way out other than the quiet ones at the bottom.
    expect(screen.queryByText('Check again')).toBeNull();
    await fireEvent.press(screen.getByText('Complete your application'));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.ApplicationWizard);
  });

  it('leads an expert who has sent nothing yet to the application', async () => {
    signedInAs(profile({ role: 'expert' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText(/Send your professional details and documents/)).toBeTruthy();
    expect(screen.getByText('Complete your application')).toBeTruthy();
  });

  it('shows an application under review, which can be viewed but offers no dealer tools', async () => {
    signedInAs(profile({ role: 'dealer', application_submitted_at: '2026-10-12T08:00:00Z' }));
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText('Under review')).toBeTruthy();
    expect(screen.getByText('An administrator is checking your business details.')).toBeTruthy();
    expect(screen.getByText(/Sent 12 Oct/)).toBeTruthy();
    expect(screen.queryByText('Complete your application')).toBeNull();
    await fireEvent.press(screen.getByText('View application'));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.ApplicationWizard);
  });

  it('shows a rejected dealer the reason and leads back to the application to correct it', async () => {
    signedInAs(
      profile({
        account_status: 'rejected',
        account_status_reason: 'The business licence is missing.',
        application_submitted_at: '2026-10-12T08:00:00Z',
      }),
    );
    await renderWithQuery(<ApplicationStatusScreen />);

    expect(screen.getByText('Not approved')).toBeTruthy();
    expect(screen.getByText('Not approved. Reason from the administrator')).toBeTruthy();
    expect(screen.getByText('The business licence is missing.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Update and resubmit'));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.ApplicationWizard);
  });

  it('checks again when the decision notification arrives, and on request', async () => {
    signedInAs(profile({ application_submitted_at: '2026-10-12T08:00:00Z' }));
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

  it('says what Check again found, so an unchanged status does not look like a dead button (AU-10)', async () => {
    signedInAs(profile({ application_submitted_at: '2026-10-12T08:00:00Z' }));
    await renderWithQuery(<ApplicationStatusScreen />);
    expect(screen.getByText('The decision shows here as soon as it is made.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Check again'));
    expect(await screen.findByText(/Checked at .*Still under review\./)).toBeTruthy();
  });

  it('says so when Check again could not reach the server', async () => {
    signedInAs(profile({ application_submitted_at: '2026-10-12T08:00:00Z' }));
    refreshProfile.mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderWithQuery(<ApplicationStatusScreen />);

    await fireEvent.press(screen.getByText('Check again'));
    expect(await screen.findByText(/Could not check at .*No connection/)).toBeTruthy();
  });

  it('gives a rejected applicant the reason in full and a next step when none was written', async () => {
    signedInAs(profile({ account_status: 'rejected', account_status_reason: null, application_submitted_at: '2026-10-12T08:00:00Z' }));
    await renderWithQuery(<ApplicationStatusScreen />);
    expect(screen.getByText(/No reason was given\. Check your details and documents/)).toBeTruthy();
  });

  it('signs out, and opens account deletion', async () => {
    signedInAs(profile({}));
    await renderWithQuery(<ApplicationStatusScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockNavigate).toHaveBeenCalledWith(APPROVAL_ROUTES.DeleteAccount);
  });
});
