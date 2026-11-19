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

  it('is one accessible image, so Android does not flatten its label away (MK-23)', async () => {
    await render(<RatingStars value={3} />);
    const stars = screen.getByRole('image');
    expect(stars.props.accessible).toBe(true);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('RatingStars — interactive (picker)', () => {
  it('is one adjustable control, not five buttons TalkBack must step through', async () => {
    await render(<RatingStars value={0} onChange={() => {}} />);
    expect(screen.getByRole('adjustable', { name: 'Your rating' })).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('calls onChange with the tapped star number', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={0} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('rating-star-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('says "Not rated" until a rating is chosen, then the number', async () => {
    const { rerender } = await render(<RatingStars value={0} onChange={() => {}} />);
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({ text: 'Not rated' });
    await rerender(<RatingStars value={3} onChange={() => {}} />);
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({ now: 3, text: '3 out of 5 stars' });
  });

  it('moves one star per TalkBack swipe', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={4} onChange={onChange} />);
    const control = screen.getByRole('adjustable');
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('starts a swipe from nothing at one star, and never goes below it', async () => {
    const onChange = jest.fn();
    await render(<RatingStars value={0} onChange={onChange} />);
    const control = screen.getByRole('adjustable');
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(1);
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
