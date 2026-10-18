import { act, renderHook } from '@testing-library/react-native';
import { useUtcDay } from './utcDay';

// B5 verification: a report left open past UTC midnight kept yesterday as its "to". The day must move at UTC midnight.

afterEach(() => jest.useRealTimers());

describe('useUtcDay', () => {
  it('moves to the new day at UTC midnight, and again the night after', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-18T23:59:50Z') });
    const { result } = await renderHook(() => useUtcDay());
    expect(result.current).toBe('2026-10-18');

    await act(async () => jest.advanceTimersByTime(9_000));
    expect(result.current).toBe('2026-10-18');

    await act(async () => jest.advanceTimersByTime(2_000));
    expect(result.current).toBe('2026-10-19');

    await act(async () => jest.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current).toBe('2026-10-20');
  });

  it('is the UTC date, not the local one (05:00 in Karachi is still yesterday on the server)', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-31T23:30:00Z') });
    const { result } = await renderHook(() => useUtcDay());
    expect(result.current).toBe('2026-10-31');
  });
});
