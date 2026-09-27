import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChatInput } from './ChatInput';
import { pickPhotos } from '../../../utils/photoPicker';

jest.mock('../../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockPickPhotos = pickPhotos as jest.Mock;

describe('ChatInput', () => {
  beforeEach(() => {
    mockPickPhotos.mockReset();
  });

  it('renders the input and disables Send until text is entered', async () => {
    await render(<ChatInput onSend={() => {}} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);
  });

  it('calls onSend with the trimmed text and clears the input', async () => {
    const onSend = jest.fn();
    await render(<ChatInput onSend={onSend} />);
    await fireEvent.changeText(screen.getByPlaceholderText('Type a message...'), '  Hello there  ');
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledWith('Hello there', []);
    expect(screen.getByPlaceholderText('Type a message...').props.value).toBe('');
  });

  it('does not call onSend when the message is empty', async () => {
    const onSend = jest.fn();
    await render(<ChatInput onSend={onSend} />);
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('adds a picked image preview and lets it be removed', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    await render(<ChatInput onSend={() => {}} />);
    await fireEvent.press(screen.getByLabelText('Add photo'));
    expect(await screen.findByLabelText('Remove photo')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove photo'));
    expect(screen.queryByLabelText('Remove photo')).toBeNull();
  });

  it('disables the attach and send buttons while sending', async () => {
    await render(<ChatInput onSend={() => {}} sending />);
    expect(screen.getByLabelText('Add photo').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);
  });
});
