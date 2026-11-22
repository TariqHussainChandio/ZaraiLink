import { NAME_CHARACTERS_MESSAGE, personNameSchema } from './personName';

const firstError = (value: string) => {
  const result = personNameSchema.safeParse(value);
  return result.success ? null : result.error.issues[0]?.message;
};

describe('personNameSchema (D20)', () => {
  it.each(['Muhammad Ali', 'Ayesha', 'محمد علی', 'Ali '])('accepts %p', value => {
    expect(firstError(value)).toBeNull();
  });

  it.each(['Ali 2', 'Ali@Khan', 'Ali-Khan', "O'Brien", 'Ali_', 'علی۲'])('refuses digits and symbols in %p', value => {
    expect(firstError(value)).toBe(NAME_CHARACTERS_MESSAGE);
  });

  it('refuses two spaces between names', () => {
    expect(firstError('Muhammad  Ali')).toBe('Use a single space between names');
  });

  it('asks for a name when there is none', () => {
    expect(firstError('')).toBe('Enter your full name');
    expect(firstError('A')).toBe('Enter your full name');
  });
});
