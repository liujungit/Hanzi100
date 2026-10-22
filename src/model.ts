export type Mode = 'study' | 'review';
export type Tab = Mode | 'library' | 'settings';
export interface Word {
  text: string;
  meaning: string;
  example: string;
}
export interface Entry {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  example: string;
  words: Word[];
  grade: string;
  edition: string;
  book: string;
  volume: string;
  strokes: string;
  radical: string;
  note: string;
}
export interface Progress {
  stage: number;
  nextReview: string;
  reviewCount: number;
  learnedOn: string;
}
export interface Settings {
  dailyNew: number;
  dailyReview: number;
  grade: string;
  edition: string;
  autoSpeak: boolean;
  feedback: boolean;
}
export interface Question {
  key: string;
  entryId: string;
  type: number;
  wordIndex: number;
  prompt: string;
  answer: string;
  options: string[];
}
export interface Attempt {
  question: Question;
  wrong: string[];
  answered: boolean;
}
export interface Session {
  date: string;
  ids: string[];
  phase: 'preview' | 'training' | 'done';
  previewIndex: number;
  tasks: Question[];
  queue: string[];
  passed: string[];
  completed: string[];
  current: Attempt | null;
}
export interface State {
  schema: 1;
  settings: Settings;
  progress: Record<string, Progress>;
  errors: Record<string, number>;
  lastTab?: Tab;
  sessions: Partial<Record<Mode, Session>>;
}
export interface Snapshot {
  entries: Entry[];
  state: State;
}
export function freshState(): State {
  return {
    schema: 1,
    settings: {
      dailyNew: 10,
      dailyReview: 20,
      grade: '',
      edition: '',
      autoSpeak: true,
      feedback: true,
    },
    progress: {},
    errors: {},
    sessions: {},
  };
}
export function identity(
  e: Pick<Entry, 'hanzi' | 'grade' | 'edition' | 'book' | 'volume'>,
): string {
  return JSON.stringify([
    e.hanzi.trim(),
    e.grade.trim(),
    e.edition.trim(),
    e.book.trim() || '语文',
    e.volume.trim(),
  ]);
}
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days, 12));
}
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
