import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

  it('labels the input and disables Send until something is written', async () => {
    await render(<ChatInput onSend={() => {}} />);
    expect(screen.getByLabelText('Message')).toBeTruthy();
    expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);
  });

  it('calls onSend with the trimmed text and clears the input once it resolves', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    await render(<ChatInput onSend={onSend} />);
    await fireEvent.changeText(screen.getByLabelText('Message'), '  Hello there  ');
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledWith('Hello there', []);
    await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe(''));
  });

  // FA-03: a send that fails must not eat the message.
  it('keeps the words and photos, and says so, when the send fails', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://leaf.jpg' }]);
    const onSend = jest.fn().mockRejectedValue(new Error('offline'));
    await render(<ChatInput onSend={onSend} />);
    await fireEvent.press(screen.getByLabelText('Add photo'));
    await screen.findByLabelText('Remove photo 1');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'See this leaf');
    await fireEvent.press(screen.getByLabelText('Send message'));

    expect(await screen.findByText("Couldn't send. Your message is still here, so you can try again.")).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('See this leaf');
    expect(screen.getByLabelText('Remove photo 1')).toBeTruthy();

    // Pressing Send again sends the same draft.
    onSend.mockResolvedValue(undefined);
    await fireEvent.press(screen.getByLabelText('Send message'));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend).toHaveBeenLastCalledWith('See this leaf', [{ uri: 'file://leaf.jpg' }]);
    await waitFor(() => expect(screen.queryByText(/Couldn't send/)).toBeNull());
  });

  it('does not call onSend when the message is empty', async () => {
    const onSend = jest.fn();
    await render(<ChatInput onSend={onSend} />);
    await fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('adds a picked photo with a label and lets it be removed', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://photo1.jpg' }]);
    await render(<ChatInput onSend={() => {}} />);
    await fireEvent.press(screen.getByLabelText('Add photo'));
    expect(await screen.findByLabelText('Photo 1 of 1 to send')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove photo 1'));
    expect(screen.queryByLabelText('Remove photo 1')).toBeNull();
  });

  it('holds the Send button while a send is in flight elsewhere', async () => {
    await render(<ChatInput onSend={() => {}} sending />);
    expect(screen.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);
  });
});
