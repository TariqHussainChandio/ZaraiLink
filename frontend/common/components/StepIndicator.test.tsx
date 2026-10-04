import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { StepIndicator } from './StepIndicator';

describe('StepIndicator', () => {
  it('reads each step with its place and state, not only its colour', async () => {
    await renderWithProviders(<StepIndicator steps={['Account', 'Business', 'Documents', 'Review']} current={2} />);
    expect(screen.getByLabelText('Step 1 of 4, Account, done')).toBeTruthy();
    expect(screen.getByLabelText('Step 2 of 4, Business, done')).toBeTruthy();
    expect(screen.getByLabelText('Step 3 of 4, Documents, current step')).toBeTruthy();
    expect(screen.getByLabelText('Step 4 of 4, Review, to come')).toBeTruthy();
  });

  it('numbers the steps not yet done', async () => {
    await renderWithProviders(<StepIndicator steps={['Account', 'Business']} current={1} />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });
});
