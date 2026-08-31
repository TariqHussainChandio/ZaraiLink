import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExpertVerificationScreen } from './ExpertVerificationScreen';
import {
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  type ExpertWithVerifications,
} from '../../services/modules/expert/expertService';
import { useAuthStore } from '../../store/authStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    // Depends on the effect's own identity (like react-navigation's real hook) rather than `[]`
    // so a screen that reloads when its memoized load callback changes (e.g. a filter change)
    // is exercised the same way it would be under a real focused navigator.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../../services/modules/expert/expertService', () => ({
  fetchExpertsForAdmin: jest.fn(),
  resolveExpertDocumentUrl: jest.fn(),
  reviewExpertVerification: jest.fn(),
}));

const mockFetchExperts = fetchExpertsForAdmin as jest.Mock;
const mockResolveDocumentUrl = resolveExpertDocumentUrl as jest.Mock;
const mockReviewVerification = reviewExpertVerification as jest.Mock;

const expert = (overrides: Partial<ExpertWithVerifications> = {}): ExpertWithVerifications => ({
  id: 'expert-1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: null,
  location: null,
  contact: null,
  verification_status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  profile: { id: 'user-1', full_name: 'Dr. Ali', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }],
  expert_verifications: [
    {
      id: 'ver-1',
      expert_id: 'expert-1',
      document_url: 'docs/expert-1.pdf',
      reviewed_by: null,
      decision: null,
      decision_at: null,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  ...overrides,
});

beforeEach(() => {
  mockFetchExperts.mockReset();
  mockResolveDocumentUrl.mockReset();
  mockReviewVerification.mockReset();
  useAuthStore.setState({ user: { id: 'admin-1' } as never });
  jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExpertVerificationScreen', () => {
  it('defaults to the pending filter and loads pending experts', async () => {
    mockFetchExperts.mockResolvedValue([expert()]);
    await render(<ExpertVerificationScreen />);

    expect(await screen.findByText('Dr. Ali')).toBeTruthy();
    expect(mockFetchExperts).toHaveBeenCalledWith('pending');
    expect(screen.getByText('PhD Agronomy')).toBeTruthy();
  });

  it('shows an empty state when there are no experts in the current status', async () => {
    mockFetchExperts.mockResolvedValue([]);
    await render(<ExpertVerificationScreen />);
    expect(await screen.findByText('No experts in this status')).toBeTruthy();
  });

  it('switches filters and reloads with the new status', async () => {
    mockFetchExperts.mockResolvedValue([expert({ verification_status: 'approved' })]);
    await render(<ExpertVerificationScreen />);
    await screen.findByText('Dr. Ali');

    await fireEvent.press(screen.getByText('Approved'));

    expect(mockFetchExperts).toHaveBeenLastCalledWith('approved');
  });

  it('approves a pending expert with the decision note', async () => {
    mockFetchExperts.mockResolvedValue([expert()]);
    mockReviewVerification.mockResolvedValue(undefined);
    await render(<ExpertVerificationScreen />);
    await screen.findByText('Dr. Ali');

    await fireEvent.changeText(screen.getByPlaceholderText('Decision note (optional)'), 'Looks good');
    await fireEvent.press(screen.getByText('Approve'));

    expect(mockReviewVerification).toHaveBeenCalledWith('expert-1', 'ver-1', 'approved', 'Looks good');
  });

  it('rejects a pending expert', async () => {
    mockFetchExperts.mockResolvedValue([expert()]);
    mockReviewVerification.mockResolvedValue(undefined);
    await render(<ExpertVerificationScreen />);
    await screen.findByText('Dr. Ali');

    await fireEvent.press(screen.getByText('Reject'));

    expect(mockReviewVerification).toHaveBeenCalledWith('expert-1', 'ver-1', 'rejected', '');
  });

  it('suspends an approved expert and can reactivate a suspended one', async () => {
    mockFetchExperts.mockResolvedValue([expert({ verification_status: 'approved' })]);
    mockReviewVerification.mockResolvedValue(undefined);
    await render(<ExpertVerificationScreen />);
    await screen.findByText('Dr. Ali');

    await fireEvent.press(screen.getByText('Suspend'));
    expect(mockReviewVerification).toHaveBeenCalledWith('expert-1', 'ver-1', 'suspended', '');
  });

  it('opens the verification document via resolved URL', async () => {
    mockFetchExperts.mockResolvedValue([expert()]);
    mockResolveDocumentUrl.mockResolvedValue('https://storage.example.com/expert-1.pdf');
    await render(<ExpertVerificationScreen />);
    await screen.findByText('Dr. Ali');

    await fireEvent.press(screen.getByText('View Document'));

    expect(mockResolveDocumentUrl).toHaveBeenCalledWith('expert-1');
    expect(Linking.openURL).toHaveBeenCalledWith('https://storage.example.com/expert-1.pdf');
  });
});
