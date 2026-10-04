import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApprovalGrantedScreen } from './ApprovalGrantedScreen';
import { useAuthStore } from '../../../state/authStore';

describe('ApprovalGrantedScreen (A3a; SRDS §8)', () => {
  it('tells an approved expert to sign in again, and signs them out to do it', async () => {
    const signOut = jest.fn(() => Promise.resolve());
    useAuthStore.setState({ role: 'expert', status: 'approvalGranted', signOut });
    await render(<ApprovalGrantedScreen />);

    expect(screen.getByText('Your account is approved')).toBeTruthy();
    expect(screen.getByText('Sign in again to open your expert dashboard.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign in again'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
