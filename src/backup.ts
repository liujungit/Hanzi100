import { identity, type Snapshot } from './model';

export function parseBackup(text: string): Snapshot {
  const value = JSON.parse(text);
  const fail = () => {
    throw new Error('备份格式或学习状态不完整，未修改现有数据');
  };
  const object = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
    Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
  const date = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(`${v}T12:00:00`));
  if (
    !object(value) ||
    value.format !== 'hanzi100-mobile' ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    !object(value.state)
  )
    fail();
  const data = value as Snapshot;
  const ids = new Set<string>();
  for (const entry of data.entries) {
    if (
      !object(entry) ||
      ![
        'id',
        'hanzi',
        'pinyin',
        'meaning',
        'example',
        'grade',
        'edition',
        'book',
        'volume',
        'strokes',
        'radical',
        'note',
      ].every((k) => typeof (entry as unknown as Record<string, unknown>)[k] === 'string')
    )
      fail();
    if (
      identity(entry) !== entry.id ||
      ids.has(entry.id) ||
      [...entry.hanzi].length !== 1 ||
      !entry.pinyin ||
      !entry.meaning ||
      !Array.isArray(entry.words)
    )
      fail();
    if (
      !entry.words.every(
        (w) =>
          object(w) &&
          ['text', 'meaning', 'example'].every(
            (k) => typeof (w as unknown as Record<string, unknown>)[k] === 'string',
          ),
      )
    )
      fail();
    ids.add(entry.id);
  }
  const state = data.state,
    settings = state.settings;
  if (state.lastTab && !['study', 'review', 'library', 'settings'].includes(state.lastTab)) fail();
  if (
    state.schema !== 1 ||
    !object(settings) ||
    !object(state.progress) ||
    !object(state.errors) ||
    !object(state.sessions)
  )
    fail();
  if (
    !integer(settings.dailyNew, 1, 100) ||
    !integer(settings.dailyReview, 1, 200) ||
    typeof settings.grade !== 'string' ||
    typeof settings.edition !== 'string' ||
    typeof settings.autoSpeak !== 'boolean' ||
    typeof settings.feedback !== 'boolean'
  )
    fail();
  for (const [id, p] of Object.entries(state.progress)) {
    if (
      !ids.has(id) ||
      !object(p) ||
      !integer(p.stage, 0, 5) ||
      !integer(p.reviewCount) ||
      !date(p.nextReview) ||
      !date(p.learnedOn)
    )
      fail();
  }
  for (const [id, count] of Object.entries(state.errors))
    if (!ids.has(id) || !integer(count)) fail();
  for (const [mode, s] of Object.entries(state.sessions)) {
    if (
      !['study', 'review'].includes(mode) ||
      !s ||
      !date(s.date) ||
      !['preview', 'training', 'done'].includes(s.phase)
    )
      fail();
    if (
      !Array.isArray(s.ids) ||
      !s.ids.length ||
      !s.ids.every((id) => ids.has(id)) ||
      new Set(s.ids).size !== s.ids.length ||
      !integer(s.previewIndex, 0, s.ids.length - 1)
    )
      fail();
    if (
      !Array.isArray(s.tasks) ||
      !s.tasks.length ||
      !Array.isArray(s.queue) ||
      !Array.isArray(s.passed) ||
      !Array.isArray(s.completed)
    )
      fail();
    const keys = new Set<string>();
    for (const q of s.tasks) {
      if (
        !object(q) ||
        !s.ids.includes(q.entryId) ||
        !integer(q.type, 0, 6) ||
        !integer(q.wordIndex, -1) ||
        typeof q.key !== 'string' ||
        keys.has(q.key) ||
        typeof q.prompt !== 'string' ||
        !q.prompt ||
        typeof q.answer !== 'string' ||
        !q.answer ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        new Set(q.options).size !== 4 ||
        !q.options.every((o) => typeof o === 'string' && o.trim()) ||
        !q.options.includes(q.answer)
      )
        fail();
      keys.add(q.key);
    }
    if (
      ![s.queue, s.passed].every(
        (list) => new Set(list).size === list.length && list.every((k) => keys.has(k)),
      ) ||
      s.queue.some((k) => s.passed.includes(k)) ||
      !s.completed.every((id) => s.ids.includes(id))
    )
      fail();
    if (s.current) {
      const a = s.current,
        q = a.question;
      const task = s.tasks.find((t) => t.key === q?.key);
      if (
        !task ||
        q.entryId !== task.entryId ||
        q.answer !== task.answer ||
        q.prompt !== task.prompt ||
        q.type !== task.type ||
        q.wordIndex !== task.wordIndex ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        new Set(q.options).size !== 4 ||
        q.options.some((o) => !task.options.includes(o)) ||
        !Array.isArray(a.wrong) ||
        !a.wrong.every((o) => o !== q.answer && q.options.includes(o)) ||
        typeof a.answered !== 'boolean'
      )
        fail();
    } else if (s.phase === 'training') fail();
    const accounted = new Set([...s.queue, ...s.passed]);
    if (s.current) accounted.add(s.current.question.key);
    if (accounted.size !== keys.size) fail();
    if (s.phase === 'done' && (s.queue.length || s.passed.length !== s.tasks.length || s.current)) fail();
  }
  return { entries: data.entries, state: data.state };
}
