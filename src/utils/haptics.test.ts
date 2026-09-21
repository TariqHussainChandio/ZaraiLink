import * as Haptics from 'expo-haptics';
import { hapticSuccess, hapticTap } from './haptics';

const mockPerform = Haptics.performAndroidHapticsAsync as jest.Mock;

// Lets already-settled promises run their handlers before the test checks the result.
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  mockPerform.mockReset().mockResolvedValue(undefined);
});

describe('hapticTap', () => {
  it('plays a light context click', () => {
    hapticTap();

    expect(mockPerform).toHaveBeenCalledWith(Haptics.AndroidHaptics.Context_Click);
  });

  it('does not surface an error when the device refuses haptics', async () => {
    mockPerform.mockRejectedValue(new Error('no haptic hardware'));

    expect(() => hapticTap()).not.toThrow();
    // Let the rejected promise settle; an unhandled rejection would fail the test run.
    await flushPromises();
  });
});

describe('hapticSuccess', () => {
  it('plays the confirm haptic', () => {
    hapticSuccess();

    expect(mockPerform).toHaveBeenCalledWith(Haptics.AndroidHaptics.Confirm);
    expect(mockPerform).toHaveBeenCalledTimes(1);
  });

  it('falls back to the light tap on Android versions that reject confirm', async () => {
    mockPerform.mockImplementation((type: string) =>
      type === Haptics.AndroidHaptics.Confirm ? Promise.reject(new Error('unsupported')) : Promise.resolve(),
    );

    hapticSuccess();
    await flushPromises();

    expect(mockPerform).toHaveBeenNthCalledWith(1, Haptics.AndroidHaptics.Confirm);
    expect(mockPerform).toHaveBeenNthCalledWith(2, Haptics.AndroidHaptics.Context_Click);
  });
});
