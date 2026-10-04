import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Banner } from './Banner';

describe('Banner', () => {
  it('shows its title and message', async () => {
    await render(<Banner tone="warning" title="Your application is under review">We usually decide within 2 working days.</Banner>);
    expect(screen.getByText('Your application is under review')).toBeTruthy();
    expect(screen.getByText('We usually decide within 2 working days.')).toBeTruthy();
  });

  it('announces a failure as an alert and anything else as a summary', async () => {
    await render(<Banner tone="danger" title="Payment failed" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    await render(<Banner tone="success" title="Order placed" />);
    expect(screen.getByRole('summary')).toBeTruthy();
  });

  it('offers its action only when it has both a label and a handler', async () => {
    const onAction = jest.fn();
    await render(<Banner tone="danger" title="Payment failed" actionLabel="Try again" onAction={onAction} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onAction).toHaveBeenCalledTimes(1);

    await render(<Banner tone="danger" title="Payment failed" actionLabel="Try again" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps an AI advisory on screen and leads it to an expert (BR-13)', async () => {
    await render(
      <Banner tone="advisory" title="This is a likely match, not a diagnosis" actionLabel="Talk to an expert" onAction={() => undefined}>
        Ask a verified expert before you spray.
      </Banner>,
    );
    expect(screen.getByRole('button', { name: 'Talk to an expert' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /close|dismiss/i })).toBeNull();
  });
});
