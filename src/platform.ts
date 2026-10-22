import { Capacitor } from '@capacitor/core';
import type { Entry, Snapshot } from './model';

let speechEpoch = 0;
let speechWork: Promise<unknown> = Promise.resolve();
let cancelUtterance: (() => void) | undefined;
export async function stopSpeech(): Promise<void> {
  speechEpoch++;
  cancelUtterance?.();
  cancelUtterance = undefined;
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    speechWork = speechWork.catch(() => {}).then(() => TextToSpeech.stop().catch(() => {}));
    await speechWork;
  } else window.speechSynthesis?.cancel();
}
export async function speak(text: string): Promise<void> {
  const token = ++speechEpoch;
  cancelUtterance?.();
  cancelUtterance = undefined;
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await new Promise<void>((resolve, reject) => {
      // Android stop() drops native completion callbacks. Never serialize on those callbacks.
      speechWork = speechWork
        .catch(() => {})
        .then(async () => {
          if (token !== speechEpoch) {
            resolve();
            return;
          }
          await TextToSpeech.stop();
          const language = await TextToSpeech.isLanguageSupported({ lang: 'zh-CN' });
          if (token !== speechEpoch) {
            resolve();
            return;
          }
          if (!language.supported) throw new Error('请在系统设置中安装中文语音');
          cancelUtterance = resolve;
          void TextToSpeech.speak({ text, lang: 'zh-CN', rate: 0.85, pitch: 1, volume: 1 }).then(
            resolve,
            reject,
          );
        })
        .catch(reject);
    });
  } else {
    if (!window.speechSynthesis) throw new Error('此浏览器不支持语音播放');
    window.speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = 'zh-CN';
    voice.rate = 0.85;
    const chinese = window.speechSynthesis.getVoices().find((v) => /^zh(-|_)/i.test(v.lang));
    if (chinese) voice.voice = chinese;
    await new Promise<void>((resolve, reject) => {
      cancelUtterance = resolve;
      voice.onend = () => resolve();
      voice.onerror = (event) =>
        event.error === 'interrupted' || event.error === 'canceled'
          ? resolve()
          : reject(new Error('中文语音不可用，请检查系统语音设置'));
      if (token === speechEpoch) window.speechSynthesis.speak(voice);
      else resolve();
    });
  }
}
export function narration(entry: Entry): string {
  // Mobile engines do not share SAPI phonemes. Read the whole character instead of Latin letters.
  return [
    entry.hanzi,
    `部首：${entry.radical || '未提供'}`,
    `笔画顺序：${entry.strokes || '未提供'}`,
    entry.meaning,
    entry.example ? `例句：${entry.example}` : '',
    ...entry.words.map((w) => `词语：${w.text}。${w.meaning}。${w.example}`),
  ]
    .filter(Boolean)
    .join('。');
}
export async function pickText(native: boolean, input: HTMLInputElement | null) {
  if (!native) {
    input?.click();
    return null;
  }
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  const result = await FilePicker.pickFiles({ limit: 1, readData: false });
  const file = result.files[0];
  if (!file) return null;
  if (!/\.(csv|json)$/i.test(file.name)) throw new Error('请选择 CSV 字库或 JSON 备份');
  if (file.size > 25 * 1024 * 1024) throw new Error('文件超过 25 MB，请拆分导入');
  if (!file.path) throw new Error('无法读取所选文件');
  const { Filesystem } = await import('@capacitor/filesystem');
  const content = await Filesystem.readFile({ path: file.path });
  if (typeof content.data !== 'string') throw new Error('无法读取所选文件');
  const bytes = Uint8Array.from(atob(content.data), (c) => c.charCodeAt(0));
  return { name: file.name, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}
export async function exportBackup(snapshot: Snapshot) {
  const text = JSON.stringify({
    format: 'hanzi100-mobile',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...snapshot,
  });
  const name = `hanzi100-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const file = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: '汉字百词斩学习备份', url: file.uri });
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
