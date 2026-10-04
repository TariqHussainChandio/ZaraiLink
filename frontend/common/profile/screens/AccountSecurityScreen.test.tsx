import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AccountSecurityScreen } from './AccountSecurityScreen';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

describe('AccountSecurityScreen (A3b)', () => {
  it('shows the sign-in email and opens email, password and two-step verification', async () => {
    useAuthStore.setState({ user: { id: 'admin-1', email: 'admin@zarailink.test' } as never });
    const navigation = { navigate: jest.fn() } as unknown as ProfileScreenProps<'AccountSecurity'>['navigation'];
    await renderWithQuery(<AccountSecurityScreen navigation={navigation} route={{} as never} />);

    expect(screen.getByText('admin@zarailink.test')).toBeTruthy();
    await fireEvent.press(screen.getByText('Email'));
    await fireEvent.press(screen.getByText('Password'));
    await fireEvent.press(screen.getByText('Two-step verification'));
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, PROFILE_ROUTES.ChangeEmail);
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, PROFILE_ROUTES.ChangePassword);
    expect(navigation.navigate).toHaveBeenNthCalledWith(3, PROFILE_ROUTES.MfaEnrollment);
  });
});
