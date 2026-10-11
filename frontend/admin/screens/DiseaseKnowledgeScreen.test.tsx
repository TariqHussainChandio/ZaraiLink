import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseKnowledgeScreen } from './DiseaseKnowledgeScreen';
import { fetchDiseaseKnowledge } from '../services/adminService';
import type { DiseaseKnowledgeEntry } from '../types/ai';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

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
  fetchDiseaseKnowledge: jest.fn(),
}));

const mockFetchKnowledge = fetchDiseaseKnowledge as jest.Mock;

const entry = (overrides: Partial<DiseaseKnowledgeEntry>): DiseaseKnowledgeEntry => ({
  class_label: 'Tomato___Early_blight',
  crop: 'Tomato',
  disease: 'Early blight',
  is_healthy: false,
  symptoms: [],
  treatment: [],
  precautions: [],
  advisory: 'Remove affected leaves.',
  review_status: 'pending_review',
  reviewed_by: null,
  reviewed_at: null,
  updated_at: '2026-10-01T00:00:00+00:00',
  ...overrides,
});

const entries = [
  entry({}),
  entry({
    class_label: 'Apple___Apple_scab',
    crop: 'Apple',
    disease: 'Apple scab',
    review_status: 'reviewed',
    reviewed_by: 'admin-1',
    reviewed_at: '2026-10-05T00:00:00+00:00',
  }),
];

function makeProps() {
  const navigate = jest.fn();
  const props = { navigation: { navigate }, route: { params: undefined } } as unknown as AdminScreenProps<
    typeof ADMIN_HOME_ROUTES.DiseaseKnowledge
  >;
  return { props, navigate };
}

beforeEach(() => {
  mockFetchKnowledge.mockReset();
});

describe('DiseaseKnowledgeScreen', () => {
  it('lists every entry by crop with its review state', async () => {
    mockFetchKnowledge.mockResolvedValue(entries);
    await renderWithQuery(<DiseaseKnowledgeScreen {...makeProps().props} />);

    expect(await screen.findByText('Apple — Apple scab')).toBeTruthy();
    expect(screen.getByText('Tomato — Early blight')).toBeTruthy();
    // The filter chip and the reviewed entry's badge.
    expect(screen.getAllByText('Reviewed')).toHaveLength(2);
    expect(screen.getByText('Pending agronomist review')).toBeTruthy();
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered.indexOf('Apple — Apple scab')).toBeLessThan(rendered.indexOf('Tomato — Early blight'));
  });

  it('filters to the entries waiting for review', async () => {
    mockFetchKnowledge.mockResolvedValue(entries);
    await renderWithQuery(<DiseaseKnowledgeScreen {...makeProps().props} />);
    await screen.findByText('Apple — Apple scab');

    await fireEvent.press(screen.getByText('Pending'));

    expect(screen.getByText('Tomato — Early blight')).toBeTruthy();
    expect(screen.queryByText('Apple — Apple scab')).toBeNull();
  });

  it('says so when no entry matches the filter', async () => {
    mockFetchKnowledge.mockResolvedValue([entries[0]]);
    await renderWithQuery(<DiseaseKnowledgeScreen {...makeProps().props} />);
    await screen.findByText('Tomato — Early blight');

    await fireEvent.press(screen.getByText('Reviewed'));

    expect(await screen.findByText('No entry has been reviewed yet')).toBeTruthy();
  });

  it('opens an entry for editing', async () => {
    mockFetchKnowledge.mockResolvedValue(entries);
    const { props, navigate } = makeProps();
    await renderWithQuery(<DiseaseKnowledgeScreen {...props} />);

    await fireEvent.press(await screen.findByText('Tomato — Early blight'));

    expect(navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit, {
      classLabel: 'Tomato___Early_blight',
    });
  });
});
