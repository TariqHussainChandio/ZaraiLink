import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AccountSecurityScreen } from './AccountSecurityScreen';
import { PROFILE_ROUTES } from '../../constants/routes';
import { getVerifiedTotpFactorId } from '../../auth/services/mfaService';
import { useAuthStore } from '../../../state/authStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

jest.mock('../../auth/services/mfaService', () => ({
  getVerifiedTotpFactorId: jest.fn(),
}));

const mockGetFactor = getVerifiedTotpFactorId as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as ProfileScreenProps<'AccountSecurity'>['navigation'];
}

beforeEach(() => {
  mockGetFactor.mockReset().mockResolvedValue(null);
  useAuthStore.setState({ user: { id: 'admin-1', email: 'admin@zarailink.test' } as never });
});

describe('AccountSecurityScreen (A3b)', () => {
  it('shows the sign-in email and opens email, password and two-step verification', async () => {
    const navigation = makeNavigation();
    await renderWithQuery(<AccountSecurityScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText('admin@zarailink.test')).toBeTruthy();
    await fireEvent.press(screen.getByText('Email'));
    await fireEvent.press(screen.getByText('Password'));
    await fireEvent.press(screen.getByText('Two-step verification'));
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, PROFILE_ROUTES.ChangeEmail);
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, PROFILE_ROUTES.ChangePassword);
    expect(navigation.navigate).toHaveBeenNthCalledWith(3, PROFILE_ROUTES.MfaEnrollment);
  });

  it('says in the row whether two-step verification is on (AU-20)', async () => {
    mockGetFactor.mockResolvedValue('factor-1');
    await renderWithQuery(<AccountSecurityScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText(/^On\. Needed for every approval/)).toBeTruthy();
  });

  it('says in the row when it is off, since no approval works without it', async () => {
    await renderWithQuery(<AccountSecurityScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText(/^Off\. Turn it on to approve/)).toBeTruthy();
  });
});
