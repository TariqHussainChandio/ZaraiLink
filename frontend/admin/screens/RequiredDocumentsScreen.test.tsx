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

  it('says the load failed, and retries, instead of an empty list (AD-11)', async () => {
    (fetchAllRequiredDocuments as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<RequiredDocumentsScreen />);
    expect(await screen.findByText("Couldn't load the document list")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Business licence')).toBeTruthy();
  });

  it('adds a document with a stable code made from its name', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add a document' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save document' }));
    expect(screen.getByText('Name the document')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Tax (NTN) certificate');
    await fireEvent.press(screen.getByRole('button', { name: 'Optional' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save document' }));
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

  it('retires a document only after the consequence is stated, and offers Undo (AD-04)', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByText('Business licence'));
    await fireEvent.press(await screen.findByText('Retire Business licence'));
    expect(await screen.findByText('Retire Business licence?')).toBeTruthy();
    expect(screen.getByText(/Documents already sent stay on their applications/)).toBeTruthy();
    expect(updateRequiredDocument).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Retire Business licence' }));
    expect(updateRequiredDocument).toHaveBeenCalledWith('d1', { active: false });
    expect(await screen.findByText('Business licence retired')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(updateRequiredDocument).toHaveBeenLastCalledWith('d1', { active: true });
  });

  it('brings a retired document back, never deleting', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByText('Old certificate'));
    await fireEvent.press(await screen.findByText('Ask for Old certificate again'));
    await fireEvent.press(screen.getByRole('button', { name: 'Ask for Old certificate again' }));
    expect(updateRequiredDocument).toHaveBeenCalledWith('d2', { active: true });
  });

  it('edits a label', async () => {
    await renderWithQuery(<RequiredDocumentsScreen />);
    await fireEvent.press(await screen.findByText('Business licence'));
    await fireEvent.press(await screen.findByText('Edit document'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Trade licence');
    await fireEvent.press(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() =>
      expect(updateRequiredDocument).toHaveBeenCalledWith('d1', { label: 'Trade licence', description: 'Your trade licence.', is_required: true }),
    );
  });
});
