import { act, renderHook } from '@testing-library/react-native';
import { useEntryKey } from './entryKey';

// B4 verification F2: the key belongs to the form entry. It holds through re-renders (a retry, an edited field) and
// changes only when the screen renews it after a confirmed save, or when a new form opens.
describe('useEntryKey', () => {
  it('keeps one key across re-renders and renews it on demand', async () => {
    const { result, rerender } = await renderHook(() => useEntryKey());
    const first = result.current.key;
    expect(first).toMatch(/^zl-[0-9a-f-]{36}$/);
    await rerender({});
    expect(result.current.key).toBe(first);
    await act(async () => result.current.renew());
    expect(result.current.key).not.toBe(first);
  });

  it('gives each newly opened form its own key', async () => {
    const one = await renderHook(() => useEntryKey());
    const two = await renderHook(() => useEntryKey());
    expect(one.result.current.key).not.toBe(two.result.current.key);
  });
});
