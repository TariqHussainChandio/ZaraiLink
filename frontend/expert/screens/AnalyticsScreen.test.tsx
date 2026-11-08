import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ExpertAnalyticsScreen } from './AnalyticsScreen';
import { fetchExpertAnalytics } from '../../common/analytics/services/analyticsService';
import { formatMonth } from '../../utils/dates';
import { useAuthStore } from '../../state/authStore';
import type { ExpertAnalytics } from '../../common/analytics/types/analytics';

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

jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchExpertAnalytics: jest.fn(),
}));

const mockFetchExpertAnalytics = fetchExpertAnalytics as jest.Mock;

// The chart runs up to the current month, so the data is dated relative to now and the test does not age.
const monthKey = (monthsAgo: number) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthName = (monthsAgo: number) => formatMonth(monthKey(monthsAgo));

const baseAnalytics: ExpertAnalytics = {
  totalConsultations: 10,
  completedConsultations: 6,
  averageRating: 4.5,
  reviewCount: 3,
  consultationsByMonth: [
    { month: monthKey(2), value: 2 },
    { month: monthKey(0), value: 4 },
  ],
};

describe('ExpertAnalyticsScreen', () => {
  beforeEach(() => {
    mockFetchExpertAnalytics.mockReset();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
  });

  it('renders the stats, with the review count as a note rather than in the label', async () => {
    mockFetchExpertAnalytics.mockResolvedValue(baseAnalytics);
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText('Total consultations')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Average rating')).toBeTruthy();
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(screen.getByText('from 3 reviews')).toBeTruthy();
    expect(screen.getByText('Consultations by month')).toBeTruthy();
  });

  it('names the months, shows the empty ones as zero, and speaks the whole chart', async () => {
    mockFetchExpertAnalytics.mockResolvedValue(baseAnalytics);
    await renderWithQuery(<ExpertAnalyticsScreen />);

    await screen.findByText('Consultations by month');
    expect(screen.getByText(monthName(2))).toBeTruthy();
    expect(screen.getByText(monthName(1))).toBeTruthy();
    expect(screen.getByText(monthName(0))).toBeTruthy();
    const chart = screen.getByRole('image', { name: /^Consultations by month: / });
    expect(chart.props.accessibilityLabel).toBe(
      `Consultations by month: ${monthName(2)} 2, ${monthName(1)} 0, ${monthName(0)} 4`,
    );
  });

  it('shows a dash and "No reviews yet" when there are no reviews', async () => {
    mockFetchExpertAnalytics.mockResolvedValue({ ...baseAnalytics, reviewCount: 0, averageRating: 0 });
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText('—')).toBeTruthy();
    expect(screen.getByText('No reviews yet')).toBeTruthy();
  });

  it('says there are no consultations yet instead of drawing an empty chart', async () => {
    mockFetchExpertAnalytics.mockResolvedValue({ ...baseAnalytics, consultationsByMonth: [] });
    await renderWithQuery(<ExpertAnalyticsScreen />);
    expect(await screen.findByText('No consultations yet')).toBeTruthy();
  });

  it('shows an error banner with Try again when loading fails', async () => {
    mockFetchExpertAnalytics.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchExpertAnalytics.mockResolvedValue(baseAnalytics);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Total consultations')).toBeTruthy();
  });
});
