import React from 'react';
import { Linking } from 'react-native';
import { getCameraPermissionsAsync } from 'expo-image-picker';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../testUtils/renderWithProviders';
import { DocumentsStep } from './DocumentsStep';
import {
  attachDocument,
  fetchApplicationDocuments,
  fetchRequiredDocuments,
  removeDocument,
} from '../../services/applicationService';
import { pickApplicationDocument } from '../../../../utils/documentPicker';

jest.mock('expo-image-picker', () => ({ getCameraPermissionsAsync: jest.fn() }));
jest.mock('../../services/applicationService', () => ({
  attachDocument: jest.fn(),
  fetchApplicationDocuments: jest.fn(),
  fetchRequiredDocuments: jest.fn(),
  removeDocument: jest.fn(),
}));
jest.mock('../../../../utils/documentPicker', () => ({
  ...jest.requireActual('../../../../utils/documentPicker'),
  pickApplicationDocument: jest.fn(),
}));

const mockPermission = getCameraPermissionsAsync as jest.Mock;

const required = [
  { id: 'req-reg', role: 'dealer', code: 'business_registration', label: 'Registration certificate', description: null, is_required: true, active: true, sort_order: 10 },
  { id: 'req-cnic', role: 'dealer', code: 'cnic', label: 'CNIC front', description: null, is_required: true, active: true, sort_order: 20 },
  { id: 'req-shop', role: 'dealer', code: 'shop', label: 'Shop photo', description: null, is_required: false, active: true, sort_order: 30 },
];
const added = {
  id: 'doc-1',
  required_document_id: 'req-reg',
  file_name: 'cert.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1_200_000,
  created_at: '2026-10-12T08:00:00Z',
  required_document: null,
};
const orphan = { ...added, id: 'doc-old', required_document_id: null, file_name: 'old-licence.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
  (fetchRequiredDocuments as jest.Mock).mockResolvedValue(required);
  (fetchApplicationDocuments as jest.Mock).mockResolvedValue([added]);
});

describe('DocumentsStep (D2, AU-16)', () => {
  it('counts the required documents added and names each one with a document status', async () => {
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);

    expect(await screen.findByText('1 of 2 required documents added')).toBeTruthy();
    expect(screen.getByText('Added')).toBeTruthy();
    expect(screen.getByText('Needed')).toBeTruthy();
    expect(screen.getByText('Optional')).toBeTruthy();
  });

  it('shows an upload error inside the card of the document it was for, not at the bottom of the list', async () => {
    (pickApplicationDocument as jest.Mock).mockResolvedValue({ uri: 'file:///c.pdf', mimeType: 'application/pdf', fileName: 'c.pdf', sizeBytes: 100 });
    (attachDocument as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);
    await screen.findByText('1 of 2 required documents added');

    // The CNIC card is the first "Add photo or PDF": the certificate already has a file, so its button says "Add another file".
    const [cnicButton] = screen.getAllByText('Add photo or PDF');
    if (!cnicButton) throw new Error('no add button');
    await fireEvent.press(cnicButton);

    expect(await screen.findByText("Couldn't add the file")).toBeTruthy();
    expect(screen.getByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.getAllByText("Couldn't add the file")).toHaveLength(1);
  });

  it('asks before removing a file, and keeps it when the person goes back', async () => {
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);
    await fireEvent.press(await screen.findByLabelText('Remove cert.pdf'));

    expect(await screen.findByText('Remove this file?')).toBeTruthy();
    expect(removeDocument).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep file' }));
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it('shows the reason inside the sheet when removing fails, and keeps it open', async () => {
    (removeDocument as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);
    await fireEvent.press(await screen.findByLabelText('Remove cert.pdf'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove file' }));

    expect(await screen.findByText('No connection. Check your internet, then try again.')).toBeTruthy();
    expect(screen.getByText('Remove this file?')).toBeTruthy();
  });

  it('explains what "Other files" are instead of calling them "Earlier documents"', async () => {
    (fetchApplicationDocuments as jest.Mock).mockResolvedValue([added, orphan]);
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);

    expect(await screen.findByText('Other files')).toBeTruthy();
    expect(screen.getByText(/not tied to a document on the list above/)).toBeTruthy();
    expect(screen.getByText('old-licence.pdf')).toBeTruthy();
    expect(screen.queryByText('Earlier documents')).toBeNull();
  });

  it('tells the person the camera is off, and opens the settings, after Android stopped asking (AU-16)', async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);

    expect(await screen.findByText('The camera is turned off')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it('says nothing about the camera when it was merely never asked', async () => {
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable />);
    await screen.findByText('1 of 2 required documents added');
    expect(screen.queryByText('The camera is turned off')).toBeNull();
  });

  it('shows the files and nothing to change while the application is under review', async () => {
    await renderWithQuery(<DocumentsStep role="dealer" userId="user-1" editable={false} />);

    expect(await screen.findByText('cert.pdf')).toBeTruthy();
    expect(screen.queryByText('Add photo or PDF')).toBeNull();
    expect(screen.queryByLabelText('Remove cert.pdf')).toBeNull();
    expect(screen.queryByText(/required documents added/)).toBeNull();
    await waitFor(() => expect(mockPermission).not.toHaveBeenCalled());
  });
});
