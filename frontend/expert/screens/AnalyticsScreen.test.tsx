import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ExpertAnalyticsScreen } from './AnalyticsScreen';
import { fetchExpertAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import type { ExpertAnalytics } from '../../types/analytics';

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

jest.mock('../../services/modules/analytics/analyticsService', () => ({
  fetchExpertAnalytics: jest.fn(),
}));

const mockFetchExpertAnalytics = fetchExpertAnalytics as jest.Mock;

const baseAnalytics: ExpertAnalytics = {
  totalConsultations: 10,
  completedConsultations: 6,
  averageRating: 4.5,
  reviewCount: 3,
  consultationsByMonth: [
    { month: '2026-07', value: 2 },
    { month: '2026-08', value: 4 },
  ],
};

describe('ExpertAnalyticsScreen', () => {
  beforeEach(() => {
    mockFetchExpertAnalytics.mockReset();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
  });

  it('renders the stats and monthly chart once analytics load', async () => {
    mockFetchExpertAnalytics.mockResolvedValue(baseAnalytics);
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText('10')).toBeTruthy();
    expect(screen.getByText('Total Consultations')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(screen.getByText('Avg Rating (3)')).toBeTruthy();
    expect(screen.getByText('Consultations by Month')).toBeTruthy();
    expect(screen.getByText('07')).toBeTruthy();
    expect(screen.getByText('08')).toBeTruthy();
  });

  it('shows a dash for average rating when there are no reviews', async () => {
    mockFetchExpertAnalytics.mockResolvedValue({ ...baseAnalytics, reviewCount: 0, averageRating: 0 });
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText('—')).toBeTruthy();
    expect(screen.getByText('Avg Rating (0)')).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExpertAnalytics.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ExpertAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchExpertAnalytics.mockResolvedValue(baseAnalytics);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Total Consultations')).toBeTruthy();
  });
});
