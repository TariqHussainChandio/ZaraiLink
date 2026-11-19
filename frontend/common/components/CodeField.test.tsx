import React, { createRef, useState } from 'react';
import { StyleSheet, type TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { CodeField } from './CodeField';

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <CodeField value={value} onChange={setValue} onComplete={onComplete} label="Code from your email" />;
}

describe('CodeField', () => {
  it('is one input that the phone can fill with the one-time code', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText('Code from your email');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(screen.getAllByLabelText('Code from your email')).toHaveLength(1);
  });

  it('sets no maxLength, because Android applies it before any filter and would cut a pasted sentence', async () => {
    await render(<Harness />);
    expect(screen.getByLabelText('Code from your email').props.maxLength).toBeUndefined();
  });

  it('takes the digits out of a pasted sentence', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), 'Your code is 123456');
    expect(screen.getByLabelText('Code from your email').props.value).toBe('123456');
  });

  it('caps the code at its length in code, however much arrives', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '1234567890');
    expect(screen.getByLabelText('Code from your email').props.value).toBe('123456');
  });

  it('ignores anything that is not a digit as it is typed', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '12a-3 4');
    expect(screen.getByLabelText('Code from your email').props.value).toBe('1234');
  });

  it('draws one cell per digit and fills them in order', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '482');
    for (const digit of ['4', '8', '2']) expect(screen.getByText(digit, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByText(/^\d?$/, { includeHiddenElements: true })).toHaveLength(6);
  });

  it('tells the screen the moment the last digit is in, so it can submit', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '12345');
    expect(onComplete).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Code from your email'), '123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('shows an error under the cells and draws them in the danger colour', async () => {
    await render(<CodeField value="123456" onChange={() => undefined} error="That code is not right. Check it, or ask for a new one." />);
    expect(screen.getByText('That code is not right. Check it, or ask for a new one.')).toBeTruthy();
    const cell = screen.getAllByText('1', { includeHiddenElements: true })[0]?.parent;
    expect(StyleSheet.flatten(cell?.props.style).borderColor).toBe(lightTheme.colors.status.danger.mark);
  });

  it('keeps the cells out of the way of a screen reader, which gets the one input', async () => {
    await render(<Harness />);
    const cells = screen.getAllByText(/^\d?$/, { includeHiddenElements: true })[0]?.parent?.parent;
    expect(cells?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('forwards its ref, so a screen can focus it on arrival', async () => {
    const ref = createRef<TextInput>();
    await render(<CodeField ref={ref} value="" onChange={() => undefined} />);
    expect(typeof ref.current?.focus).toBe('function');
  });

  it('supports a code of another length', async () => {
    const onChange = jest.fn();
    await render(<CodeField value="" onChange={onChange} length={4} />);
    await fireEvent.changeText(screen.getByLabelText('Code'), '123456');
    expect(onChange).toHaveBeenCalledWith('1234');
  });
});
