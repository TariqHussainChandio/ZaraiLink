import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DocumentViewerScreen } from './DocumentViewerScreen';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';

function renderViewer() {
  return renderWithQuery(
    <DocumentViewerScreen
      navigation={{} as never}
      route={{ key: 'k', name: ADMIN_HOME_ROUTES.DocumentViewer, params: { url: 'https://signed/doc', title: 'certificate.jpg' } }}
    />,
  );
}

describe('DocumentViewerScreen', () => {
  it('shows the photographed document from its signed link', async () => {
    await renderViewer();
    const image = screen.getByLabelText('certificate.jpg');
    expect(image.props.source).toEqual({ uri: 'https://signed/doc' });
  });

  it('says when the link no longer opens', async () => {
    await renderViewer();
    await fireEvent(screen.getByLabelText('certificate.jpg'), 'error');
    expect(screen.getByText('Could not open this document')).toBeTruthy();
  });
});
