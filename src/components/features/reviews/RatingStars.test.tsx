import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RatingStars } from './RatingStars';

describe('RatingStars — read-only (no onChange)', () => {
  it('exposes the rounded rating as an accessibility label', async () => {
    await render(<RatingStars value={4.2} />);
    expect(screen.getByLabelText('4 out of 5 stars')).toBeTruthy();
  });

  it('rounds to the nearest star for the label', async () => {
    await render(<RatingStars value={4.6} />);
    expect(screen.getByLabelText('5 out of 5 stars')).toBeTruthy();
  });

  it('renders no pressable stars', async () => {
    await render(<RatingStars value={3} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('RatingStars — interactive (picker)', () => {
  it('renders 5 pressable stars', async () => {
    await render(<RatingStars value={0} onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('calls onChange with the tapped star number', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={0} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('uses singular wording for the 1-star label', async () => {
    await render(<RatingStars value={0} onChange={() => {}} />);
    expect(screen.getByLabelText('Rate 1 star')).toBeTruthy();
  });

  it('marks stars at or below the current value as selected', async () => {
    await render(<RatingStars value={3} onChange={() => {}} />);
    expect(screen.getByLabelText('Rate 3 stars').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Rate 4 stars').props.accessibilityState).toMatchObject({ selected: false });
  });
});
