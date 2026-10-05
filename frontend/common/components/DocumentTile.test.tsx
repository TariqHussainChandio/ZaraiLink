import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { DocumentTile } from './DocumentTile';

describe('DocumentTile', () => {
  it('names a PDF and its size', async () => {
    await renderWithProviders(<DocumentTile fileName="licence.pdf" mimeType="application/pdf" sizeBytes={2.5 * 1024 * 1024} />);
    expect(screen.getByText('licence.pdf')).toBeTruthy();
    expect(screen.getByText('PDF · 2.5 MB')).toBeTruthy();
  });

  it('names a photo, a small size in KB, and offers its actions by name', async () => {
    const onView = jest.fn();
    const onRemove = jest.fn();
    await renderWithProviders(
      <DocumentTile fileName="degree.jpg" mimeType="image/jpeg" sizeBytes={2048} onView={onView} onRemove={onRemove} />,
    );
    expect(screen.getByText('Photo · 2 KB')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('View degree.jpg'));
    await fireEvent.press(screen.getByLabelText('Remove degree.jpg'));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows no actions it was not given, and says when it is busy', async () => {
    await renderWithProviders(<DocumentTile fileName="old.pdf" busy />);
    expect(screen.queryByText('View')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.getByText('File · Working…')).toBeTruthy();
  });
});
