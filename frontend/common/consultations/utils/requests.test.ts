import { isActiveStatus, isClosedStatus, sortRequests } from './requests';

describe('sortRequests', () => {
  it('puts high priority first and the longest-waiting first within a priority', () => {
    const sorted = sortRequests([
      { id: 'a', priority: 'low', created_at: '2026-11-01T10:00:00Z' },
      { id: 'b', priority: 'high', created_at: '2026-11-03T10:00:00Z' },
      { id: 'c', priority: 'high', created_at: '2026-11-02T10:00:00Z' },
      { id: 'd', priority: 'medium', created_at: '2026-11-01T10:00:00Z' },
    ]);
    expect(sorted.map(r => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('does not change the list it was given', () => {
    const input = [
      { priority: 'low' as const, created_at: '2026-11-01T10:00:00Z' },
      { priority: 'high' as const, created_at: '2026-11-01T10:00:00Z' },
    ];
    sortRequests(input);
    expect(input[0]?.priority).toBe('low');
  });
});

describe('status groups', () => {
  it('splits active from finished and closed', () => {
    expect(isActiveStatus('in_progress')).toBe(true);
    expect(isActiveStatus('resolved')).toBe(false);
    expect(isClosedStatus('closed')).toBe(true);
    expect(isClosedStatus('resolved')).toBe(false);
  });
});
