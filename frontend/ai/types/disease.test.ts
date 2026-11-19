import { confidenceLevel } from './disease';

describe('confidenceLevel', () => {
  it.each([
    [0.95, 'confident', 'high'],
    [0.85, 'confident', 'high'],
    [0.7, 'confident', 'medium'],
    [0.6, 'confident', 'medium'],
    [0.59, 'low', 'low'],
  ] as const)('reads %s (%s band) as %s', (score, band, level) => {
    expect(confidenceLevel({ confidence_score: score, confidence_band: band })).toBe(level);
  });

  it("takes 'not sure' from the backend band, never from the app's own threshold", () => {
    expect(confidenceLevel({ confidence_score: 0.9, confidence_band: 'low' })).toBe('low');
  });
});
