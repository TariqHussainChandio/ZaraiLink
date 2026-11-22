import { formatArea, growthStageOptions, isValidArea, isValidDate, parseArea } from './forms';

describe('area', () => {
  it('accepts digits with one decimal point and an empty box', () => {
    expect(isValidArea('')).toBe(true);
    expect(isValidArea('2')).toBe(true);
    expect(isValidArea('2.5')).toBe(true);
    expect(parseArea('2.5')).toBe(2.5);
    expect(parseArea('  ')).toBeNull();
  });

  it('refuses a comma, letters and zero instead of saving nothing', () => {
    expect(isValidArea('2,5')).toBe(false);
    expect(isValidArea('1,200')).toBe(false);
    expect(isValidArea('two')).toBe(false);
    expect(isValidArea('0')).toBe(false);
  });
});

describe('dates', () => {
  it('accepts a real calendar day and an empty box', () => {
    expect(isValidDate('')).toBe(true);
    expect(isValidDate('2026-03-14')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
  });

  it('refuses a wrong format and a day that does not exist', () => {
    expect(isValidDate('14-03-2026')).toBe(false);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
  });
});

describe('growthStageOptions', () => {
  it('lists the stages', () => {
    expect(growthStageOptions('').map(o => o.value)).toContain('Flowering');
  });

  it('keeps a stage saved before the list existed', () => {
    expect(growthStageOptions('Tillering')[0]).toEqual({ value: 'Tillering', label: 'Tillering' });
  });
});

describe('formatArea', () => {
  const units = [{ code: 'acre', label: 'Acre' }];

  it('reads the unit by its label', () => {
    expect(formatArea(10, 'acre', units)).toBe('10 Acre');
  });

  it('falls back to the saved code and to no unit', () => {
    expect(formatArea(2.5, 'kanal', units)).toBe('2.5 kanal');
    expect(formatArea(3, null, units)).toBe('3');
  });

  it('is null when no area is recorded', () => {
    expect(formatArea(null, 'acre', units)).toBeNull();
  });
});
