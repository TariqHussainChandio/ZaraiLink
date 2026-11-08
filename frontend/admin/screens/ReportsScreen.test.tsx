import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ReportsScreen } from './ReportsScreen';
import { dismissReport, fetchReportsPage, resolveReport, setProfileSuspended } from '../services/adminService';
import { fetchExpertById } from '../../expert/services/expertService';
import { fetchListingById, updateListingStatus } from '../../common/marketplace/services/listingsService';
import { fetchMessageById, redactMessage } from '../../common/messaging/services/messagingService';
import { deleteReview, fetchReviewById } from '../../common/reviews/services/reviewsService';
import type { ReportWithReporter } from '../types/reports';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../services/adminService', () => ({
  dismissReport: jest.fn(),
  fetchReportsPage: jest.fn(),
  resolveReport: jest.fn(),
  setProfileSuspended: jest.fn(),
}));
jest.mock('../../expert/services/expertService', () => ({ fetchExpertById: jest.fn() }));
jest.mock('../../common/marketplace/services/listingsService', () => ({
  fetchListingById: jest.fn(),
  updateListingStatus: jest.fn(),
}));
jest.mock('../../common/messaging/services/messagingService', () => ({
  fetchMessageById: jest.fn(),
  redactMessage: jest.fn(),
}));
jest.mock('../../common/reviews/services/reviewsService', () => ({
  deleteReview: jest.fn(),
  fetchReviewById: jest.fn(),
}));

const mockFetchPage = fetchReportsPage as jest.Mock;
const mockDismissReport = dismissReport as jest.Mock;
const mockResolveReport = resolveReport as jest.Mock;
const mockSetProfileSuspended = setProfileSuspended as jest.Mock;
const mockFetchListingById = fetchListingById as jest.Mock;
const mockUpdateListingStatus = updateListingStatus as jest.Mock;
const mockFetchReviewById = fetchReviewById as jest.Mock;
const mockDeleteReview = deleteReview as jest.Mock;
const mockFetchMessageById = fetchMessageById as jest.Mock;
const mockRedactMessage = redactMessage as jest.Mock;
const mockFetchExpertById = fetchExpertById as jest.Mock;

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

const page = (rows: ReportWithReporter[], next: { limit: number; offset: number } | null = null) => ({ data: rows, next });

beforeEach(() => {
  for (const mock of [mockFetchPage, mockDismissReport, mockResolveReport, mockSetProfileSuspended, mockFetchListingById, mockUpdateListingStatus, mockFetchReviewById, mockDeleteReview, mockFetchMessageById, mockRedactMessage, mockFetchExpertById]) {
    mock.mockReset();
  }
  mockFetchPage.mockResolvedValue(page([report()]));
  mockFetchListingById.mockResolvedValue({
    id: 'listing-1',
    title: 'Urea 50 kg',
    description: 'Cheap fertiliser',
    price: 4200,
    unit: 'bag',
    status: 'active',
    owner: { id: 'o1', full_name: 'Seller Sana' },
  });
});

describe('ReportsScreen', () => {
  it('defaults to open reports and shows the reason with a sentence-case kind badge', async () => {
    await renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText('Fraudulent listing')).toBeTruthy();
    expect(screen.getByText('Listing')).toBeTruthy();
    expect(screen.queryByText('LISTING')).toBeNull();
    expect(screen.getByText(/Reported by Reporter Rida/)).toBeTruthy();
    expect(mockFetchPage).toHaveBeenCalledWith('open', 0);
  });

  it('offers no Investigating filter, because nothing can set that status (AD-13)', async () => {
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Fraudulent listing');
    expect(screen.queryByRole('button', { name: 'Investigating' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismissed' })).toBeTruthy();
  });

  it('words the empty state for the filter in use', async () => {
    mockFetchPage.mockResolvedValue(page([]));
    await renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText('No reports waiting')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('No reports yet')).toBeTruthy();
    expect(screen.queryByText('No reports in this status')).toBeNull();
  });

  it('says the load failed, and retries, instead of an empty list', async () => {
    mockFetchPage.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText("Couldn't load reports")).toBeTruthy();

    mockFetchPage.mockResolvedValueOnce(page([report()]));
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Fraudulent listing')).toBeTruthy();
  });

  it('switches filters and reloads with the new status', async () => {
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Fraudulent listing');

    await fireEvent.press(screen.getByRole('button', { name: 'Resolved' }));

    expect(mockFetchPage).toHaveBeenLastCalledWith('resolved', 0);
  });

  it('opens the reported item with the reason it was reported (AD-13)', async () => {
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));

    expect(await screen.findByText('Urea 50 kg')).toBeTruthy();
    expect(screen.getByText('Cheap fertiliser')).toBeTruthy();
    expect(screen.getByText('Seller: Seller Sana')).toBeTruthy();
    expect(screen.getByText('Reported because')).toBeTruthy();
  });

  it('hides a reported listing with a reason, in plain words, and resolves the report', async () => {
    mockUpdateListingStatus.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));
    await screen.findByText('Urea 50 kg');

    await fireEvent.press(screen.getByRole('button', { name: 'Hide listing' }));
    expect(await screen.findByText('Hide "Urea 50 kg" from the marketplace and close this report? The seller keeps the listing.')).toBeTruthy();
    // A reason is required before the act can be confirmed.
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Hide listing' }));
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Misleading or fake' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Hide listing' }));

    expect(mockUpdateListingStatus).toHaveBeenCalledWith('listing-1', 'inactive');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', 'Misleading or fake');
    expect(await screen.findByText('Listing hidden and report closed')).toBeTruthy();
  });

  it('suspends a reported user', async () => {
    mockFetchPage.mockResolvedValue(page([report({ target_type: 'user', target_id: 'user-9', reason: 'Scam' })]));
    mockSetProfileSuspended.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Scam'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Suspend user' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Fraud or fake listings' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Suspend user' }));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('user-9', true);
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', 'Fraud or fake listings');
  });

  it('deletes a reported review', async () => {
    mockFetchPage.mockResolvedValue(page([report({ target_type: 'review', target_id: 'review-1' })]));
    mockFetchReviewById.mockResolvedValue({ id: 'review-1', rating: 1, comment: 'Awful' });
    mockDeleteReview.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));
    expect(await screen.findByText('Awful')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete review' }));
    await screen.findByText('Delete this review?');
    await fireEvent.press(screen.getByRole('button', { name: 'Spam or advertising' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete review' }));

    expect(mockDeleteReview).toHaveBeenCalledWith('review-1');
    expect(mockResolveReport).toHaveBeenCalledWith('report-1', 'Spam or advertising');
  });

  it('removes a reported message', async () => {
    mockFetchPage.mockResolvedValue(page([report({ target_type: 'message', target_id: 'message-1' })]));
    mockFetchMessageById.mockResolvedValue({ id: 'message-1', body: 'Send money first' });
    mockRedactMessage.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));
    expect(await screen.findByText('Send money first')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove message' }));
    await screen.findByText('Remove this message?');
    await fireEvent.press(screen.getByRole('button', { name: 'Harassment' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove message' }));
    expect(mockRedactMessage).toHaveBeenCalledWith('message-1');

  });

  it('suspends a reported expert, named in the question', async () => {
    mockFetchPage.mockResolvedValue(page([report({ target_type: 'expert', target_id: 'expert-1' })]));
    mockFetchExpertById.mockResolvedValue({ profile: { full_name: 'Dr Sana' } });
    mockSetProfileSuspended.mockResolvedValue(undefined);
    mockResolveReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));
    expect(await screen.findByText('Dr Sana')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Suspend expert' }));
    expect(await screen.findByText('Suspend Dr Sana?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Poor or harmful advice' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Suspend expert' }));

    expect(mockSetProfileSuspended).toHaveBeenCalledWith('expert-1', true);
  });

  it('dismisses a report with a reason, without taking the other action', async () => {
    mockDismissReport.mockResolvedValue(undefined);
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));
    await screen.findByText('Urea 50 kg');

    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss report' }));
    expect(await screen.findByText('Dismiss this report?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Does not break the rules' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss report' }));

    expect(mockDismissReport).toHaveBeenCalledWith('report-1', 'Does not break the rules');
    expect(mockUpdateListingStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Report dismissed')).toBeTruthy();
  });

  it('says so when the reported content is gone', async () => {
    mockFetchListingById.mockRejectedValue(new Error('404'));
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));

    expect(await screen.findByText('This content is no longer available')).toBeTruthy();
  });

  it('shows how a decided report ended, with no actions', async () => {
    mockFetchPage.mockResolvedValue(
      page([report({ status: 'dismissed', resolution_notes: 'Does not break the rules' })]),
    );
    await renderWithQuery(<ReportsScreen />);
    await fireEvent.press(await screen.findByText('Fraudulent listing'));

    expect(await screen.findByText('Does not break the rules')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dismiss report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide listing' })).toBeNull();
  });

  it('loads older reports', async () => {
    mockFetchPage.mockResolvedValueOnce(page([report()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([report({ id: 'report-101', reason: 'Report 101' })]));
    await renderWithQuery(<ReportsScreen />);
    await screen.findByText('Fraudulent listing');

    await fireEvent.press(screen.getByRole('button', { name: 'Load more reports' }));

    expect(await screen.findByText('Report 101')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith('open', 50);
  });
});
