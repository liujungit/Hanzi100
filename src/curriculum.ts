import Papa from 'papaparse';
import { identity, type Entry, type Word } from './model';

const legacy = [
  'hanzi',
  'pinyin',
  'meaning',
  'example',
  'grade',
  'edition',
  'book',
  'volume',
  'stroke_order',
  'radical',
  'note',
];
const columns = [
  'hanzi',
  'pinyin',
  'meaning',
  'example',
  'words',
  'word_meanings',
  'word_examples',
  'grade',
  'edition',
  'book',
  'volume',
  'stroke_order',
  'radical',
  'note',
];
export function splitAligned(value: string): string[] {
  return value
    .replace(/\\n/g, '\n')
    .split(/[;；、|\r\n]/)
    .map((v) => v.trim());
}
export function tonePinyin(value: string): string {
  return value
    .normalize('NFC')
    .replace(/u:|v/gi, 'ü')
    .replace(/([a-zü]+)([0-5])/gi, (_, syllable: string, digit: string) => {
      const tone = Number(digit);
      if (tone === 0 || tone === 5) return syllable;
      const lower = syllable.toLowerCase();
      let index = lower.indexOf('a');
      if (index < 0) index = lower.indexOf('e');
      if (index < 0 && lower.includes('ou')) index = lower.indexOf('o');
      if (index < 0)
        for (let i = lower.length - 1; i >= 0; i--)
          if ('iouü'.includes(lower[i])) {
            index = i;
            break;
          }
      if (index < 0) return syllable;
      const marks: Record<string, string> = {
        a: 'āáǎà',
        e: 'ēéěè',
        i: 'īíǐì',
        o: 'ōóǒò',
        u: 'ūúǔù',
        ü: 'ǖǘǚǜ',
      };
      let mark = marks[lower[index]][tone - 1];
      if (syllable[index] !== lower[index]) mark = mark.toUpperCase();
      return syllable.slice(0, index) + mark + syllable.slice(index + 1);
    });
}
const strokeSymbols: Record<string, string> = {
  横: '一',
  竖: '丨',
  撇: '丿',
  点: '丶',
  捺: '㇏',
  提: '㇀',
  横折: '㇕',
  横撇: '㇇',
  横钩: '乛',
  竖钩: '亅',
  竖提: '㇙',
  竖弯: '㇄',
  竖弯钩: '乚',
  弯钩: '㇁',
  斜钩: '㇂',
  卧钩: '㇃',
  撇折: '㇜',
  撇点: '㇛',
  横折钩: '㇆',
  横折提: '㇊',
  横折弯: '㇍',
  横折弯钩: '㇈',
  横撇弯钩: '㇌',
  横折折撇: '㇋',
  横折折折钩: '㇡',
  竖折折钩: '㇉',
  竖折撇: '㇞',
};
export function strokeText(raw: string): string {
  let result = raw;
  for (const key of Object.keys(strokeSymbols).sort((a, b) => b.length - a.length))
    result = result.split(key).join(strokeSymbols[key]);
  return result.replace(/[、，,;；\s→-]/g, '');
}
export function parseCurriculum(text: string): Entry[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw new Error(`CSV 格式错误：${parsed.errors[0].message}`);
  const [header, ...rows] = parsed.data;
  if (!header || !rows.length) throw new Error('CSV 中没有汉字数据');
  const fields = header.map((h) => h.trim());
  if (!['hanzi', 'pinyin', 'meaning', 'grade', 'edition'].every((key) => fields.includes(key)))
    throw new Error('CSV 缺少 hanzi、pinyin、meaning、grade 或 edition 表头');
  const valid =
    fields.length === columns.length || (fields.length >= 7 && fields.length <= legacy.length);
  if (!valid || new Set(fields).size !== fields.length) throw new Error('CSV 列数或表头不正确');
  const entries = new Map<string, Entry>();
  rows.forEach((row, i) => {
    if (row.length !== fields.length)
      throw new Error(`第 ${i + 2} 条记录列数不正确，未导入任何数据`);
    const record = Object.fromEntries(fields.map((f, j) => [f, row[j].trim()]));
    if ([...record.hanzi].length !== 1 || !/\p{Script=Han}/u.test(record.hanzi))
      throw new Error(`第 ${i + 2} 条记录的汉字必须为一个汉字`);
    if (!record.pinyin || !record.meaning) throw new Error(`第 ${i + 2} 条记录缺少拼音或释义`);
    const words = splitAligned(record.words || '');
    const meanings = splitAligned(record.word_meanings || '');
    const examples = splitAligned(record.word_examples || '');
    const aligned: Word[] = words
      .map((word, j) => ({ text: word, meaning: meanings[j] || '', example: examples[j] || '' }))
      .filter((w) => w.text);
    const entry: Entry = {
      id: '',
      hanzi: record.hanzi,
      pinyin: tonePinyin(record.pinyin),
      meaning: record.meaning,
      example: record.example || '',
      words: aligned,
      grade: record.grade || '',
      edition: record.edition || '',
      book: record.book || '语文',
      volume: record.volume || '',
      strokes: strokeText(record.stroke_order || ''),
      radical: record.radical || '',
      note: record.note || '',
    };
    entry.id = identity(entry);
    entries.set(entry.id, entry);
  });
  return [...entries.values()];
}
export function mergeCurriculum(existing: Entry[], incoming: Entry[]) {
  const map = new Map(existing.map((e) => [e.id, e]));
  let updated = 0;
  for (const entry of incoming) {
    if (map.has(entry.id)) updated++;
    map.set(entry.id, entry);
  }
  return { entries: [...map.values()], updated, added: incoming.length - updated };
}
