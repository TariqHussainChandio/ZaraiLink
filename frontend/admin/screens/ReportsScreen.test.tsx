import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ReportsScreen } from './ReportsScreen';
import {
  dismissReport,
  fetchAllProfiles,
  fetchReports,
  hideReview,
  resolveReport,
  setProfileSuspended,
} from '../services/adminService';
import { reviewExpertVerification, fetchExpertById, fetchExpertForAdminById } from '../../expert/services/expertService';
import { fetchListingById, updateListingStatus } from '../../common/marketplace/services/listingsService';
import { fetchMessageById, redactMessage } from '../../common/messaging/services/messagingService';
import { fetchReviewById } from '../../common/reviews/services/reviewsService';
import { useAuthStore } from '../../state/authStore';
import type { ReportWithReporter } from '../types/reports';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../services/adminService', () => ({
  dismissReport: jest.fn(),
  fetchAllProfiles: jest.fn(),
  fetchReports: jest.fn(),
  hideReview: jest.fn(),
  resolveReport: jest.fn(),
  setProfileSuspended: jest.fn(),
}));
jest.mock('../../expert/services/expertService', () => ({
  reviewExpertVerification: jest.fn(),
  fetchExpertById: jest.fn(),
  fetchExpertForAdminById: jest.fn(),
}));
jest.mock('../../common/marketplace/services/listingsService', () => ({
  fetchListingById: jest.fn(),
  updateListingStatus: jest.fn(),
}));
jest.mock('../../common/messaging/services/messagingService', () => ({
  fetchMessageById: jest.fn(),
  redactMessage: jest.fn(),
}));
jest.mock('../../common/reviews/services/reviewsService', () => ({
  fetchReviewById: jest.fn(),
}));

const mockFetchReports = fetchReports as jest.Mock;
const mockDismissReport = dismissReport as jest.Mock;
const mockResolveReport = resolveReport as jest.Mock;
const mockSetProfileSuspended = setProfileSuspended as jest.Mock;
const mockFetchAllProfiles = fetchAllProfiles as jest.Mock;
const mockFetchListingById = fetchListingById as jest.Mock;
const mockUpdateListingStatus = updateListingStatus as jest.Mock;
const mockFetchReviewById = fetchReviewById as jest.Mock;
const mockHideReview = hideReview as jest.Mock;

const report = (overrides: Partial<ReportWithReporter> = {}): ReportWithReporter => ({
  id: 'report-1',
  reporter_id: 'reporter-1',
  target_type: 'listing',
  target_id: 'listing-1',
  reason: 'Fraudulent listing',
  status: 'open',
  resolution_notes: null,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-08-01T10:00:00Z',
  reporter: { id: 'reporter-1', full_name: 'Reporter Rida' },
  ...overrides,
});

beforeEach(() => {
  mockFetchReports.mockReset();
  mockDismissReport.mockReset();
  mockResolveReport.mockReset();
  mockSetProfileSuspended.mockReset();
  mockFetchAllProfiles.mockReset();
  mockFetchListingById.mockReset();
  mockUpdateListingStatus.mockReset();
  mockFetchReviewById.mockReset();
  mockHideReview.mockReset();
  (fetchExpertById as jest.Mock).mockReset();
  (fetchExpertForAdminById as jest.Mock).mockReset();
  (fetchMessageById as jest.Mock).mockReset();
  (redactMessage as jest.Mock).mockReset();
  (reviewExpertVerification as jest.Mock).mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
});

/** The sheet's button: it renders after the card's button of the same name, so it is the last match. */
function sheetButton(label: string) {
  const matches = screen.getAllByText(label);
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`No "${label}" button`);
  return last;
}

/** A moderation action is confirmed in a sheet: the card's button opens it, the sheet's button of the same name acts. */
async function pressAndConfirm(label: string) {
  await fireEvent.press(screen.getByText(label));
  expect(await screen.findByText(`This will ${label.toLowerCase()} and mark the report resolved.`)).toBeTruthy();
  await fireEvent.press(sheetButton(label));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReportsScreen', () => {
  it('defaults to the open filter and loads open reports', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    await renderWithQuery(<ReportsScreen />);

    expect(mockFetchReports).toHaveBeenCalledWith('open');
    expect(await screen.findByText('Suspicious Tractor')).toBeTruthy();
    expect(screen.getByText('Reason: Fraudulent listing')).toBeTruthy();
    expect(screen.getByText('Reported by Reporter Rida')).toBeTruthy();
  });

  it('shows an empty state when there are no reports', async () => {
    mockFetchReports.mockResolvedValue([]);
    await renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText('No reports in this status')).toBeTruthy();
  });

  it("shows a retry state when loading fails", async () => {
    mockFetchReports.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText("Couldn't load reports")).toBeTruthy();

    mockFetchReports.mockResolvedValueOnce([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No reports in this status')).toBeTruthy();
  });

  it('switches filters and reloads with the new status', async () => {
    mockFetchReports.mockResolvedValue([]);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('No reports in this status');

    await fireEvent.press(screen.getByText('Resolved'));

    expect(mockFetchReports).toHaveBeenLastCalledWith('resolved');
  });

  it('removes a reported listing and resolves the report', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    mockUpdateListingStatus.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Suspicious Tractor');

    await fireEvent.press(screen.getByText('Remove Listing'));
    // Opening the confirmation changes nothing yet.
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();
    await fireEvent.press(sheetButton('Remove Listing'));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
  });

  it('suspends a reported user', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'user', target_id: 'user-9' })]);
    mockFetchAllProfiles.mockResolvedValue([{ id: 'user-9', full_name: 'Unruly Umar' }]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Unruly Umar');

    await pressAndConfirm('Suspend User');

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-9', true);
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
  });

  it('hides a reported review with the report as its reason, never deletes it', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'review', target_id: 'review-1', reason: 'Abusive' })]);
    mockFetchReviewById.mockResolvedValue({ id: 'review-1', comment: 'Terrible seller' });
    mockHideReview.mockResolvedValue({ id: 'review-1' });
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Terrible seller');

    expect(screen.queryByText('Delete Review')).toBeNull();
    await pressAndConfirm('Hide Review');

    expect(mockHideReview).toHaveBeenCalledWith('review-1', 'Reported: Abusive');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
    expect(await screen.findByText('Done. The report is resolved.')).toBeTruthy();
  });

  it('cancelling the confirmation takes no action', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'user', target_id: 'user-9' })]);
    mockFetchAllProfiles.mockResolvedValue([{ id: 'user-9', full_name: 'Unruly Umar' }]);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Unruly Umar');

    await fireEvent.press(screen.getByText('Suspend User'));
    await fireEvent.press(await screen.findByText('Cancel'));

    expect(mockSetProfileSuspended).not.toHaveBeenCalled();
    expect(mockResolveReport).not.toHaveBeenCalled();
  });

  it('tells the admin when the action fails and leaves the report open', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'user', target_id: 'user-9' })]);
    mockFetchAllProfiles.mockResolvedValue([{ id: 'user-9', full_name: 'Unruly Umar' }]);
    mockSetProfileSuspended.mockRejectedValue(new Error('This action requires a verified second factor (MFA).'));
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Unruly Umar');

    await pressAndConfirm('Suspend User');

    expect(await screen.findByText(/Could not update the report/)).toBeTruthy();
    expect(mockResolveReport).not.toHaveBeenCalled();
  });

  it('dismisses a report without taking a primary action', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    mockDismissReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Suspicious Tractor');

    await fireEvent.press(screen.getByText('Dismiss'));

    expect(mockDismissReport).toHaveBeenCalledWith('report-1', null);
  });

  it('falls back to a content-unavailable preview when the target lookup fails', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockRejectedValue(new Error('not found'));
    await renderWithQuery(<ReportsScreen />);

    expect(await screen.findByText('(content unavailable — may have been removed)')).toBeTruthy();
  });
});
