import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { anchorFromPress, Dropdown, DropdownMenu } from './Dropdown';

// The test renderer's window (jest-expo/android): 750 x 1334.
const WINDOW_HEIGHT = 1334;

function panelStyle() {
  return StyleSheet.flatten(screen.getByLabelText('Units').props.style);
}

describe('Dropdown: where it opens (D19)', () => {
  it('opens directly under the control, as wide as it', async () => {
    await render(
      <Dropdown visible anchor={{ x: 40, y: 200, width: 300, height: 48 }} onClose={() => {}} label="Units">
        {() => <Text>Kilogram</Text>}
      </Dropdown>,
    );
    const style = panelStyle();
    expect(style.top).toBeGreaterThan(200 + 48 - 1);
    expect(style.bottom).toBeUndefined();
    expect(style.left).toBe(40);
    expect(style.width).toBe(300);
    expect(screen.getByText('Kilogram')).toBeTruthy();
  });

  it('opens above a control near the bottom of the screen', async () => {
    await render(
      <Dropdown visible anchor={{ x: 40, y: WINDOW_HEIGHT - 100, width: 300, height: 48 }} onClose={() => {}} label="Units">
        {() => <Text>Kilogram</Text>}
      </Dropdown>,
    );
    const style = panelStyle();
    expect(style.top).toBeUndefined();
    expect(style.bottom).toBeGreaterThan(100 - 1);
  });

  it('is never narrower than a readable list, and stays on the screen', async () => {
    await render(
      <Dropdown visible anchor={{ x: 700, y: 200, width: 20, height: 20 }} onClose={() => {}} label="Units">
        {() => <Text>Kilogram</Text>}
      </Dropdown>,
    );
    const style = panelStyle();
    expect(style.width).toBeGreaterThanOrEqual(200);
    expect(style.left + style.width).toBeLessThanOrEqual(750);
  });

  it('stays hidden while the control is being measured, so it never jumps', async () => {
    await render(
      <Dropdown visible anchor={undefined} onClose={() => {}} label="Units">
        {() => <Text>Kilogram</Text>}
      </Dropdown>,
    );
    expect(panelStyle().opacity).toBe(0);
  });

  it('closes on a tap outside it', async () => {
    const onClose = jest.fn();
    await render(
      <Dropdown visible anchor={null} onClose={onClose} label="Units">
        {() => <Text>Kilogram</Text>}
      </Dropdown>,
    );
    await fireEvent.press(screen.getByTestId('dropdown-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DropdownMenu', () => {
  it('runs the chosen action after closing itself', async () => {
    const order: string[] = [];
    await render(
      <DropdownMenu
        visible
        anchor={null}
        onClose={() => order.push('close')}
        label="Units"
        items={[{ label: 'Suspend Sana', onPress: () => order.push('suspend'), destructive: true }]}
      />,
    );
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Suspend Sana' }));
    expect(order).toEqual(['close', 'suspend']);
  });
});

describe('anchorFromPress', () => {
  it('is the point that was pressed', () => {
    expect(anchorFromPress({ nativeEvent: { pageX: 12, pageY: 340 } } as never)).toEqual({ x: 12, y: 340, width: 0, height: 0 });
  });

  it('is nothing for a press with no position, so the menu opens centred', () => {
    expect(anchorFromPress(undefined)).toBeNull();
  });
});
