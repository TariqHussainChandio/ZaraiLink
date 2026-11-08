import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { collectErrorMessages, FormErrorSummary } from './FormErrorSummary';

const errors = {
  email: { type: 'invalid', message: 'Enter a valid email', ref: { name: 'email' } },
  address: { city: { type: 'too_small', message: 'Enter your city' }, street: { type: 'too_small', message: 'Enter your city' } },
  password: { type: 'too_small', message: 'Use at least 8 characters, with letters and numbers' },
};

describe('FormErrorSummary', () => {
  it('lists every message once, in field order, including nested fields', () => {
    expect(collectErrorMessages(errors)).toEqual([
      'Enter a valid email',
      'Enter your city',
      'Use at least 8 characters, with letters and numbers',
    ]);
  });

  it('says nothing before the first attempt: a fresh form does not open already scolding', async () => {
    await render(<FormErrorSummary errors={errors} submitted={false} />);
    expect(screen.queryByText(/Fix/)).toBeNull();
  });

  it('counts what is wrong above the button after an attempt', async () => {
    await render(<FormErrorSummary errors={errors} submitted />);
    expect(screen.getByText('Fix these 3 things to continue')).toBeTruthy();
    expect(screen.getByText(/Enter a valid email/)).toBeTruthy();
  });

  it('adds messages from controls that live outside the form state, such as a chip group', async () => {
    await render(<FormErrorSummary errors={{}} submitted extra={['Choose at least one specialization', undefined]} />);
    expect(screen.getByText('Fix this to continue')).toBeTruthy();
    expect(screen.getByText('Choose at least one specialization')).toBeTruthy();
  });

  it('renders nothing when the form is fine', async () => {
    await render(<FormErrorSummary errors={{}} submitted />);
    expect(screen.queryByText(/Fix/)).toBeNull();
  });
});
