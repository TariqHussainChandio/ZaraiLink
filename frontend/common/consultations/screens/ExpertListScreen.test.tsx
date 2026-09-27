import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ExpertListScreen } from './ExpertListScreen';
import { fetchExperts } from '../../services/modules/expert/expertService';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import type { ExpertWithProfile } from '../../types/expert';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

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

jest.mock('../../services/modules/expert/expertService', () => ({
  fetchExperts: jest.fn(),
}));

const mockFetchExperts = fetchExperts as jest.Mock;

const expert: ExpertWithProfile = {
  id: 'e1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Crop specialist',
  location: null,
  contact: '0300-0000000',
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'e1', full_name: 'Dr. Ahsan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }],
};

function makeProps(params?: { specialization?: ExpertWithProfile['expert_specializations'][number]['specialization']; prefill?: never }) {
  return {
    navigation: { navigate: jest.fn() },
    route: { params },
  } as unknown as ConsultationsScreenProps<'ExpertList'>;
}

describe('ExpertListScreen', () => {
  beforeEach(() => {
    mockFetchExperts.mockReset();
  });

  it('renders the list of verified experts', async () => {
    mockFetchExperts.mockResolvedValue([expert]);
    await renderWithQuery(<ExpertListScreen {...makeProps()} />);

    expect(await screen.findByText('Dr. Ahsan')).toBeTruthy();
    expect(screen.getByText('PhD')).toBeTruthy();
    expect(screen.getByText('Plant Diseases')).toBeTruthy();
  });

  it('passes the specialization filter through to fetchExperts', async () => {
    mockFetchExperts.mockResolvedValue([]);
    await renderWithQuery(<ExpertListScreen {...makeProps({ specialization: 'plant_diseases' })} />);

    await screen.findByText('No verified experts yet');
    expect(mockFetchExperts).toHaveBeenCalledWith({ specialization: 'plant_diseases' });
  });

  it('navigates to the expert profile with the expert id and prefill', async () => {
    mockFetchExperts.mockResolvedValue([expert]);
    const prefill = { subject: 'Yellow leaves', problemDescription: '', cropId: null, imageUrl: null };
    const props = makeProps({ prefill: prefill as never });
    await renderWithQuery(<ExpertListScreen {...props} />);

    await fireEvent.press(await screen.findByText('Dr. Ahsan'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(CONSULTATIONS_ROUTES.ExpertProfile, {
      expertId: 'e1',
      prefill,
    });
  });

  it('shows the empty state when there are no experts', async () => {
    mockFetchExperts.mockResolvedValue([]);
    await renderWithQuery(<ExpertListScreen {...makeProps()} />);
    expect(await screen.findByText('No verified experts yet')).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExperts.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ExpertListScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load experts")).toBeTruthy();

    mockFetchExperts.mockResolvedValue([expert]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Dr. Ahsan')).toBeTruthy();
  });
});
