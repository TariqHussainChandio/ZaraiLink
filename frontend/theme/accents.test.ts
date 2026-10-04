import { lightColors } from './colors';

// SRDS §44: the role and module accents, exactly as the SRDS gives them. They are the light theme's marks; the dark
// theme lightens each one so it keeps its contrast on the dark ground (contrast.test.ts checks those pairs).
describe('SRDS §44 accents', () => {
  it.each([
    ['buyer', '#1976D2'],
    ['farmer', '#2E7D32'],
    ['dealer', '#EF6C00'],
    ['expert', '#7B1FA2'],
    ['admin', '#374151'],
  ] as const)('marks the %s role in %s', (role, hex) => {
    expect(lightColors.accent[role].mark).toBe(hex);
  });

  it.each([
    ['marketplace', '#2E7D32'],
    ['dealer', '#EF6C00'],
    ['orders', '#1976D2'],
    ['expert', '#7B1FA2'],
    ['ai', '#00897B'],
    ['payments', '#43A047'],
    ['notifications', '#F9A825'],
  ] as const)('marks the %s module in %s', (module, hex) => {
    expect(lightColors.module[module]).toBe(hex);
  });
});
