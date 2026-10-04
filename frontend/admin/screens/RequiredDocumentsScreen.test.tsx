import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { RequiredDocumentsScreen } from './RequiredDocumentsScreen';
import { createRequiredDocument, fetchAllRequiredDocuments, updateRequiredDocument } from '../services/adminService';

jest.mock('../services/adminService', () => ({
  fetchAllRequiredDocuments: jest.fn(),
  createRequiredDocument: jest.fn(),
  updateRequiredDocument: jest.fn(),
}));

const rows = [
  { id: 'd1', role: 'dealer', code: 'business_licence', label: 'Business licence', description: 'Your trade licence.', is_required: true, active: true, sort_order: 20 },
  { id: 'd2', role: 'dealer', code: 'old', label: 'Old certificate', description: null, is_required: true, active: false, sort_order: 30 },
  { id: 'e1', role: 'expert', code: 'degree', label: 'Degree certificate', description: null, is_required: true, active: true, sort_order: 10 },
];

function first<T>(items: T[]): T {
  const [item] = items;
  if (!item) throw new Error('nothing found');
  return item;
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchAllRequiredDocuments as jest.Mock).mockResolvedValue(rows);
  (createRequiredDocument as jest.Mock).mockResolvedValue({});
  (updateRequiredDocument as jest.Mock).mockResolvedValue({});
});

describe('RequiredDocumentsScreen (SRDS §7: configurable)', () => {
  it('lists each role’s documents, retired ones marked', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    expect(await screen.findByText('Business licence')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.queryByText('Degree certificate')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Experts' }));
    expect(screen.getByText('Degree certificate')).toBeTruthy();
  });

  it('adds a document with a stable code made from its name', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByText('Add a document'));
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Name the document')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Tax (NTN) certificate');
    await fireEvent.press(screen.getByRole('button', { name: 'Optional' }));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(createRequiredDocument).toHaveBeenCalledWith({
        role: 'dealer',
        code: 'tax_ntn_certificate',
        label: 'Tax (NTN) certificate',
        description: null,
        is_required: false,
        sort_order: 40,
      }),
    );
  });

  it('retires a document and brings a retired one back, never deleting', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByText('Retire'));
    expect(updateRequiredDocument).toHaveBeenCalledWith('d1', { active: false });
    await fireEvent.press(screen.getByText('Use again'));
    expect(updateRequiredDocument).toHaveBeenCalledWith('d2', { active: true });
  });

  it('edits a label', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(first(await screen.findAllByText('Edit')));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Trade licence');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(updateRequiredDocument).toHaveBeenCalledWith('d1', { label: 'Trade licence', description: 'Your trade licence.', is_required: true }),
    );
  });
});
