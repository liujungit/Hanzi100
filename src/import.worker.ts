import { parseCurriculum } from './curriculum';
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ entries: parseCurriculum(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '解析 CSV 失败' });
  }
};
