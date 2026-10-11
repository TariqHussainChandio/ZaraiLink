import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AiActivityScreen } from './AiActivityScreen';
import { fetchAiActivity } from '../services/adminService';
import type { AiActivity } from '../types/ai';

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
  fetchAiActivity: jest.fn(),
}));

const mockFetchAiActivity = fetchAiActivity as jest.Mock;

const activity = (overrides: Partial<AiActivity> = {}): AiActivity => ({
  window_days: 30,
  since: '2026-09-12T00:00:00+00:00',
  scans: 12,
  failed: 2,
  predicted: 8,
  low_confidence: 1,
  low_confidence_share: 0.125,
  referrals: 3,
  days: [
    { date: '2026-10-10', scans: 4, failed: 1, low_confidence: 0, referrals: 1 },
    { date: '2026-10-11', scans: 8, failed: 1, low_confidence: 1, referrals: 2 },
  ],
  ...overrides,
});

beforeEach(() => {
  mockFetchAiActivity.mockReset();
});

describe('AiActivityScreen', () => {
  it('shows the window totals as tiles', async () => {
    mockFetchAiActivity.mockResolvedValue(activity());
    await renderWithQuery(<AiActivityScreen />);

    expect(await screen.findByLabelText('Scans: 12')).toBeTruthy();
    expect(screen.getByLabelText('Failed: 2')).toBeTruthy();
    expect(screen.getByLabelText('Expert referrals: 3')).toBeTruthy();
    expect(screen.getByLabelText(/^Low confidence: 12\.5\s?%\. 1 of 8 predictions$/)).toBeTruthy();
    expect(screen.getByText(/^Last 30 days, since/)).toBeTruthy();
  });

  it('lists the days newest first with each day’s counts', async () => {
    mockFetchAiActivity.mockResolvedValue(activity());
    await renderWithQuery(<AiActivityScreen />);

    const newest = await screen.findByText('8 scans · 1 failed · 1 low confidence · 2 referrals');
    const older = screen.getByText('4 scans · 1 failed · 0 low confidence · 1 referrals');
    expect(newest && older).toBeTruthy();
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered.indexOf('8 scans')).toBeLessThan(rendered.indexOf('4 scans'));
  });

  it('shows an empty state when the window has no days', async () => {
    mockFetchAiActivity.mockResolvedValue(
      activity({ scans: 0, failed: 0, predicted: 0, low_confidence: 0, low_confidence_share: 0, referrals: 0, days: [] }),
    );
    await renderWithQuery(<AiActivityScreen />);
    expect(await screen.findByText('No scans in this window')).toBeTruthy();
  });

  it('shows a retry banner when the counts cannot be read', async () => {
    mockFetchAiActivity.mockRejectedValue(new Error('Admin access required'));
    await renderWithQuery(<AiActivityScreen />);
    expect(await screen.findByText("Couldn't load AI activity")).toBeTruthy();
  });
});
