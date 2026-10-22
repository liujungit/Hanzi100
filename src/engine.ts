import {
  addDays,
  clone,
  type Entry,
  type Mode,
  type Question,
  type Session,
  type State,
} from './model';

export const intervals = [1, 2, 4, 7, 15, 30];
export const typeNames = [
  '看拼音选汉字',
  '看汉字选拼音',
  '看释义选汉字',
  '看汉字选释义',
  '根据词语选汉字',
  '选词填空',
  '根据意思选词语',
];
export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeQuestions(entry: Entry, all: Entry[], random = Math.random): Question[] {
  const tasks: Question[] = [];
  const fallback = {
    hanzi: ['山', '水', '月', '花', '林', '田'],
    pinyin: ['shān', 'shuǐ', 'yuè', 'huā', 'lín', 'tián'],
    meaning: [
      '地面上高耸的部分',
      '无色无味的透明液体',
      '地球的天然卫星',
      '植物的繁殖器官',
      '成片的树木',
      '种植庄稼的土地',
    ],
    word: ['山峰', '河水', '月亮', '鲜花', '树林', '田地'],
  };
  function add(type: number, wordIndex: number, prompt: string, answer: string) {
    if (!answer.trim() || !prompt.trim()) return;
    const field = type === 1 ? 'pinyin' : type === 3 ? 'meaning' : type >= 5 ? 'word' : 'hanzi';
    const others = all.flatMap((e) => (field === 'word' ? e.words.map((w) => w.text) : [e[field]]));
    const choices = shuffled(
      [...new Set([...others, ...fallback[field]])].filter((v) => v.trim() && v !== answer),
      random,
    ).slice(0, 3);
    if (choices.length < 3) return;
    tasks.push({
      key: `${entry.id}:${type}:${wordIndex}`,
      entryId: entry.id,
      type,
      wordIndex,
      prompt,
      answer,
      options: shuffled([answer, ...choices], random),
    });
  }
  add(0, -1, entry.pinyin, entry.hanzi);
  add(1, -1, entry.hanzi, entry.pinyin);
  add(2, -1, entry.meaning, entry.hanzi);
  add(3, -1, entry.hanzi, entry.meaning);
  entry.words.forEach((word, i) => {
    if (word.text.includes(entry.hanzi))
      add(4, i, word.text.split(entry.hanzi).join('____'), entry.hanzi);
    if (word.example.includes(word.text))
      add(5, i, word.example.split(word.text).join('____'), word.text);
    if (word.meaning) add(6, i, word.meaning, word.text);
  });
  return tasks;
}
export function eligibleEntries(entries: Entry[], state: State, mode: Mode, date: string): Entry[] {
  return entries
    .filter(
      (e) =>
        (!state.settings.grade || e.grade === state.settings.grade) &&
        (!state.settings.edition || e.edition === state.settings.edition),
    )
    .filter((e) =>
      mode === 'study'
        ? !state.progress[e.id]
        : !!state.progress[e.id] && state.progress[e.id].nextReview <= date,
    )
    .sort((a, b) =>
      mode === 'review'
        ? state.progress[a.id].nextReview.localeCompare(state.progress[b.id].nextReview)
        : 0,
    );
}
export function beginSession(
  state: State,
  entries: Entry[],
  mode: Mode,
  date: string,
  random = Math.random,
): State {
  if (state.sessions[mode]?.date === date) return state;
  const limit = mode === 'study' ? state.settings.dailyNew : state.settings.dailyReview;
  const candidates = eligibleEntries(entries, state, mode, date);
  const ids: string[] = [],
    tasks: Question[] = [];
  for (const entry of candidates) {
    let questions = makeQuestions(entry, entries, random);
    if (mode === 'review') {
      const types = shuffled([...new Set(questions.map((q) => q.type))], random).slice(0, 3);
      questions = types.map(
        (type) =>
          shuffled(
            questions.filter((q) => q.type === type),
            random,
          )[0],
      );
      if (questions.length !== 3) continue;
    }
    if (!questions.length) continue;
    ids.push(entry.id);
    tasks.push(...questions);
    if (ids.length === limit) break;
  }
  if (!ids.length) return state;
  const next = clone(state);
  next.sessions[mode] = {
    date,
    ids,
    tasks,
    phase: 'preview',
    previewIndex: 0,
    queue: shuffled(
      tasks.map((q) => q.key),
      random,
    ),
    passed: [],
    completed: [],
    current: null,
  };
  return next;
}
function loadNext(session: Session, random = Math.random) {
  const key = session.queue.shift();
  if (!key) {
    session.phase = 'done';
    session.current = null;
    return;
  }
  const task = session.tasks.find((q) => q.key === key)!;
  session.current = {
    question: { ...task, options: shuffled(task.options, random) },
    wrong: [],
    answered: false,
  };
}
export function previewMove(state: State, mode: Mode, direction: number): State {
  const next = clone(state),
    session = next.sessions[mode];
  if (!session || session.phase !== 'preview') return state;
  const index = session.previewIndex + direction;
  if (index < 0) return state;
  if (index >= session.ids.length) {
    session.phase = 'training';
    if (!session.current) loadNext(session);
  } else session.previewIndex = index;
  return next;
}
export function returnPreview(state: State, mode: Mode): State {
  const next = clone(state),
    session = next.sessions[mode];
  if (!session || session.phase !== 'training') return state;
  session.phase = 'preview';
  session.previewIndex = 0;
  return next;
}
export function answer(
  state: State,
  mode: Mode,
  value: string,
  date: string,
  random = Math.random,
): { state: State; result: 'wrong' | 'retry' | 'passed' | 'ignored' } {
  const original = state.sessions[mode];
  if (
    !original ||
    original.phase !== 'training' ||
    !original.current ||
    original.current.answered ||
    !original.current.question.options.includes(value)
  )
    return { state, result: 'ignored' };
  const next = clone(state),
    session = next.sessions[mode]!,
    attempt = session.current!,
    question = attempt.question;
  if (value !== question.answer) {
    next.errors[question.entryId] = (next.errors[question.entryId] || 0) + 1;
    if (!attempt.wrong.includes(value)) attempt.wrong.push(value);
    return { state: next, result: 'wrong' };
  }
  attempt.answered = true;
  if (attempt.wrong.length) {
    session.queue = shuffled([...session.queue, question.key], random);
    if (session.queue.length > 1 && session.queue[0] === question.key)
      [session.queue[0], session.queue[1]] = [session.queue[1], session.queue[0]];
    return { state: next, result: 'retry' };
  }
  session.passed.push(question.key);
  const finished = session.tasks
    .filter((q) => q.entryId === question.entryId)
    .every((q) => session.passed.includes(q.key));
  if (finished && !session.completed.includes(question.entryId)) {
    session.completed.push(question.entryId);
    const previous = next.progress[question.entryId];
    const stage =
      mode === 'review' ? Math.min((previous?.stage ?? 0) + 1, intervals.length - 1) : 0;
    next.progress[question.entryId] = {
      stage,
      nextReview: addDays(date, intervals[stage]),
      reviewCount: mode === 'review' ? (previous?.reviewCount || 0) + 1 : 0,
      learnedOn: previous?.learnedOn || date,
    };
  }
  return { state: next, result: 'passed' };
}
export function advance(state: State, mode: Mode): State {
  const session = state.sessions[mode];
  if (!session || session.phase !== 'training' || !session.current?.answered) return state;
  const next = clone(state);
  loadNext(next.sessions[mode]!);
  return next;
}
export function counts(entries: Entry[], state: State, date: string) {
  let today = 0,
    tomorrow = 0,
    learned = 0;
  for (const entry of entries) {
    const progress = state.progress[entry.id];
    if (!progress) continue;
    learned++;
    if (progress.nextReview <= date) today++;
    if (progress.nextReview === addDays(date, 1)) tomorrow++;
  }
  return { today, tomorrow, learned };
}
