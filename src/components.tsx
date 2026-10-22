import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  PencilLine,
  RotateCcw,
  Undo2,
  Volume2,
  X,
} from 'lucide-react';
import type { Entry } from './model';

export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <IconButton label="关闭" onClick={onClose}>
          <X />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}
export function CharacterInfo({
  entry,
  onSpeak,
  onWrite,
}: {
  entry: Entry;
  onSpeak: () => void;
  onWrite: () => void;
}) {
  const [stroke, setStroke] = useState(0);
  useEffect(() => setStroke(0), [entry.id]);
  const symbols = Array.from(entry.strokes);
  return (
    <div className="character-info">
      <div className="character-top">
        <span className="tag">
          {entry.grade || '未分年级'} · {entry.volume || entry.book}
        </span>
        <div className="inline-actions">
          <IconButton label="朗读汉字信息" onClick={onSpeak}>
            <Volume2 />
          </IconButton>
          <IconButton label="练习书写" onClick={onWrite}>
            <PencilLine />
          </IconButton>
        </div>
      </div>
      <div className="character" lang="zh-CN">
        {entry.hanzi}
      </div>
      <p className="pinyin">{entry.pinyin}</p>
      <div className="character-meta">
        <div>
          <span>笔画顺序</span>
          <strong className="strokes">
            {symbols.length
              ? symbols.map((s, i) => (
                  <b key={i} className={stroke === i + 1 ? 'active-stroke' : ''}>
                    {s}
                  </b>
                ))
              : '未提供'}
          </strong>
        </div>
        <div>
          <span>部首</span>
          <strong>{entry.radical || '未提供'}</strong>
        </div>
      </div>
      {symbols.length > 0 && (
        <div className="stroke-control">
          <IconButton
            label="上一笔"
            disabled={stroke <= 1}
            onClick={() => setStroke(Math.max(1, stroke - 1))}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <label>
            笔序{' '}
            <input
              aria-label="笔画序号"
              type="range"
              min="0"
              max={symbols.length}
              value={stroke}
              onChange={(e) => setStroke(Number(e.target.value))}
            />
          </label>
          <span>
            {stroke || '全部'} / {symbols.length}
          </span>
          <IconButton
            label="下一笔"
            disabled={stroke >= symbols.length}
            onClick={() => setStroke(stroke + 1)}
          >
            <ArrowRight size={16} />
          </IconButton>
        </div>
      )}
      <section className="definition">
        <h3>释义</h3>
        <p>{entry.meaning}</p>
      </section>
      {entry.example && (
        <section className="example">
          <h3>例句</h3>
          <p>{entry.example}</p>
        </section>
      )}
      {entry.words.length > 0 && (
        <section className="words">
          <h3>组词</h3>
          {entry.words.map((w, i) => (
            <div className="word-item" key={`${w.text}-${i}`}>
              <strong>{w.text}</strong>
              <p>{w.meaning || '暂无词义'}</p>
              <p className="word-example">{w.example || '暂无例句'}</p>
            </div>
          ))}
        </section>
      )}
      {entry.note && (
        <details className="source-note">
          <summary>字库备注</summary>
          <p>{entry.note}</p>
        </details>
      )}
    </div>
  );
}
type Point = { x: number; y: number };
export function WritingPad({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef(false);
  const [count, setCount] = useState(0),
    [guide, setGuide] = useState(true);
  function draw() {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    const size = el.getBoundingClientRect().width,
      ratio = window.devicePixelRatio || 1;
    el.width = Math.round(size * ratio);
    el.height = Math.round(size * ratio);
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#173b33';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const points of strokes.current) {
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x * size, p.y * size) : ctx.moveTo(p.x * size, p.y * size),
      );
      if (points.length === 1) {
        ctx.lineTo(points[0].x * size + 0.1, points[0].y * size + 0.1);
      }
      ctx.stroke();
    }
  }
  useEffect(() => {
    const observer = new ResizeObserver(draw);
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height };
  }
  return (
    <Modal title="书写练习" onClose={onClose}>
      <div className="writing-title">
        <strong>{entry.hanzi}</strong>
        <span>{entry.pinyin}</span>
        <IconButton label={guide ? '隐藏描红' : '显示描红'} onClick={() => setGuide(!guide)}>
          {guide ? <Eye /> : <EyeOff />}
        </IconButton>
      </div>
      <div className="writing-grid">
        {guide && <span aria-hidden="true">{entry.hanzi}</span>}
        <canvas
          ref={canvas}
          aria-label="汉字书写画布"
          onPointerDown={(e) => {
            if (active.current) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            active.current = true;
            strokes.current.push([point(e)]);
            draw();
          }}
          onPointerMove={(e) => {
            if (active.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
              strokes.current[strokes.current.length - 1].push(point(e));
              draw();
            }
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              active.current = false;
              setCount(strokes.current.length);
            }
          }}
          onPointerCancel={() => {
            active.current = false;
            setCount(strokes.current.length);
          }}
        />
      </div>
      <p className="writing-strokes">
        {entry.strokes || '未提供笔顺'} <span>{count} 笔</span>
      </p>
      <footer className="modal-actions">
        <IconButton
          label="撤销一笔"
          disabled={!count}
          onClick={() => {
            strokes.current.pop();
            setCount(strokes.current.length);
            draw();
          }}
        >
          <Undo2 />
        </IconButton>
        <IconButton
          label="清空书写"
          disabled={!count}
          onClick={() => {
            strokes.current = [];
            setCount(0);
            draw();
          }}
        >
          <RotateCcw />
        </IconButton>
        <button className="primary" onClick={onClose}>
          <Check size={18} />
          完成
        </button>
      </footer>
    </Modal>
  );
}
