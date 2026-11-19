import { greetingFor } from './greeting';

describe('greetingFor', () => {
  it('greets by the part of the day', () => {
    expect(greetingFor('Ali', new Date(2026, 9, 19, 8))).toBe('Good morning, Ali');
    expect(greetingFor('Ali', new Date(2026, 9, 19, 13))).toBe('Good afternoon, Ali');
    expect(greetingFor('Ali', new Date(2026, 9, 19, 20))).toBe('Good evening, Ali');
  });

  it('greets without a name when none is known', () => {
    expect(greetingFor(null, new Date(2026, 9, 19, 8))).toBe('Good morning');
    expect(greetingFor('  ', new Date(2026, 9, 19, 8))).toBe('Good morning');
  });
});
