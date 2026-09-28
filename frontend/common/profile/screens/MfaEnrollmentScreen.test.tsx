import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { AuthApiError } from '@supabase/supabase-js';
import { MfaEnrollmentScreen } from './MfaEnrollmentScreen';
import {
  enrollTotp,
  getVerifiedTotpFactorId,
  unenrollTotp,
  verifyTotpEnrollment,
} from '../../auth/services/mfaService';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

jest.mock('../../auth/services/mfaService', () => ({
  getVerifiedTotpFactorId: jest.fn(),
  enrollTotp: jest.fn(),
  verifyTotpEnrollment: jest.fn(),
  unenrollTotp: jest.fn(),
}));

const mockGetVerifiedFactorId = getVerifiedTotpFactorId as jest.Mock;
const mockEnroll = enrollTotp as jest.Mock;
const mockVerify = verifyTotpEnrollment as jest.Mock;
const mockUnenroll = unenrollTotp as jest.Mock;

function makeProps() {
  return {
    navigation: {},
    route: {},
  } as unknown as ProfileScreenProps<'MfaEnrollment'>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MfaEnrollmentScreen', () => {
  it('shows the enrolled state when a verified factor already exists', async () => {
    mockGetVerifiedFactorId.mockResolvedValue('factor-existing');
    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);

    expect(await screen.findByText('Two-factor authentication is enabled.')).toBeTruthy();
    expect(screen.getByText('Turn off two-factor authentication')).toBeTruthy();
  });

  it('walks through enroll -> scan -> verify when nothing is enrolled yet', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue({ factorId: 'factor-1', qrCodeSvg: '<svg></svg>', secret: 'TESTSECRET' });
    mockVerify.mockResolvedValue(undefined);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await screen.findByText('Set up two-factor authentication');

    await fireEvent.press(screen.getByText('Set up two-factor authentication'));
    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('TESTSECRET')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');
    await fireEvent.press(screen.getByText('Verify and enable'));

    expect(mockVerify).toHaveBeenCalledWith('factor-1', '123456');
    expect(await screen.findByText('Two-factor authentication is enabled.')).toBeTruthy();
  });

  it('shows an error and stays on the verify step when the code is wrong', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue({ factorId: 'factor-1', qrCodeSvg: '<svg></svg>', secret: 'TESTSECRET' });
    mockVerify.mockRejectedValue(new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'));

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Set up two-factor authentication'));
    await screen.findByText('TESTSECRET');

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '000000');
    await fireEvent.press(screen.getByText('Verify and enable'));

    expect(await screen.findByText("That code isn't right. Check your app and try again.")).toBeTruthy();
    expect(screen.queryByText('Invalid TOTP code entered')).toBeNull();
    expect(screen.queryByText('Two-factor authentication is enabled.')).toBeNull();
  });

  it('disables two-factor authentication for a factor enrolled in an earlier session', async () => {
    // Regression test: the factor id in this case comes only from getVerifiedTotpFactorId() on
    // load, never from enrollTotp() (that only ran in a previous session) — onDisable must use
    // that id, not silently no-op because no fresh enrollTotp() response exists this session.
    mockGetVerifiedFactorId.mockResolvedValue('factor-from-earlier-session');
    mockUnenroll.mockResolvedValue(undefined);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await screen.findByText('Two-factor authentication is enabled.');
    await fireEvent.press(screen.getByText('Turn off two-factor authentication'));

    expect(mockUnenroll).toHaveBeenCalledWith('factor-from-earlier-session');
    expect(await screen.findByText('Set up two-factor authentication')).toBeTruthy();
  });
});
