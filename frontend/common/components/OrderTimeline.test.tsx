import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OrderTimeline } from './OrderTimeline';

// Each step is read as label, time (when reached) and state: "done", "current step" or "to come". Asserting the state,
// not only the label, is what lets these tests fail when a step is drawn in the wrong state.
describe('OrderTimeline', () => {
  it('marks the steps done, the current one, and the ones to come, with the time each was reached', async () => {
    await render(<OrderTimeline status="processing" reachedAt={{ pending: '26 Sept, 10:05 am', confirmed: '26 Sept, 11:20 am' }} />);
    expect(screen.getByLabelText('Order placed, 26 Sept, 10:05 am, done')).toBeTruthy();
    expect(screen.getByLabelText('Confirmed by seller, 26 Sept, 11:20 am, done')).toBeTruthy();
    expect(screen.getByLabelText('Being prepared, current step')).toBeTruthy();
    // The steps still to come are shown, so the buyer knows what happens next.
    expect(screen.getByLabelText('Ready for dispatch, to come')).toBeTruthy();
    expect(screen.getByLabelText('Completed, to come')).toBeTruthy();
  });

  it('makes each step one accessible stop and keeps the list a native view, so Android does not flatten the states away', async () => {
    await render(<OrderTimeline status="processing" />);
    expect(screen.getByLabelText('Being prepared, current step').props.accessible).toBe(true);
    expect(screen.getByLabelText('Order placed, done').props.accessible).toBe(true);
    // The list container itself is not a stop (it would read every step as one), so it is found as the rendered root.
    expect((screen.toJSON() as { props: { collapsable?: boolean } }).props.collapsable).toBe(false);
  });

  it('shows a completed order with every step done and none current', async () => {
    await render(<OrderTimeline status="completed" />);
    for (const label of ['Order placed', 'Confirmed by seller', 'Being prepared', 'Ready for dispatch', 'Completed']) {
      expect(screen.getByLabelText(`${label}, done`)).toBeTruthy();
    }
    expect(screen.queryByLabelText(/current step|to come/)).toBeNull();
  });

  it('ends a stopped order at its stop, after only the steps it reached', async () => {
    await render(<OrderTimeline status="rejected" reachedAt={{ pending: '26 Sept, 10:05 am', rejected: '26 Sept, 6:30 pm' }} />);
    expect(screen.getByLabelText('Order placed, 26 Sept, 10:05 am, done')).toBeTruthy();
    expect(screen.getByLabelText('Rejected by seller, 26 Sept, 6:30 pm')).toBeTruthy();
    expect(screen.queryByText('Confirmed by seller')).toBeNull();
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('shows a disputed order as fully done, then the open dispute as its current step', async () => {
    await render(<OrderTimeline status="disputed" reachedAt={{ pending: '26 Sept, 10:05 am', completed: '28 Sept, 4:00 pm', disputed: '29 Sept, 9:00 am' }} />);
    expect(screen.getByLabelText('Order placed, 26 Sept, 10:05 am, done')).toBeTruthy();
    for (const label of ['Confirmed by seller', 'Being prepared', 'Ready for dispatch']) {
      expect(screen.getByLabelText(`${label}, done`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Completed, 28 Sept, 4:00 pm, done')).toBeTruthy();
    expect(screen.getByLabelText('Dispute opened, 29 Sept, 9:00 am, current step')).toBeTruthy();
    expect(screen.queryByText('Refunded')).toBeNull();
  });

  it('shows a refunded order as fully done, then the past dispute and the refund, with nothing current', async () => {
    await render(<OrderTimeline status="refunded" />);
    for (const label of ['Order placed', 'Confirmed by seller', 'Being prepared', 'Ready for dispatch', 'Completed']) {
      expect(screen.getByLabelText(`${label}, done`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Dispute opened')).toBeTruthy();
    expect(screen.getByLabelText('Refunded')).toBeTruthy();
    expect(screen.queryByLabelText(/current step|to come/)).toBeNull();
  });

  it('shows a status this build does not know as the current step after the steps reached, never as not started', async () => {
    // D5 adds `dispatched` in A4; an installed A2 build must still read sensibly when the API sends it.
    await render(<OrderTimeline status={'dispatched' as never} reachedAt={{ pending: '26 Sept, 10:05 am', ready: '27 Sept, 9:15 am' }} />);
    expect(screen.getByLabelText('Order placed, 26 Sept, 10:05 am, done')).toBeTruthy();
    expect(screen.getByLabelText('Ready for dispatch, 27 Sept, 9:15 am, done')).toBeTruthy();
    expect(screen.getByLabelText('Dispatched, current step')).toBeTruthy();
    expect(screen.queryByLabelText(/to come/)).toBeNull();
    expect(screen.queryByText('Completed')).toBeNull();
    expect(screen.queryByText('Confirmed by seller')).toBeNull();
  });

  it.each([
    ['cancelled', 'Cancelled'],
    ['expired', 'Expired'],
    ['payment_failed', 'Payment failed'],
  ] as const)('names the %s stop', async (status, label) => {
    await render(<OrderTimeline status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
