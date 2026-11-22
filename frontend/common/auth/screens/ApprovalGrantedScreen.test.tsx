import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { useLoginNotice } from '../state/loginNotice';
import { ApprovalGrantedScreen } from './ApprovalGrantedScreen';
import { useAuthStore } from '../../../state/authStore';

describe('ApprovalGrantedScreen (A3a; SRDS §8)', () => {
  it('tells an approved expert to sign in again, and signs them out to do it', async () => {
    const signOut = jest.fn(() => Promise.resolve());
    useAuthStore.setState({ role: 'expert', status: 'approvalGranted', signOut, user: { id: 'u1', email: 'dr.ahsan@example.com' } as never });
    await renderWithQuery(<ApprovalGrantedScreen />);

    expect(screen.getByText('Your account is approved')).toBeTruthy();
    expect(screen.getByText('Sign in again to open your expert dashboard.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign in again'));
    expect(signOut).toHaveBeenCalledTimes(1);
    // Sign-in opens with a note and the email already filled in, not an empty form (AU-24).
    expect(useLoginNotice.getState().notice).toEqual(
      expect.objectContaining({ title: 'Your account is approved', email: 'dr.ahsan@example.com' }),
    );
  });
});
