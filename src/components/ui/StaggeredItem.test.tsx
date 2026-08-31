import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { StaggeredItem } from './StaggeredItem';

describe('StaggeredItem', () => {
  it('renders its children', async () => {
    await render(
      <StaggeredItem index={0}>
        <Text>Item content</Text>
      </StaggeredItem>,
    );
    expect(screen.getByText('Item content')).toBeTruthy();
  });

  it('renders regardless of index', async () => {
    await render(
      <StaggeredItem index={20}>
        <Text>Far down the list</Text>
      </StaggeredItem>,
    );
    expect(screen.getByText('Far down the list')).toBeTruthy();
  });
});
