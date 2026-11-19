import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DocumentViewer } from './DocumentViewer';
import { resolveDealerDocumentUrl } from '../services/adminService';

jest.mock('../services/adminService', () => ({ resolveDealerDocumentUrl: jest.fn() }));
jest.mock('../../expert/services/expertService', () => ({ resolveExpertDocumentUrl: jest.fn() }));

const mockResolve = resolveDealerDocumentUrl as jest.Mock;

const documents = [
  { id: 'a', label: 'CNIC front' },
  { id: 'b', label: 'CNIC back' },
];

function renderViewer(startId?: string) {
  return renderWithQuery(
    <DocumentViewer visible onClose={jest.fn()} role="dealer" applicantId="dealer-1" documents={documents} startId={startId} />,
  );
}

beforeEach(() => {
  mockResolve.mockReset();
});

describe('DocumentViewer (AD-06)', () => {
  it('asks for a fresh link to every photo and shows the one that was tapped, titled by its requirement', async () => {
    mockResolve.mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await renderViewer('b');

    expect(await screen.findByLabelText('CNIC back')).toBeTruthy();
    expect(mockResolve).toHaveBeenCalledWith('dealer-1', 'a');
    expect(mockResolve).toHaveBeenCalledWith('dealer-1', 'b');
    // Pinch zoom lives in the shared PhotoViewer; with two photos it also offers next and previous.
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Previous photo')).toBeTruthy();
  });

  it('moves between the photos', async () => {
    mockResolve.mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await renderViewer('a');
    await screen.findByLabelText('CNIC front');

    await fireEvent.press(screen.getByLabelText('Next photo'));

    expect(await screen.findByLabelText('CNIC back')).toBeTruthy();
  });

  it('offers "Get a new link" when the links cannot be had, and recovers', async () => {
    mockResolve.mockRejectedValue(new Error('expired'));
    await renderViewer();
    expect(await screen.findByText("Couldn't open the documents")).toBeTruthy();

    mockResolve.mockImplementation((_d: string, id: string) => Promise.resolve(`https://signed/${id}`));
    await fireEvent.press(screen.getByRole('button', { name: 'Get a new link' }));

    expect(await screen.findByLabelText('CNIC front')).toBeTruthy();
  });

  it('still shows the photos that did open when one cannot', async () => {
    mockResolve.mockImplementation((_d: string, id: string) => (id === 'a' ? Promise.reject(new Error('gone')) : Promise.resolve(`https://signed/${id}`)));
    await renderViewer('a');

    expect(await screen.findByLabelText('CNIC back')).toBeTruthy();
  });
});
