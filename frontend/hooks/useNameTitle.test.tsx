import { NavigationContext } from '@react-navigation/native';
import React from 'react';
import { render } from '@testing-library/react-native';
import { useAuthStore } from '../state/authStore';
import { useNameTitle } from './useNameTitle';

function Probe() {
  useNameTitle();
  return null;
}

describe('useNameTitle (D20)', () => {
  afterEach(() => useAuthStore.setState({ profile: null }));

  it("titles the screen's app bar with the person's name, with no greeting", async () => {
    const setOptions = jest.fn();
    useAuthStore.setState({ profile: { full_name: '  Ali Raza ' } as never });
    await render(
      <NavigationContext.Provider value={{ setOptions } as never}>
        <Probe />
      </NavigationContext.Provider>,
    );
    expect(setOptions).toHaveBeenLastCalledWith({ title: 'Ali Raza' });
  });

  it('keeps the stack title while the name is not known, and does nothing outside a navigator', async () => {
    const setOptions = jest.fn();
    await render(
      <NavigationContext.Provider value={{ setOptions } as never}>
        <Probe />
      </NavigationContext.Provider>,
    );
    expect(setOptions).not.toHaveBeenCalled();
    await render(<Probe />);
  });
});
