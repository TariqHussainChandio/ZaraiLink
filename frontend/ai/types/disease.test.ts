import { confidenceLevel, splitPredictedDisease } from './disease';

describe('confidenceLevel', () => {
  it.each([
    [0.95, 'high'],
    [0.85, 'high'],
    [0.7, 'medium'],
    [0.6, 'medium'],
    [0.59, 'low'],
  ])('reads %s as %s', (score, level) => {
    expect(confidenceLevel(score)).toBe(level);
  });
});

describe('splitPredictedDisease', () => {
  it('splits the stored label into crop and condition', () => {
    expect(splitPredictedDisease('Tomato — Late blight')).toEqual({ crop: 'Tomato', condition: 'Late blight' });
  });
  it('names a healthy leaf plainly', () => {
    expect(splitPredictedDisease('Maize — Healthy')).toEqual({ crop: 'Maize', condition: 'Healthy leaf' });
  });
  it('keeps a label with no crop part', () => {
    expect(splitPredictedDisease('Unknown')).toEqual({ crop: null, condition: 'Unknown' });
  });
});
