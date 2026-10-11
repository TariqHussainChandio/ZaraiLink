import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseKnowledgeEditScreen } from './DiseaseKnowledgeEditScreen';
import {
  fetchDiseaseKnowledgeEntry,
  reviewDiseaseKnowledge,
  updateDiseaseKnowledge,
} from '../services/adminService';
import type { DiseaseKnowledgeEntry } from '../types/ai';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

jest.mock('../services/adminService', () => ({
  fetchDiseaseKnowledgeEntry: jest.fn(),
  reviewDiseaseKnowledge: jest.fn(),
  updateDiseaseKnowledge: jest.fn(),
}));

const mockFetchEntry = fetchDiseaseKnowledgeEntry as jest.Mock;
const mockReview = reviewDiseaseKnowledge as jest.Mock;
const mockUpdate = updateDiseaseKnowledge as jest.Mock;

const LABEL = 'Tomato___Early_blight';

const entry = (overrides: Partial<DiseaseKnowledgeEntry> = {}): DiseaseKnowledgeEntry => ({
  class_label: LABEL,
  crop: 'Tomato',
  disease: 'Early blight',
  is_healthy: false,
  symptoms: ['Brown rings'],
  treatment: ['Copper spray'],
  precautions: [],
  advisory: 'Remove affected leaves.',
  review_status: 'pending_review',
  reviewed_by: null,
  reviewed_at: null,
  updated_at: '2026-10-01T00:00:00+00:00',
  ...overrides,
});

const props = {
  navigation: { navigate: jest.fn() },
  route: { params: { classLabel: LABEL } },
} as unknown as AdminScreenProps<typeof ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit>;

beforeEach(() => {
  mockFetchEntry.mockReset();
  mockReview.mockReset();
  mockUpdate.mockReset();
});

describe('DiseaseKnowledgeEditScreen', () => {
  it('loads the entry into the form', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);

    expect(await screen.findByText(LABEL)).toBeTruthy();
    expect(mockFetchEntry).toHaveBeenCalledWith(LABEL);
    expect(screen.getByLabelText('Crop').props.value).toBe('Tomato');
    expect(screen.getByLabelText('Symptoms').props.value).toBe('Brown rings');
    expect(screen.getByText('Pending agronomist review')).toBeTruthy();
  });

  it('sends only the changed fields, one list item per line', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    mockUpdate.mockResolvedValue(entry({ symptoms: ['Brown rings', 'Yellow halo'] }));
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);
    await screen.findByText(LABEL);

    await fireEvent.changeText(screen.getByLabelText('Symptoms'), 'Brown rings\n\n  Yellow halo  ');
    await fireEvent.press(screen.getByText('Save'));

    expect(mockUpdate).toHaveBeenCalledWith(LABEL, { symptoms: ['Brown rings', 'Yellow halo'] });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('warns that saving a reviewed entry sends it back to review', async () => {
    mockFetchEntry.mockResolvedValue(entry({ review_status: 'reviewed', reviewed_by: 'a1', reviewed_at: '2026-10-05T00:00:00Z' }));
    mockUpdate.mockResolvedValue(entry({ advisory: 'New advice.' }));
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);

    expect(await screen.findByText('Saving a change sends this entry back to pending review.')).toBeTruthy();
    // A reviewed entry has nothing left to sign off.
    expect(screen.queryByText('Mark reviewed')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Advice for farmers'), 'New advice.');
    await fireEvent.press(screen.getByText('Save'));

    expect(mockUpdate).toHaveBeenCalledWith(LABEL, { advisory: 'New advice.' });
    expect(await screen.findByText('Saved. The entry is back to pending review.')).toBeTruthy();
  });

  it('refuses blank required text before calling the server', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);
    await screen.findByText(LABEL);

    await fireEvent.changeText(screen.getByLabelText('Advice for farmers'), '   ');
    await fireEvent.press(screen.getByText('Save'));

    expect(await screen.findByText('Write the advice farmers read')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('marks a pending entry reviewed after confirmation', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    mockReview.mockResolvedValue(entry({ review_status: 'reviewed', reviewed_by: 'a1', reviewed_at: '2026-10-11T00:00:00Z' }));
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);
    await screen.findByText(LABEL);

    await fireEvent.press(screen.getByText('Mark reviewed'));
    expect(mockReview).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Confirm review'));

    expect(mockReview).toHaveBeenCalledWith(LABEL);
    expect(await screen.findByText('Marked reviewed')).toBeTruthy();
  });

  it('asks to save unsaved edits before a review', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);
    await screen.findByText(LABEL);

    await fireEvent.changeText(screen.getByLabelText('Crop'), 'Tomatoes');

    expect(screen.getByText('Save your changes before marking the entry reviewed.')).toBeTruthy();
  });

  it('keeps a refusal from the server on screen', async () => {
    mockFetchEntry.mockResolvedValue(entry());
    mockReview.mockRejectedValue(new Error('This action requires a verified second factor (MFA).'));
    await renderWithQuery(<DiseaseKnowledgeEditScreen {...props} />);
    await screen.findByText(LABEL);

    await fireEvent.press(screen.getByText('Mark reviewed'));
    await fireEvent.press(screen.getByText('Confirm review'));

    expect(await screen.findByText(/second factor/)).toBeTruthy();
  });
});
