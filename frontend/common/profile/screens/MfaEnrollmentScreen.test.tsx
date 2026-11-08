import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
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

const OTPAUTH = 'otpauth://totp/ZaraiLink:admin@zarailink.test?secret=TESTSECRET&issuer=ZaraiLink';
const ENROLMENT = { factorId: 'factor-1', qrCodeSvg: '<svg></svg>', secret: 'TESTSECRET', uri: OTPAUTH };

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

    expect(await screen.findByText('Two-step verification is on.')).toBeTruthy();
    expect(screen.getByText('Turn off two-step verification')).toBeTruthy();
    // One name for the feature, everywhere.
    expect(screen.queryByText(/two-factor/i)).toBeNull();
  });

  it('walks through enroll -> scan -> verify when nothing is enrolled yet', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue(ENROLMENT);
    mockVerify.mockResolvedValue(undefined);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await screen.findByText('Set up two-step verification');

    await fireEvent.press(screen.getByText('Set up two-step verification'));
    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('TESTSECRET')).toBeTruthy();

    // The last digit verifies by itself.
    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    expect(mockVerify).toHaveBeenCalledWith('factor-1', '123456');
    expect(await screen.findByText('Two-step verification is on.')).toBeTruthy();
  });

  it('opens the authenticator app with the key already in it, since a phone cannot scan its own screen (AU-20)', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue(ENROLMENT);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Set up two-step verification'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Open authenticator app' }));

    expect(open).toHaveBeenCalledWith(OTPAUTH);
    open.mockRestore();
  });

  it('says so when no authenticator app can take the link', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue(ENROLMENT);
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found'));

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Set up two-step verification'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Open authenticator app' }));

    expect(await screen.findByText(/No authenticator app was found/)).toBeTruthy();
    open.mockRestore();
  });

  it('shows an error under the code and stays on the verify step when the code is wrong', async () => {
    mockGetVerifiedFactorId.mockResolvedValue(null);
    mockEnroll.mockResolvedValue(ENROLMENT);
    mockVerify.mockRejectedValue(new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'));

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Set up two-step verification'));
    await screen.findByText('TESTSECRET');

    await fireEvent.changeText(screen.getByLabelText('Authentication code'), '000000');

    expect(await screen.findByText("That code isn't right. Check your app and try again.")).toBeTruthy();
    expect(screen.queryByText('Invalid TOTP code entered')).toBeNull();
    expect(screen.queryByText('Two-step verification is on.')).toBeNull();
  });

  it('asks before turning it off, and says what stops working (AU-20)', async () => {
    mockGetVerifiedFactorId.mockResolvedValue('factor-from-earlier-session');
    mockUnenroll.mockResolvedValue(undefined);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Turn off two-step verification'));

    // One tap does nothing but ask.
    expect(mockUnenroll).not.toHaveBeenCalled();
    expect(await screen.findByText(/Approvals, suspensions and other admin decisions stop working/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep it on' }));
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it('turns it off for a factor enrolled in an earlier session, once the sheet is confirmed', async () => {
    // Regression test: the factor id in this case comes only from getVerifiedTotpFactorId() on
    // load, never from enrollTotp() (that only ran in a previous session) — onDisable must use
    // that id, not silently no-op because no fresh enrollTotp() response exists this session.
    mockGetVerifiedFactorId.mockResolvedValue('factor-from-earlier-session');
    mockUnenroll.mockResolvedValue(undefined);

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Turn off two-step verification'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(mockUnenroll).toHaveBeenCalledWith('factor-from-earlier-session'));
    expect(await screen.findByText('Set up two-step verification')).toBeTruthy();
  });

  it('keeps the sheet open with the reason when turning it off fails', async () => {
    mockGetVerifiedFactorId.mockResolvedValue('factor-x');
    mockUnenroll.mockRejectedValue(new TypeError('Network request failed'));

    await renderWithQuery(<MfaEnrollmentScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByText('Turn off two-step verification'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn off' }));

    expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.getByText('Two-step verification is on.')).toBeTruthy();
  });
});
