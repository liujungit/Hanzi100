import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  FileUp,
  Library,
  LoaderCircle,
  RotateCcw,
  Search,
  Settings2,
  Volume2,
  X,
} from 'lucide-react';
import {
  freshState,
  localDate,
  type Entry,
  type Mode,
  type Settings,
  type Snapshot,
  type State,
  type Tab,
} from './model';
import {
  advance,
  answer,
  beginSession,
  counts,
  eligibleEntries,
  previewMove,
  returnPreview,
  typeNames,
} from './engine';
import { mergeCurriculum } from './curriculum';
import { parseBackup } from './backup';
import { openStore, type Store } from './storage';
import { exportBackup, narration, pickText, speak, stopSpeech } from './platform';
import { CharacterInfo, IconButton, Modal, WritingPad } from './components';

const tabs = [
  { id: 'study', label: '学习汉字', icon: BookOpen },
  { id: 'review', label: '今日复习', icon: RotateCcw },
  { id: 'library', label: '汉字字库', icon: Library },
  { id: 'settings', label: '学习设置', icon: Settings2 },
] as const;
const nextPaint = () => new Promise((resolve) => setTimeout(resolve, 30));

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ entries: [], state: freshState() });
  const latest = useRef(snapshot),
    store = useRef<Store | null>(null),
    lock = useRef(false);
  const [ready, setReady] = useState(false),
    [fatal, setFatal] = useState('');
  const [tab, setTab] = useState<Tab>('study'),
    [date, setDate] = useState(localDate());
  const [busy, setBusy] = useState(''),
    [toast, setToast] = useState('');
  const [detail, setDetail] = useState<Entry | null>(null),
    [writing, setWriting] = useState<Entry | null>(null);
  const [restore, setRestore] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const spoken = useRef(''),
    speaking = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const { entries, state } = snapshot;
  const stats = useMemo(() => counts(entries, state, date), [entries, state, date]);
  const mode: Mode = tab === 'review' ? 'review' : 'study';
  const session = state.sessions[mode]?.date === date ? state.sessions[mode] : undefined;
  const currentEntry =
    session?.phase === 'preview'
      ? entries.find((e) => e.id === session.ids[session.previewIndex])
      : undefined;
  const notify = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5200);
  };
  function assign(value: Snapshot) {
    latest.current = value;
    setSnapshot(value);
  }
  useEffect(() => {
    let alive = true;
    openStore()
      .then(async (database) => {
        const value = await database.read();
        if (!alive) return;
        store.current = database;
        assign(value);
        setTab(value.state.lastTab || 'study');
        setReady(true);
      })
      .catch((e) => setFatal(`无法打开本地数据库：${e.message}`));
    const timer = setInterval(() => setDate(localDate()), 20000);
    const onVisibility = () => {
      setVisible(!document.hidden);
      setDate(localDate());
      if (document.hidden) void stopSpeech();
    };
    document.addEventListener('visibilitychange', onVisibility);
    let removeNative: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(async ({ App }) => {
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!alive) return;
          setVisible(isActive);
          setDate(localDate());
          if (!isActive) void stopSpeech();
        });
        if (!alive) void handle.remove();
        else
          removeNative = () => {
            void handle.remove();
          };
      });
    }
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(toastTimer.current);
      document.removeEventListener('visibilitychange', onVisibility);
      removeNative?.();
      void stopSpeech();
    };
  }, []);
  async function update(transform: (value: State) => State): Promise<boolean> {
    if (lock.current || !store.current) return false;
    lock.current = true;
    try {
      const next = transform(latest.current.state);
      if (next === latest.current.state) return false;
      await store.current.saveState(next);
      assign({ ...latest.current, state: next });
      return true;
    } catch (e) {
      notify(`保存失败，操作未生效：${(e as Error).message}`);
      return false;
    } finally {
      lock.current = false;
    }
  }
  function navigate(next: Tab) {
    void stopSpeech();
    setTab(next);
    void update((s) => ({ ...s, lastTab: next }));
    window.scrollTo({ top: 0 });
  }
  async function readEntry(entry: Entry, automatic = false) {
    if (speaking.current && automatic) return;
    if (currentEntry?.id === entry.id) spoken.current = `${mode}:${entry.id}`;
    speaking.current = true;
    try {
      await speak(narration(entry));
    } catch (e) {
      notify(
        automatic && !Capacitor.isNativePlatform()
          ? '浏览器未启用自动语音，可点朗读按钮播放'
          : (e as Error).message,
      );
    } finally {
      speaking.current = false;
    }
  }
  const previewKey =
    currentEntry && (tab === 'study' || tab === 'review') ? `${mode}:${currentEntry.id}` : '';
  const lastPreview = useRef('');
  useEffect(() => {
    if (previewKey && lastPreview.current !== previewKey) {
      spoken.current = '';
      lastPreview.current = previewKey;
      void stopSpeech();
      speaking.current = false;
    }
    if (
      !previewKey ||
      !visible ||
      busy ||
      detail ||
      writing ||
      !state.settings.autoSpeak ||
      spoken.current === previewKey
    )
      return;
    const timer = setTimeout(() => {
      if (spoken.current === previewKey) return;
      spoken.current = previewKey;
      void readEntry(currentEntry!, true);
    }, 180);
    return () => clearTimeout(timer);
  }, [previewKey, visible, busy, detail, writing, state.settings.autoSpeak]);
  useEffect(() => {
    if (tab !== 'study' && tab !== 'review') return;
    if (!visible || busy || session?.phase !== 'training' || !session.current?.answered) return;
    const timer = setTimeout(() => {
      void update((s) => advance(s, mode));
    }, 850);
    return () => clearTimeout(timer);
  }, [session, tab, visible, busy]);
  async function start() {
    void stopSpeech();
    setBusy('正在生成今日计划');
    await nextPaint();
    await update((s) => beginSession(s, latest.current.entries, mode, localDate()));
    setBusy('');
  }
  async function move(direction: number) {
    void stopSpeech();
    speaking.current = false;
    await update((s) => previewMove(s, mode, direction));
  }
  async function respond(value: string) {
    let result = 'ignored';
    const saved = await update((s) => {
      const response = answer(s, mode, value, localDate());
      result = response.result;
      return response.state;
    });
    if (saved && result !== 'ignored' && latest.current.state.settings.feedback) {
      void speak(result === 'wrong' ? '回答错误，请再试一次' : '回答正确').catch((e) =>
        notify((e as Error).message),
      );
    }
  }
  async function parseInWorker(text: string): Promise<Entry[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        worker.terminate();
        event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.entries);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || '字库解析失败'));
      };
      worker.postMessage(text);
    });
  }
  async function importText(name: string, text: string) {
    if (lock.current || !store.current) return;
    lock.current = true;
    setBusy('正在核对导入文件');
    void stopSpeech();
    try {
      if (/\.json$/i.test(name)) {
        setRestore(parseBackup(text));
        return;
      }
      const incoming = await parseInWorker(text);
      setBusy(`正在保存 ${incoming.length} 条汉字记录`);
      await nextPaint();
      const merged = mergeCurriculum(latest.current.entries, incoming);
      const next = { ...latest.current, entries: merged.entries };
      await store.current.replace(next);
      assign(next);
      notify(`导入完成：新增 ${merged.added} 条，更新 ${merged.updated} 条。原有学习进度已保留。`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  async function chooseFile() {
    try {
      const file = await pickText(Capacitor.isNativePlatform(), input.current);
      if (file) await importText(file.name, file.text);
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) notify((e as Error).message);
    }
  }
  async function bundled(name: string) {
    setBusy('正在读取内置字库');
    try {
      const response = await fetch(`/data/${name}`);
      if (!response.ok) throw new Error('内置字库读取失败');
      const text = await response.text();
      setBusy('');
      await importText(name, text);
    } catch (e) {
      setBusy('');
      notify((e as Error).message);
    }
  }
  async function restoreBackup() {
    if (!restore || !store.current || lock.current) return;
    lock.current = true;
    setBusy('正在恢复备份');
    try {
      await store.current.replace(restore);
      assign(restore);
      setRestore(null);
      spoken.current = '';
      notify('备份已恢复');
    } catch (e) {
      notify(`恢复失败：${(e as Error).message}`);
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  async function backup() {
    try {
      await exportBackup(latest.current);
    } catch (e) {
      notify(`导出失败：${(e as Error).message}`);
    }
  }
  function openWriting(entry: Entry) {
    void stopSpeech();
    setWriting(entry);
  }
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let disposed = false,
      cleanup: (() => void) | undefined;
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', () => {
        if (busy) return;
        void stopSpeech();
        if (writing) setWriting(null);
        else if (detail) setDetail(null);
        else if (restore) setRestore(null);
        else if (tab !== 'study') navigate('study');
        else void App.minimizeApp();
      });
      if (disposed) void handle.remove();
      else
        cleanup = () => {
          void handle.remove();
        };
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [tab, writing, detail, restore, busy]);
  if (fatal)
    return (
      <div className="error-screen">
        <CircleAlert size={40} />
        <h1>无法启动</h1>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          重新尝试
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="loading-screen">
        <img src="/hanzi.png" alt="" />
        <h1>汉字百词斩</h1>
        <LoaderCircle className="spin" />
        <p>正在打开字库</p>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <img src="/hanzi.png" alt="汉字百词斩图标" />
          <span>
            汉字百词斩<small>HANZI LEARNING</small>
          </span>
        </div>
        <nav aria-label="主要导航">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => navigate(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <item.icon />
              <span>{item.label}</span>
              {item.id === 'review' && stats.today > 0 && <b>{stats.today}</b>}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="local-dot" />
          本地学习档案
        </div>
      </aside>
      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="date-label">
              {date.replaceAll('-', '.')} <span>每天认识一点世界</span>
            </p>
            <h1>{tabs.find((t) => t.id === tab)?.label}</h1>
          </div>
          <div className="header-mark">
            <img src="/hanzi.png" alt="" />
          </div>
          <div className="header-stats">
            <span>
              已学汉字<strong>{stats.learned}</strong>
            </span>
            <span>
              明日待复习<strong>{stats.tomorrow}</strong>
            </span>
          </div>
        </header>
        {(tab === 'study' || tab === 'review') && (
          <>
            <div className="day-summary">
              <span className="summary-title">
                <i />
                {mode === 'study' ? '今日新字' : '今日复习'}
              </span>
              <strong>
                {session?.completed.length || 0}
                <small>
                  {' '}
                  /{' '}
                  {session?.ids.length ||
                    (mode === 'study' ? state.settings.dailyNew : state.settings.dailyReview)}{' '}
                  字
                </small>
              </strong>
              <span className="summary-side">
                {mode === 'study' ? '今日待复习' : '明日待复习'}{' '}
                <b>{mode === 'study' ? stats.today : stats.tomorrow}</b>
              </span>
            </div>
            {!entries.length ? (
              <div className="empty-state">
                <img src="/hanzi.png" alt="" />
                <h2>字库为空</h2>
                <button className="primary" onClick={() => navigate('settings')}>
                  <FileUp size={18} />
                  导入汉字字库
                </button>
              </div>
            ) : !session ? (
              <div className="ready-view">
                <div className="ready-symbol">字</div>
                <h2>
                  {eligibleEntries(entries, state, mode, date).length
                    ? mode === 'study'
                      ? '今天，认识新的汉字'
                      : '温故，才能知新'
                    : mode === 'study'
                      ? '当前教材已学完'
                      : '今日暂无待复习汉字'}
                </h2>
                <p>
                  {state.settings.edition || '全部版本'} · {state.settings.grade || '全部年级'}
                </p>
                <button
                  className="primary large"
                  disabled={!eligibleEntries(entries, state, mode, date).length}
                  onClick={() => void start()}
                >
                  <BookOpen size={20} />
                  {mode === 'study' ? '开始学习' : '开始复习'}
                  <ArrowRight size={18} />
                </button>
                <button className="text-button" onClick={() => navigate('settings')}>
                  学习设置
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : session.phase === 'done' ? (
              <div className="completed">
                <div className="completion-seal">
                  <Check size={42} />
                </div>
                <h2>{mode === 'study' ? '今日学习已完成' : '今日复习已完成'}</h2>
                <p>
                  {session.completed.length} 个汉字 · {session.passed.length} 道题目
                </p>
                {mode === 'study' && stats.today > 0 && (
                  <button className="primary" onClick={() => navigate('review')}>
                    <RotateCcw size={18} />
                    今日复习
                  </button>
                )}
              </div>
            ) : session.phase === 'preview' && currentEntry ? (
              <>
                <div className="phase-line">
                  <div className="phase-tabs">
                    <span className="active">
                      <b>1</b>认识汉字
                    </span>
                    <i />
                    <span>
                      <b>2</b>记忆练习
                    </span>
                  </div>
                  <span>
                    {session.previewIndex + 1} / {session.ids.length}
                  </span>
                </div>
                <div className="preview-surface">
                  <CharacterInfo
                    entry={currentEntry}
                    onSpeak={() => void readEntry(currentEntry)}
                    onWrite={() => openWriting(currentEntry)}
                  />
                </div>
                <div className="preview-navigation">
                  <span>{currentEntry.edition}</span>
                  <div>
                    <IconButton
                      label="上一个字"
                      disabled={session.previewIndex === 0}
                      onClick={() => void move(-1)}
                    >
                      <ArrowLeft />
                    </IconButton>
                    <span>
                      {session.previewIndex + 1} / {session.ids.length}
                    </span>
                    <IconButton
                      className="next"
                      label={
                        session.previewIndex + 1 === session.ids.length ? '开始练习' : '下一个字'
                      }
                      onClick={() => void move(1)}
                    >
                      <ArrowRight />
                    </IconButton>
                  </div>
                </div>
              </>
            ) : (
              session.current && (
                <>
                  <div className="phase-line">
                    <div className="phase-tabs">
                      <span>
                        <b>1</b>认识汉字
                      </span>
                      <i />
                      <span className="active">
                        <b>2</b>记忆练习
                      </span>
                    </div>
                    <IconButton
                      label="返回汉字预览"
                      onClick={() => {
                        void stopSpeech();
                        void update((s) => returnPreview(s, mode));
                      }}
                    >
                      <BookOpen size={20} />
                    </IconButton>
                  </div>
                  <div className="quiz-progress">
                    <div>
                      <span>
                        题目总数 <b>{session.tasks.length}</b>
                      </span>
                      <span>
                        已过关 <b>{session.passed.length}</b>
                      </span>
                    </div>
                    <progress
                      value={session.passed.length}
                      max={session.tasks.length}
                      aria-label="练习过关进度"
                    />
                  </div>
                  <section className="quiz-surface">
                    <span className="question-type">
                      {typeNames[session.current.question.type]}
                    </span>
                    <h2
                      className={
                        session.current.question.prompt.length < 3 ? 'single-character' : ''
                      }
                    >
                      {session.current.question.prompt}
                    </h2>
                  </section>
                  <div className="answer-options">
                    {session.current.question.options.map((option, i) => {
                      const attempt = session.current!,
                        wrong = attempt.wrong.includes(option),
                        correct = attempt.answered && option === attempt.question.answer;
                      return (
                        <button
                          key={option}
                          className={`answer-option ${correct ? 'correct' : wrong ? 'wrong' : ''}`}
                          disabled={attempt.answered}
                          onClick={() => void respond(option)}
                        >
                          <span className="option-letter">{'ABCD'[i]}</span>
                          <span className={option.length === 1 ? 'answer-char' : ''}>{option}</span>
                          {correct ? <CheckCircle2 /> : wrong ? <X /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={`answer-feedback ${session.current.answered ? 'success' : session.current.wrong.length ? 'error' : ''}`}
                    aria-live="polite"
                  >
                    {session.current.answered
                      ? session.current.wrong.length
                        ? '已纠正，稍后重做'
                        : '回答正确，已过关'
                      : session.current.wrong.length
                        ? '回答错误，请再试一次'
                        : '\u00a0'}
                  </p>
                </>
              )
            )}
          </>
        )}
        {tab === 'library' && <LibraryView entries={entries} state={state} onDetail={setDetail} />}
        {tab === 'settings' && (
          <SettingsView
            entries={entries}
            settings={state.settings}
            onSave={async (settings) => {
              if (await update((s) => ({ ...s, settings })))
                notify('设置已保存。已开始的今日计划保持不变。');
            }}
            onImport={() => void chooseFile()}
            onBundle={() => void bundled('hanzi_curriculum_primary_junior_all.csv')}
            onSample={() => void bundled('hanzi_curriculum_primary_junior.csv')}
            onExport={() => void backup()}
          />
        )}
      </main>
      <input
        ref={input}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        hidden
        aria-label="导入字库文件"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 25 * 1024 * 1024) {
            notify('文件超过 25 MB，请拆分导入');
            return;
          }
          try {
            await importText(
              file.name,
              new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
            );
          } catch {
            notify('文件不是有效的 UTF-8 编码，请转换后重试');
          }
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="关闭提示" onClick={() => setToast('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="dialog" aria-modal="true" aria-label={busy}>
          <div>
            <LoaderCircle className="spin" size={32} />
            <strong>{busy}</strong>
            <progress aria-label="导入或保存进度" />
          </div>
        </div>
      )}
      {detail && (
        <Modal
          title="汉字详情"
          onClose={() => {
            void stopSpeech();
            setDetail(null);
          }}
        >
          <CharacterInfo
            entry={detail}
            onSpeak={() => void readEntry(detail)}
            onWrite={() => openWriting(detail)}
          />
          <div className="detail-stats">
            <span>
              历史错误 <b>{state.errors[detail.id] || 0}</b> 次
            </span>
            <span>{state.progress[detail.id] ? '已通关' : '未通关'}</span>
          </div>
        </Modal>
      )}
      {writing && <WritingPad entry={writing} onClose={() => setWriting(null)} />}
      {restore && (
        <Modal title="恢复学习备份" onClose={() => setRestore(null)}>
          <div className="restore-content">
            <CircleAlert size={32} />
            <p>
              备份含 {restore.entries.length} 条汉字和 {Object.keys(restore.state.progress).length}{' '}
              条已学记录。恢复将替换本机字库、设置和学习进度。
            </p>
            <p>建议先导出当前备份。</p>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => void backup()}>
              <Download size={18} />
              导出当前备份
            </button>
            <button className="primary" onClick={() => void restoreBackup()}>
              确认恢复
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LibraryView({
  entries,
  state,
  onDetail,
}: {
  entries: Entry[];
  state: State;
  onDetail: (entry: Entry) => void;
}) {
  const [query, setQuery] = useState(''),
    [grade, setGrade] = useState(''),
    [edition, setEdition] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('errors-desc'),
    [page, setPage] = useState(0);
  const grades = [...new Set(entries.map((e) => e.grade))].filter(Boolean),
    editions = [...new Set(entries.map((e) => e.edition))].filter(Boolean);
  useEffect(() => setPage(0), [query, grade, edition, status, sort, entries]);
  const filtered = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            (!grade || e.grade === grade) &&
            (!edition || e.edition === edition) &&
            (!query ||
              `${e.hanzi} ${e.pinyin} ${e.meaning} ${e.words.map((w) => w.text).join(' ')}`.includes(
                query.trim(),
              )) &&
            (!status || (status === 'passed') === !!state.progress[e.id]),
        )
        .sort((a, b) =>
          sort.startsWith('errors')
            ? ((state.errors[b.id] || 0) - (state.errors[a.id] || 0)) *
              (sort === 'errors-desc' ? 1 : -1)
            : a.hanzi.localeCompare(b.hanzi, 'zh-CN'),
        ),
    [entries, state, query, grade, edition, status, sort],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 40));
  return (
    <div className="library-view">
      <div className="search-box">
        <Search size={19} />
        <input
          aria-label="搜索汉字、拼音或词语"
          placeholder="搜索汉字、拼音或词语"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <IconButton label="清除搜索" onClick={() => setQuery('')}>
            <X size={16} />
          </IconButton>
        )}
      </div>
      <div className="library-filters">
        <select aria-label="筛选年级" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">全部年级</option>
          {grades.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select aria-label="筛选版本" value={edition} onChange={(e) => setEdition(e.target.value)}>
          <option value="">全部版本</option>
          {editions.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select aria-label="通关状态" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="passed">已通关</option>
          <option value="unpassed">未通关</option>
        </select>
      </div>
      <div className="list-summary">
        <span>
          共 <b>{filtered.length}</b> 条记录
        </span>
        <label>
          <ArrowDownWideNarrow size={16} />
          <select aria-label="字库排序" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="errors-desc">错误次数从高到低</option>
            <option value="errors-asc">错误次数从低到高</option>
            <option value="pinyin">汉字拼音顺序</option>
          </select>
        </label>
      </div>
      <div className="library-table" role="table" aria-label="汉字字库">
        <div className="library-row library-head" role="row">
          <span>汉字 / 拼音 / 教材</span>
          <span>历史错误</span>
          <span>通关状态</span>
        </div>
        {filtered.slice(page * 40, (page + 1) * 40).map((e) => (
          <button
            key={e.id}
            className="library-row"
            onClick={() => onDetail(e)}
            aria-label={`查看${e.hanzi}，${e.grade}，${e.edition}`}
          >
            <div className="entry-name">
              <strong>{e.hanzi}</strong>
              <div>
                <b>{e.pinyin}</b>
                <p>{e.meaning}</p>
                <small>
                  {e.grade} · {e.edition} · {e.volume}
                </small>
              </div>
            </div>
            <span
              className={(state.errors[e.id] || 0) > 0 ? 'error-count has-errors' : 'error-count'}
            >
              {state.errors[e.id] || 0}
            </span>
            <span className={state.progress[e.id] ? 'passed-tag' : 'pending-tag'}>
              {state.progress[e.id] ? (
                <>
                  <Check size={13} />
                  已通关
                </>
              ) : (
                '未通关'
              )}
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-list">
          <Library />
          <p>暂无符合条件的汉字</p>
        </div>
      )}
      <div className="pagination">
        <IconButton label="上一页" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ArrowLeft />
        </IconButton>
        <span>
          {Math.min(page + 1, pages)} / {pages}
        </span>
        <IconButton label="下一页" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          <ArrowRight />
        </IconButton>
      </div>
    </div>
  );
}

function SettingsView({
  entries,
  settings,
  onSave,
  onImport,
  onBundle,
  onSample,
  onExport,
}: {
  entries: Entry[];
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onImport: () => void;
  onBundle: () => void;
  onSample: () => void;
  onExport: () => void;
}) {
  const [draft, setDraft] = useState(settings),
    [saving, setSaving] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const editions = [...new Set(entries.map((e) => e.edition))].filter(Boolean);
  const grades = [
    ...new Set(
      entries.filter((e) => !draft.edition || e.edition === draft.edition).map((e) => e.grade),
    ),
  ].filter(Boolean);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-view">
      <form onSubmit={(e) => void submit(e)}>
        <section className="settings-section">
          <h2>
            <BookOpen size={20} />
            每日计划
          </h2>
          <div className="setting-field">
            <label htmlFor="daily-new">每日新字</label>
            <div className="number-field">
              <input
                id="daily-new"
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                required
                value={draft.dailyNew || ''}
                onChange={(e) => setDraft({ ...draft, dailyNew: Number(e.target.value) })}
              />
              <span>字</span>
            </div>
          </div>
          <div className="setting-field">
            <label htmlFor="daily-review">每日复习</label>
            <div className="number-field">
              <input
                id="daily-review"
                type="number"
                inputMode="numeric"
                min="1"
                max="200"
                required
                value={draft.dailyReview || ''}
                onChange={(e) => setDraft({ ...draft, dailyReview: Number(e.target.value) })}
              />
              <span>字</span>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <h2>
            <Library size={20} />
            教材范围
          </h2>
          <div className="setting-field">
            <label htmlFor="edition">教材版本</label>
            <select
              id="edition"
              value={draft.edition}
              onChange={(e) => setDraft({ ...draft, edition: e.target.value, grade: '' })}
            >
              <option value="">全部版本</option>
              {editions.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="setting-field">
            <label htmlFor="grade">年级</label>
            <select
              id="grade"
              value={draft.grade}
              onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
            >
              <option value="">全部年级</option>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
        </section>
        <section className="settings-section">
          <h2>
            <Volume2 size={20} />
            语音
          </h2>
          <label className="setting-field">
            <span>换字自动朗读</span>
            <input
              className="switch"
              type="checkbox"
              checked={draft.autoSpeak}
              onChange={(e) => setDraft({ ...draft, autoSpeak: e.target.checked })}
            />
          </label>
          <label className="setting-field">
            <span>答题语音提示</span>
            <input
              className="switch"
              type="checkbox"
              checked={draft.feedback}
              onChange={(e) => setDraft({ ...draft, feedback: e.target.checked })}
            />
          </label>
        </section>
        <button className="primary save-settings" type="submit" disabled={saving}>
          <Check size={18} />
          保存设置
        </button>
      </form>
      <section className="settings-section data-section">
        <h2>
          <FileUp size={20} />
          字库与备份
        </h2>
        <p className="data-count">
          本地字库 <strong>{entries.length}</strong> 条
        </p>
        <button className="import-row" onClick={onImport}>
          <FileUp />
          <span>导入 CSV 字库 / 恢复备份</span>
          <ChevronRight />
        </button>
        <button className="import-row" onClick={onBundle}>
          <Library />
          <span>
            导入项目扩展字库<small>小学、初中 · 4,407 条教材记录</small>
          </span>
          <ChevronRight />
        </button>
        <button className="import-row" onClick={onSample}>
          <BookOpen />
          <span>
            导入基础字库<small>120 条教材记录</small>
          </span>
          <ChevronRight />
        </button>
        <button className="import-row" onClick={onExport}>
          <Download />
          <span>导出学习备份</span>
          <ChevronRight />
        </button>
      </section>
      <section className="settings-section">
        <h2>复习间隔</h2>
        <div className="intervals">
          {[1, 2, 4, 7, 15, 30].map((n) => (
            <span key={n}>
              <b>{n}</b> 天
            </span>
          ))}
        </div>
        <p className="data-note">
          教材归属与完整性以已授权原始资料为准。项目附带字表的教材版本、年级和册次仍需核实。
        </p>
        <p className="version">汉字百词斩 · 移动版 1.0.0</p>
      </section>
    </div>
  );
}
