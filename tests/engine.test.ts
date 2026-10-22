import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCurriculum, mergeCurriculum, splitAligned, tonePinyin } from '../src/curriculum';
import { addDays, freshState, type State } from '../src/model';
import {
  advance,
  answer,
  beginSession,
  counts,
  makeQuestions,
  previewMove,
  returnPreview,
} from '../src/engine';
import { parseBackup } from '../src/backup';

const sampleText = readFileSync(
  new URL('../public/data/hanzi_curriculum_primary_junior.csv', import.meta.url),
  'utf8',
);
const entries = parseCurriculum(sampleText);
const date = '2026-10-21';
function plan(size = 2) {
  const state = freshState();
  state.settings.dailyNew = size;
  let started = beginSession(state, entries, 'study', date);
  for (let i = 0; i < size; i++) started = previewMove(started, 'study', 1);
  return started;
}
describe('curriculum', () => {
  it('imports both complete project CSV files', () => {
    expect(entries).toHaveLength(120);
    const all = parseCurriculum(
      readFileSync(
        new URL('../public/data/hanzi_curriculum_primary_junior_all.csv', import.meta.url),
        'utf8',
      ),
    );
    expect(all).toHaveLength(4407);
    expect(new Set(all.map((e) => e.id)).size).toBe(4407);
  });
  it('splits aligned terms without shifting empty meanings', () => {
    expect(splitAligned('一;；三、四\n五|六')).toEqual(['一', '', '三', '四', '五', '六']);
    expect(tonePinyin('shuang1 nv3 lu:4 liu2')).toBe('shuāng nǚ lǜ liú');
  });
  it('rejects bad rows instead of partially importing', () => {
    expect(() => parseCurriculum(sampleText + '\n坏,行')).toThrow();
    expect(() => parseCurriculum('hanzi,pinyin\n学,xue2')).toThrow();
  });
  it('updates by curriculum identity without changing progress or IDs', () => {
    const changed = { ...entries[0], meaning: '更新释义' };
    const result = mergeCurriculum(entries, [changed]);
    expect(result.entries).toHaveLength(entries.length);
    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);
    expect(result.entries[0].id).toBe(entries[0].id);
    expect(result.entries[0].meaning).toBe('更新释义');
  });
  it('every available question has 4 distinct options and exact sentence masking', () => {
    for (const entry of entries)
      for (const q of makeQuestions(entry, entries)) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options.every(Boolean)).toBe(true);
        expect(q.options).toContain(q.answer);
        if (q.type === 5) {
          expect(q.prompt).toContain('____');
          expect(q.prompt).not.toContain(q.answer);
        }
        if (q.type === 4) {
          expect(q.prompt).toContain('____');
          expect(q.prompt).not.toContain(entry.hanzi);
        }
      }
  });
});
describe('persistent daily learning', () => {
  it('keeps a wrong answer on screen and requeues a corrected attempt', () => {
    const state = plan(),
      q = state.sessions.study!.current!.question;
    const wrong = q.options.find((o) => o !== q.answer)!;
    const first = answer(state, 'study', wrong, date);
    expect(first.result).toBe('wrong');
    expect(first.state.errors[q.entryId]).toBe(1);
    expect(first.state.sessions.study!.current!.question.key).toBe(q.key);
    const restored: State = JSON.parse(JSON.stringify(first.state));
    const correction = answer(restored, 'study', q.answer, date);
    expect(correction.result).toBe('retry');
    expect(correction.state.sessions.study!.queue).toContain(q.key);
    expect(correction.state.sessions.study!.passed).toHaveLength(0);
    expect(correction.state.progress[q.entryId]).toBeUndefined();
    expect(answer(correction.state, 'study', q.answer, date).result).toBe('ignored');
  });
  it('marks a character learned only after all its questions pass; never adds more that day', () => {
    let state = plan(2);
    const total = state.sessions.study!.tasks.length;
    state = answer(state, 'study', state.sessions.study!.current!.question.answer, date).state;
    expect(Object.keys(state.progress)).toHaveLength(0);
    state = advance(state, 'study');
    while (state.sessions.study!.phase !== 'done') {
      state = answer(state, 'study', state.sessions.study!.current!.question.answer, date).state;
      state = advance(state, 'study');
    }
    expect(Object.keys(state.progress)).toHaveLength(2);
    expect(state.sessions.study!.passed).toHaveLength(total);
    for (const p of Object.values(state.progress)) expect(p.nextReview).toBe('2026-10-22');
    state.settings.dailyNew = 30;
    expect(beginSession(state, entries, 'study', date)).toBe(state);
    expect(beginSession(state, entries, 'study', '2026-10-22').sessions.study!.ids).toHaveLength(
      30,
    );
  });
  it('preview navigation does not reset answered questions', () => {
    const state = plan(),
      q = state.sessions.study!.current!.question;
    let preview = returnPreview(state, 'study');
    expect(preview.sessions.study!.previewIndex).toBe(0);
    preview = previewMove(preview, 'study', 1);
    preview = previewMove(preview, 'study', -1);
    expect(preview.sessions.study!.previewIndex).toBe(0);
    preview = previewMove(preview, 'study', 1);
    preview = previewMove(preview, 'study', 1);
    expect(preview.sessions.study!.current!.question).toEqual(q);
  });
  it('review chooses 3 distinct types per character and advances the interval', () => {
    let state = freshState();
    for (const e of entries.slice(0, 3))
      state.progress[e.id] = {
        stage: 0,
        nextReview: date,
        learnedOn: '2026-10-20',
        reviewCount: 0,
      };
    state.settings.dailyReview = 2;
    state = beginSession(state, entries, 'review', date);
    expect(state.sessions.review!.tasks).toHaveLength(6);
    for (const id of state.sessions.review!.ids)
      expect(
        new Set(state.sessions.review!.tasks.filter((q) => q.entryId === id).map((q) => q.type))
          .size,
      ).toBe(3);
    state = previewMove(previewMove(state, 'review', 1), 'review', 1);
    while (state.sessions.review!.phase !== 'done') {
      state = answer(state, 'review', state.sessions.review!.current!.question.answer, date).state;
      state = advance(state, 'review');
    }
    for (const id of state.sessions.review!.ids) {
      expect(state.progress[id].nextReview).toBe('2026-10-23');
      expect(state.progress[id].reviewCount).toBe(1);
    }
    expect(counts(entries, state, date).today).toBe(1);
  });
  it('round-trips backup with a partially answered session and rejects corrupted backups', () => {
    const state = plan();
    const value = { format: 'hanzi100-mobile', version: 1, entries, state };
    expect(parseBackup(JSON.stringify(value))).toEqual({ entries, state });
    value.state.sessions.study!.current!.question.options = [''];
    expect(() => parseBackup(JSON.stringify(value))).toThrow();
  });
  it('uses calendar dates across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
