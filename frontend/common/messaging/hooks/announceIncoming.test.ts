import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { incomingAnnouncement, useAnnounceIncomingMessages, type AnnounceableMessage } from './announceIncoming';

const message = (id: string, sender_id: string, body = `Text ${id}`, attachments: string[] = []): AnnounceableMessage => ({
  id,
  sender_id,
  body,
  attachments,
});

describe('useAnnounceIncomingMessages', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });

  afterEach(() => announce.mockRestore());

  const renderThread = (initial: AnnounceableMessage[] | undefined) =>
    renderHook(({ messages }: { messages: AnnounceableMessage[] | undefined }) =>
      useAnnounceIncomingMessages(messages, 'me', 'Ali'),
    { initialProps: { messages: initial } });

  it('stays quiet while loading and for the history that is there on open', async () => {
    const { rerender } = await renderThread(undefined);
    await rerender({ messages: [message('1', 'ali'), message('2', 'me')] });
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a message from the other person once when it arrives', async () => {
    const history = [message('1', 'ali')];
    const { rerender } = await renderThread(history);
    const next = [...history, message('2', 'ali', 'Is the wheat still available?')];
    await rerender({ messages: next });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('New message from Ali: Is the wheat still available?');

    // A refetch returning the same rows (a new array) does not repeat it.
    await rerender({ messages: [...next] });
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("does not announce the user's own sends", async () => {
    const history = [message('1', 'ali')];
    const { rerender } = await renderThread(history);
    await rerender({ messages: [...history, message('2', 'me')] });
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('incomingAnnouncement', () => {
  it('names a photo-only message by its photos', () => {
    expect(incomingAnnouncement([message('1', 'ali', '', ['a.jpg', 'b.jpg'])], 'Ali')).toBe(
      'New message from Ali: 2 photos',
    );
  });

  it('counts several messages that arrived together and reads the latest', () => {
    expect(incomingAnnouncement([message('1', 'ali', 'Hi'), message('2', 'ali', 'Price?')], 'Ali')).toBe(
      '2 new messages from Ali. Latest: Price?',
    );
  });
});
