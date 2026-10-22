import { beforeEach, describe, expect, it, vi } from 'vitest';
const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn(), isLanguageSupported: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: tts }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  tts.stop.mockResolvedValue(undefined);
  tts.isLanguageSupported.mockResolvedValue({ supported: true });
  // Match Android's behavior: canceled native speak promises never resolve.
  tts.speak.mockImplementation(() => new Promise(() => {}));
});
describe('mobile speech cancellation', () => {
  it('can change characters and play feedback after interrupting native speech', async () => {
    const { speak, stopSpeech } = await import('../src/platform');
    const first = speak('学习');
    await vi.waitFor(() => expect(tts.speak).toHaveBeenCalledTimes(1));
    const second = speak('回答正确');
    await first;
    await vi.waitFor(() => expect(tts.speak).toHaveBeenCalledTimes(2));
    await stopSpeech();
    await second;
    expect(tts.speak.mock.calls[1][0].text).toBe('回答正确');
  });
  it('does not start delayed speech after the app hides', async () => {
    const { speak, stopSpeech } = await import('../src/platform');
    const pending = speak('一');
    await stopSpeech();
    await pending;
    expect(tts.speak).not.toHaveBeenCalled();
  });
  it('reports missing Chinese language support', async () => {
    tts.isLanguageSupported.mockResolvedValue({ supported: false });
    const { speak } = await import('../src/platform');
    await expect(speak('学')).rejects.toThrow('安装中文语音');
  });
});
