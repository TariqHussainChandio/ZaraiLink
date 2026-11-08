import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExpertCard } from './ExpertCard';
import type { ExpertWithProfile } from '../../../expert/types/expert';

const baseExpert: ExpertWithProfile = {
  id: 'e1',
  qualifications: null,
  degree: 'PhD Agronomy',
  experience: '10 years',
  professional_description: null,
  location: null,
  contact: null,
  years_experience: null,
  institution_affiliation: null,
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'u1', full_name: 'Dr. Ayesha Khan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }, { specialization: 'irrigation' }],
};

describe('ExpertCard', () => {
  it('renders the expert name, degree, and mapped specialization labels', async () => {
    await render(<ExpertCard expert={baseExpert} onPress={() => {}} />);
    expect(screen.getByText('Dr. Ayesha Khan')).toBeTruthy();
    expect(screen.getByText('PhD Agronomy')).toBeTruthy();
    expect(screen.getByText('Plant diseases, Irrigation')).toBeTruthy();
  });

  it('falls back to "Expert" when the profile has no name', async () => {
    await render(<ExpertCard expert={{ ...baseExpert, profile: null }} onPress={() => {}} />);
    expect(screen.getByText('Expert')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ExpertCard expert={baseExpert} onPress={onPress} />);
    fireEvent.press(screen.getByText('Dr. Ayesha Khan'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
