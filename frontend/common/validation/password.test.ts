import { newPasswordSchema, PASSWORD_HELPER } from './password';

describe('newPasswordSchema (supabase/config.toml: 8 characters, letters and digits)', () => {
  it.each(['secret123', 'Abcdefg1', '12345678a'])('accepts %s', value => {
    expect(newPasswordSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['too short', 'abc123'],
    ['no number', 'abcdefgh'],
    ['no letter', '12345678'],
  ])('refuses a password with %s, saying the rule', (_why, value) => {
    const result = newPasswordSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(PASSWORD_HELPER);
  });
});
