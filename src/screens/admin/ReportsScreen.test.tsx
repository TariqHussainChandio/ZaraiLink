import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportsScreen } from './ReportsScreen';
import {
  dismissReport,
  fetchAllProfiles,
  fetchReports,
  resolveReport,
  setProfileSuspended,
} from '../../services/modules/admin/adminService';
import { reviewExpertVerification, fetchExpertById, fetchExpertForAdminById } from '../../services/modules/expert/expertService';
import { fetchListingById, updateListingStatus } from '../../services/modules/marketplace/listingsService';
import { fetchMessageById, redactMessage } from '../../services/modules/messaging/messagingService';
import { deleteReview, fetchReviewById } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import type { ReportWithReporter } from '../../types/reports';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../../services/modules/admin/adminService', () => ({
  dismissReport: jest.fn(),
  fetchAllProfiles: jest.fn(),
  fetchReports: jest.fn(),
  resolveReport: jest.fn(),
  setProfileSuspended: jest.fn(),
}));
jest.mock('../../services/modules/expert/expertService', () => ({
  reviewExpertVerification: jest.fn(),
  fetchExpertById: jest.fn(),
  fetchExpertForAdminById: jest.fn(),
}));
jest.mock('../../services/modules/marketplace/listingsService', () => ({
  fetchListingById: jest.fn(),
  updateListingStatus: jest.fn(),
}));
jest.mock('../../services/modules/messaging/messagingService', () => ({
  fetchMessageById: jest.fn(),
  redactMessage: jest.fn(),
}));
jest.mock('../../services/modules/reviews/reviewsService', () => ({
  deleteReview: jest.fn(),
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
const mockDeleteReview = deleteReview as jest.Mock;

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
  mockDeleteReview.mockReset();
  (fetchExpertById as jest.Mock).mockReset();
  (fetchExpertForAdminById as jest.Mock).mockReset();
  (fetchMessageById as jest.Mock).mockReset();
  (redactMessage as jest.Mock).mockReset();
  (reviewExpertVerification as jest.Mock).mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    buttons?.find((b: { style?: string }) => b.style === 'destructive')?.onPress?.();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReportsScreen', () => {
  it('defaults to the open filter and loads open reports', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    await render(<ReportsScreen />);

    expect(mockFetchReports).toHaveBeenCalledWith('open');
    expect(await screen.findByText('Suspicious Tractor')).toBeTruthy();
    expect(screen.getByText('Reason: Fraudulent listing')).toBeTruthy();
    expect(screen.getByText('Reported by Reporter Rida')).toBeTruthy();
  });

  it('shows an empty state when there are no reports', async () => {
    mockFetchReports.mockResolvedValue([]);
    await render(<ReportsScreen />);
    expect(await screen.findByText('No reports in this status')).toBeTruthy();
  });

  it("shows a retry state when loading fails", async () => {
    mockFetchReports.mockRejectedValueOnce(new Error('offline'));
    await render(<ReportsScreen />);
    expect(await screen.findByText("Couldn't load reports")).toBeTruthy();

    mockFetchReports.mockResolvedValueOnce([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No reports in this status')).toBeTruthy();
  });

  it('switches filters and reloads with the new status', async () => {
    mockFetchReports.mockResolvedValue([]);
    await render(<ReportsScreen />);
    await screen.findByText('No reports in this status');

    await fireEvent.press(screen.getByText('Resolved'));

    expect(mockFetchReports).toHaveBeenLastCalledWith('resolved');
  });

  it('removes a reported listing and resolves the report', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    mockUpdateListingStatus.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await render(<ReportsScreen />);
    await screen.findByText('Suspicious Tractor');

    await fireEvent.press(screen.getByText('Remove Listing'));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
  });

  it('suspends a reported user', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'user', target_id: 'user-9' })]);
    mockFetchAllProfiles.mockResolvedValue([{ id: 'user-9', full_name: 'Unruly Umar' }]);
    mockSetProfileSuspended.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await render(<ReportsScreen />);
    await screen.findByText('Unruly Umar');

    await fireEvent.press(screen.getByText('Suspend User'));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-9', true);
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
  });

  it('deletes a reported review', async () => {
    mockFetchReports.mockResolvedValue([report({ target_type: 'review', target_id: 'review-1' })]);
    mockFetchReviewById.mockResolvedValue({ id: 'review-1', comment: 'Terrible seller' });
    mockDeleteReview.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await render(<ReportsScreen />);
    await screen.findByText('Terrible seller');

    await fireEvent.press(screen.getByText('Delete Review'));

    expect(mockDeleteReview).toHaveBeenCalledWith('review-1');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', null);
  });

  it('dismisses a report without taking a primary action', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockResolvedValue({ id: 'listing-1', title: 'Suspicious Tractor' });
    mockDismissReport.mockResolvedValue(undefined);
    await render(<ReportsScreen />);
    await screen.findByText('Suspicious Tractor');

    await fireEvent.press(screen.getByText('Dismiss'));

    expect(mockDismissReport).toHaveBeenCalledWith('report-1', null);
  });

  it('falls back to a content-unavailable preview when the target lookup fails', async () => {
    mockFetchReports.mockResolvedValue([report()]);
    mockFetchListingById.mockRejectedValue(new Error('not found'));
    await render(<ReportsScreen />);

    expect(await screen.findByText('(content unavailable — may have been removed)')).toBeTruthy();
  });
});
