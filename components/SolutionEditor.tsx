// SolutionEditor.tsx — v2 (Merge Tự Luận + Đúng/Sai)
// Tương thích ngược hoàn toàn với data cũ (không có `type`)

import React, { useState, useEffect, useRef, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { supabase } from "../src/lib/supabase";
import { useUIStore } from "../src/stores/useUIStore";
import { SolutionStep as Step, SolutionStatement as Statement } from '../types';
import {
  ChevronLeft, Save, Trash2, ArrowUp, ArrowDown,
  Plus, Eye, BookOpen, Layers, X, ToggleLeft, ToggleRight
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type QuestionType = 'tu_luan' | 'dung_sai';

interface Question {
  questionNo: string;
  qText: string;
  qFormula: string;
  type: QuestionType;
  steps: Step[];           // dùng khi type === 'tu_luan'
  statements: Statement[]; // dùng khi type === 'dung_sai'
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const CATEGORIES = ['Lý thuyết', 'Mẹo giải bài', 'Kinh nghiệm', 'Tin tức', 'Đề cương', 'Khác'];
const STMT_LABELS: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];

const emptyStep = (): Step => ({ title: "", text: "", formula: "", formula2: "" });

const emptyStatement = (label: 'a' | 'b' | 'c' | 'd'): Statement => ({
  label,
  claim: "",
  claim_latex: "",
  verdict: null,
  steps: [emptyStep()],
});

const emptyQuestion = (): Question => ({
  questionNo: "",
  qText: "",
  qFormula: "",
  type: "tu_luan",
  steps: [emptyStep()],
  statements: STMT_LABELS.map(emptyStatement),
});

// Normalize question từ JSON cũ (backward compat)
const normalizeQuestion = (q: any): Question => ({
  questionNo: q.question_no || q.questionNo || "",
  qText:      q.question_text || q.qText || "",
  qFormula:   q.question_latex || q.qFormula || "",
  type:       q.type === 'dung_sai' ? 'dung_sai' : 'tu_luan',
  steps:      q.steps?.length > 0 ? q.steps : [emptyStep()],
  statements: q.statements?.length > 0
    ? q.statements
    : STMT_LABELS.map(emptyStatement),
});

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS (KaTeX, TextWithMath, AutoResizeTextarea)
// ─────────────────────────────────────────────────────────────
function KatexSpan({ tex, block = false }: { tex: string; block?: boolean }) {
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current || !tex) return;
    try { katex.render(tex, ref.current as HTMLElement, { throwOnError: false, displayMode: block }); }
    catch (_) {}
  }, [tex, block]);
  return block
    ? <div ref={ref as React.RefObject<HTMLDivElement>} style={{ textAlign: "center", padding: "6px 0", overflowX: "auto" }} />
    : <span ref={ref as React.RefObject<HTMLSpanElement>} />;
}

const renderMath = (text: string) =>
  text.split(/(\$[^$]+\$|\\\([\s\S]*?\\\))/g).map((part, i) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 1)
      return <KatexSpan key={i} tex={part.slice(1, -1)} />;
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 3)
      return <KatexSpan key={i} tex={part.slice(2, -2)} />;
    return <span key={i}>{part}</span>;
  });

function TextWithMath({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(\[center\][\s\S]*?\[\/center\]|\[justify\][\s\S]*?\[\/justify\])/g).map((block, i) => {
        if (block.startsWith('[center]') && block.endsWith('[/center]'))
          return <div key={i} style={{ textAlign: 'center' }}>{renderMath(block.slice(8, -9))}</div>;
        if (block.startsWith('[justify]') && block.endsWith('[/justify]'))
          return <div key={i} style={{ textAlign: 'justify' }}>{renderMath(block.slice(9, -10))}</div>;
        return renderMath(block);
      })}
    </>
  );
}

function AutoResizeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [props.value]);

  const wrapText = (open: string, close: string) => {
    if (!ref.current) return;
    const el = ref.current, s = el.selectionStart || 0, e = el.selectionEnd || 0;
    const next = el.value.slice(0, s) + open + el.value.slice(s, e) + close + el.value.slice(e);
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => { el.focus(); el.setSelectionRange(s + open.length, s + open.length + (e - s)); }, 0);
  };

  return (
    <textarea ref={ref} {...props}
      style={{ overflow: "hidden", resize: "none", ...props.style }}
      onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); wrapText('[center]', '[/center]'); }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); wrapText('[justify]', '[/justify]'); }
        if (props.onKeyDown) props.onKeyDown(e);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// STEP EDITOR
// ─────────────────────────────────────────────────────────────
function StepEditor({
  step, idx, total, compact = false,
  onChange, onRemove, onMove, onFocus
}: {
  step: Step; idx: number; total: number; compact?: boolean;
  onChange: (idx: number, key: string, val: string) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: number) => void;
  onFocus: (fieldId: string, el: any) => void;
}) {
  const prefix = compact ? 'text-xs' : 'text-sm';
  return (
    <div className="bg-white border border-[#E9E9E7] rounded-xl overflow-hidden shadow-sm transition-all focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#FCFCFA] border-b border-[#E9E9E7]">
        <span className={`font-semibold ${prefix} text-indigo-700 flex items-center gap-2`}>
          <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
          Bước {idx + 1}
        </span>
        <div className="flex items-center gap-1">
          <button className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded" onClick={() => onMove(idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded" onClick={() => onMove(idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
          {total > 1 && <button className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded ml-1" onClick={() => onRemove(idx)}><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[10px] font-bold mb-1.5 text-[#787774] uppercase tracking-wider">Tiêu đề bước</label>
          <input className="w-full p-2 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm transition-colors"
            placeholder="VD: Áp dụng định lý động năng"
            value={step.title} onChange={e => onChange(idx, "title", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-1.5 text-[#787774] uppercase tracking-wider">Giải thích</label>
          <AutoResizeTextarea rows={2}
            className="w-full p-2 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm text-gray-700 transition-colors"
            placeholder="Mô tả cách làm..."
            value={step.text} onChange={e => onChange(idx, "text", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-1.5 text-[#787774] uppercase tracking-wider">Công thức 1 (LaTeX)</label>
          <AutoResizeTextarea rows={2}
            className="w-full p-2 rounded-lg border border-[#D3DBF9] outline-none focus:border-indigo-500 text-sm font-mono bg-[#EEF0FB] text-[#3D3D8D] transition-colors"
            placeholder="LaTeX..."
            value={step.formula} onChange={e => onChange(idx, "formula", e.target.value)}
            onFocus={e => onFocus(`step-f1-${idx}`, e.target)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-1.5 text-[#787774] uppercase tracking-wider">Công thức 2 (Tùy chọn)</label>
          <AutoResizeTextarea rows={2}
            className="w-full p-2 rounded-lg border border-[#D3DBF9] outline-none focus:border-indigo-500 text-sm font-mono bg-[#EEF0FB] text-[#3D3D8D] transition-colors"
            placeholder="LaTeX..."
            value={step.formula2} onChange={e => onChange(idx, "formula2", e.target.value)}
            onFocus={e => onFocus(`step-f2-${idx}`, e.target)} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATEMENT EDITOR (một mệnh đề đúng/sai)
// ─────────────────────────────────────────────────────────────
function StatementEditor({
  st, si,
  onUpdate,
  onFocus,
}: {
  st: Statement; si: number;
  onUpdate: (si: number, val: Statement) => void;
  onFocus: (fieldId: string, el: any) => void;
}) {
  const updStep    = (i: number, k: string, v: string) =>
    onUpdate(si, { ...st, steps: st.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) });
  const addStep    = () => onUpdate(si, { ...st, steps: [...st.steps, emptyStep()] });
  const removeStep = (i: number) => onUpdate(si, { ...st, steps: st.steps.filter((_, j) => j !== i) });
  const moveStep   = (i: number, dir: number) => {
    const arr = [...st.steps], j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onUpdate(si, { ...st, steps: arr });
  };

  const verdictStyle = {
    true:  { btn: 'bg-emerald-50 border-emerald-400 text-emerald-700 font-bold', ring: 'ring-2 ring-emerald-200' },
    false: { btn: 'bg-red-50 border-red-400 text-red-700 font-bold',           ring: 'ring-2 ring-red-200'     },
    null:  { btn: 'bg-[#F7F6F3] border-[#E9E9E7] text-[#787774]',             ring: '' },
  };
  const curStyle = verdictStyle[String(st.verdict) as 'true' | 'false' | 'null'];

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm mb-4 ${curStyle.ring} ${st.verdict === true ? 'border-emerald-300' : st.verdict === false ? 'border-red-300' : 'border-[#E9E9E7]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#FCFCFA] border-b border-[#E9E9E7]">
        <span className="font-bold text-sm text-indigo-700 tracking-wide">
          Mệnh đề {st.label.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#787774] font-semibold">Kết luận:</span>
          <button
            onClick={() => onUpdate(si, { ...st, verdict: st.verdict === true ? null : true })}
            className={`px-3 py-1 rounded-lg text-xs border transition-all ${st.verdict === true ? verdictStyle.true.btn : 'bg-[#F7F6F3] border-[#E9E9E7] text-[#787774] hover:border-emerald-300 hover:text-emerald-600'}`}
          >✓ Đúng</button>
          <button
            onClick={() => onUpdate(si, { ...st, verdict: st.verdict === false ? null : false })}
            className={`px-3 py-1 rounded-lg text-xs border transition-all ${st.verdict === false ? verdictStyle.false.btn : 'bg-[#F7F6F3] border-[#E9E9E7] text-[#787774] hover:border-red-300 hover:text-red-600'}`}
          >✗ Sai</button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Nội dung mệnh đề */}
        <div>
          <label className="block text-[10px] font-bold mb-1.5 text-[#787774] uppercase tracking-wider">Nội dung mệnh đề (chữ)</label>
          <AutoResizeTextarea rows={2}
            className="w-full p-2.5 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm text-gray-700 transition-colors"
            placeholder={`VD: Tốc độ electron trước khi vào vùng điện trường bằng 3,08×10⁷ m/s`}
            value={st.claim} onChange={e => onUpdate(si, { ...st, claim: e.target.value })} />
        </div>


        {/* Bước chứng minh */}
        <div className="pt-2 border-t border-[#E9E9E7]">
          <div className="text-[10px] font-bold text-[#787774] uppercase tracking-wider mb-3">
            Chứng minh / lý giải
          </div>
          <div className="space-y-3">
            {st.steps.map((step, i) => (
              <StepEditor key={i} step={step} idx={i} total={st.steps.length} compact
                onChange={updStep} onRemove={removeStep} onMove={moveStep}
                onFocus={(fid, el) => onFocus(`stmt-${si}-${fid}`, el)} />
            ))}
            <button
              onClick={addStep}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#DCDCDA] text-[#787774] text-xs font-semibold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-1.5"
            ><Plus className="w-3.5 h-3.5" /> Thêm bước chứng minh</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP PREVIEW (cho cả tự luận và bước chứng minh trong đúng/sai)
// ─────────────────────────────────────────────────────────────
function StepPreview({ step, index }: { step: Step; index: number }) {
  return (
    <div className="bg-white border border-[#E9E9E7] rounded-xl mb-3 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E9E9E7] bg-[#FCFCFA]">
        <span className="font-mono text-[11px] font-bold bg-[#6B7CDB] text-white w-5 h-5 rounded-full flex items-center justify-center shrink-0">{index + 1}</span>
        <span className="text-[12px] font-semibold text-[#1A1A1A]">{step.title ? <TextWithMath text={step.title} /> : <em className="text-[#AEACA8] font-normal">Chưa có tiêu đề</em>}</span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {step.text    && <p className="text-[13px] text-[#57564F] leading-relaxed m-0 whitespace-pre-wrap"><TextWithMath text={step.text} /></p>}
        {step.formula  && <KatexSpan tex={step.formula}  block />}
        {step.formula2 && <KatexSpan tex={step.formula2} block />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATEMENT PREVIEW (trong panel xem trước)
// ─────────────────────────────────────────────────────────────
function StatementPreview({ st }: { st: Statement }) {
  const verdictEl =
    st.verdict === true  ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ĐÚNG</span> :
    st.verdict === false ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-300">✗ SAI</span> :
                           <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">?</span>;

  const borderColor = st.verdict === true ? 'border-emerald-300' : st.verdict === false ? 'border-red-300' : 'border-[#E9E9E7]';

  return (
    <div className={`bg-white border rounded-xl mb-3 overflow-hidden shadow-sm ${borderColor}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E9E9E7] bg-[#FCFCFA]">
        <span className="font-bold text-sm text-indigo-700">Mệnh đề {st.label.toUpperCase()}</span>
        {verdictEl}
      </div>
      <div className="p-4 space-y-2">
        {st.claim      && <p className="text-[13px] text-[#1A1A1A] leading-relaxed m-0 whitespace-pre-wrap"><TextWithMath text={st.claim} /></p>}
        {st.claim_latex && <KatexSpan tex={st.claim_latex} block />}
        {st.steps.some(s => s.title || s.formula || s.text) && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#E9E9E7]">
            <div className="text-[10px] font-mono text-[#AEACA8] uppercase tracking-wider mb-2">Chứng minh</div>
            {st.steps.map((s, i) => (s.title || s.formula || s.text) ? <StepPreview key={i} step={s} index={i} /> : null)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
interface SolutionEditorProps {
  blog?: any;
  saveBlog?: (blog: any) => Promise<any>;
  deleteBlog?: (id: string) => Promise<boolean>;
  syncBlogs?: () => Promise<any>;
  onSaved?: (blog: any) => void;
  onBack?: () => void;
  switchToMarkdown?: () => void;
  switchToExamPaper?: () => void;
  hideTopBar?: boolean;
}

export default function SolutionEditor({
  blog, saveBlog, deleteBlog, syncBlogs, onSaved, onBack, switchToMarkdown, switchToExamPaper, hideTopBar
}: SolutionEditorProps) {
  const [examName,   setExamName]   = useState("");
  const [questions,  setQuestions]  = useState<Question[]>([emptyQuestion()]);
  const [activeQIdx, setActiveQIdx] = useState(0);
  const [saving,     setSaving]     = useState(false);

  const [category,     setCategory]     = useState("");
  const [tags,         setTags]         = useState<string[]>([]);
  const [isPublished,  setIsPublished]  = useState(false);
  const [grade,        setGrade]        = useState(0);

  // Local toast (dùng khi hideTopBar=true, vì global toast có thể không render trong context này)
  const [localToast, setLocalToast] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const localToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeRef   = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const activeField = useRef<string>("");
  const showGlobalToast = useUIStore(state => state.showToast);

  // Wrapper: hiển thị cả local toast (luôn) và global toast
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    showGlobalToast(msg, type);
    if (localToastTimer.current) clearTimeout(localToastTimer.current);
    setLocalToast({ msg, type });
    if (type !== 'warning') {
      localToastTimer.current = setTimeout(() => setLocalToast(null), 5000);
    }
  };

  const activeQuestion = questions[activeQIdx] ?? emptyQuestion();

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    if (!blog) return;
    setCategory(blog.category || "");
    setTags(blog.tags || []);
    setIsPublished(!!blog.is_published);
    setGrade(blog.grade || 0);

    if (blog.content) {
      try {
        const parsed = JSON.parse(blog.content);
        if (parsed.type === 'physics_solution' && parsed.data) {
          setExamName(parsed.data.exam_name || "");

          if (parsed.data.questions?.length > 0) {
            setQuestions(parsed.data.questions.map(normalizeQuestion));
          } else {
            // Backward compat: bài cũ chỉ có một câu ở root-level
            setQuestions([normalizeQuestion(parsed.data)]);
          }
        }
      } catch (e) {
        console.error("Failed to parse physics solution data", e);
      }
    }
  }, [blog]);

  // ── Snippet insert ─────────────────────────────────────────
  const trackFocus = useCallback((fieldId: string, el: any) => {
    activeRef.current   = el;
    activeField.current = fieldId;
  }, []);

  const insertSnippet = useCallback((tex: string) => {
    const el = activeRef.current;
    if (!el) return;
    const s = el.selectionStart || 0, e = el.selectionEnd || 0;
    el.value = el.value.slice(0, s) + tex + el.value.slice(e);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.setSelectionRange(s + tex.length, s + tex.length);
  }, []);

  // ── Question-level helpers ─────────────────────────────────
  const updateQ = (key: keyof Question, val: any) =>
    setQuestions(prev => prev.map((q, i) => i === activeQIdx ? { ...q, [key]: val } : q));

  const toggleType = () => {
    const next: QuestionType = activeQuestion.type === 'tu_luan' ? 'dung_sai' : 'tu_luan';
    updateQ('type', next);
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, emptyQuestion()]);
    setActiveQIdx(questions.length);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    if (!window.confirm("Bạn có chắc muốn xóa câu này?")) return;
    setQuestions(prev => prev.filter((_, i) => i !== idx));
    if (activeQIdx >= idx && activeQIdx > 0) setActiveQIdx(activeQIdx - 1);
  };

  // ── Steps (tự luận) ────────────────────────────────────────
  const updStep = (idx: number, key: string, val: string) =>
    updateQ('steps', activeQuestion.steps.map((s, i) => i === idx ? { ...s, [key]: val } : s));

  const addStep = () => updateQ('steps', [...activeQuestion.steps, emptyStep()]);

  const removeStep = (idx: number) =>
    updateQ('steps', activeQuestion.steps.filter((_, i) => i !== idx));

  const moveStep = (idx: number, dir: number) => {
    const arr = [...activeQuestion.steps], j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    updateQ('steps', arr);
  };

  // ── Statements (đúng/sai) ──────────────────────────────────
  const updStatement = (si: number, val: Statement) =>
    updateQ('statements', activeQuestion.statements.map((s, i) => i === si ? val : s));

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!examName || questions.some(q => !q.questionNo)) {
      showToast("Vui lòng nhập tên đề và số câu cho tất cả các câu!", "error");
      return;
    }
    setSaving(true);
    try {
      // Serialize mỗi câu hỏi tùy theo type
      const serializedQuestions = questions.map(q => ({
        question_no:    q.questionNo,
        question_text:  q.qText,
        question_latex: q.qFormula,
        type:           q.type,
        // Tự luận: lưu steps, statements là []
        steps:       q.type === 'tu_luan'  ? q.steps      : [],
        // Đúng/sai: lưu statements, steps là []
        statements:  q.type === 'dung_sai' ? q.statements : [],
      }));

      const solutionData = {
        type: 'physics_solution',
        data: {
          exam_name: examName,
          questions: serializedQuestions,
          // Backward compat: giữ root-level của câu đầu
          question_no:    questions[0].questionNo,
          question_text:  questions[0].qText,
          question_latex: questions[0].qFormula,
          steps:          questions[0].type === 'tu_luan' ? questions[0].steps : [],
        }
      };

      const titleStr = questions.length === 1
        ? `[Giải chi tiết] ${examName} - ${questions[0].questionNo}`
        : `[Giải chi tiết] ${examName} (${questions.length} câu)`;

      const payload = {
        id: blog?.id,
        title: titleStr,
        summary: (questions[0].qText || '').substring(0, 150) || 'Hướng dẫn giải chi tiết bằng LaTeX.',
        content: JSON.stringify(solutionData),
        category: category || 'Lời giải',
        is_published: isPublished,
        tags,
        grade,
      };

      if (saveBlog) {
        const saved = await saveBlog(payload);
        if (saved) {
          showToast("Đã lưu bài viết! Đang đồng bộ...", "warning");
          if (syncBlogs) await syncBlogs();
          showToast("Đã lưu và đồng bộ thành công!", "success");
          if (onSaved) onSaved(saved);
        } else throw new Error("Lưu thất bại.");
      } else {
        const { error } = await supabase.from("solutions").insert(solutionData.data);
        if (error) throw error;
        showToast("Đã lưu (standalone mode)!", "success");
        setQuestions([emptyQuestion()]);
      }
    } catch (err: any) {
      showToast("Lỗi: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={hideTopBar ? "space-y-6 font-sans" : "max-w-[1920px] w-full mx-auto p-4 md:p-8 space-y-6 animate-fade-in relative pb-20 font-sans"}>
      <style>{`.katex { color: #1A1A1A !important; }`}</style>

      {/* ── Top Bar ── (hidden when parent manages it) */}
      {!hideTopBar && (
      <div className="flex items-center justify-between flex-wrap gap-3">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-[#787774] hover:text-indigo-600 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Quay lại
          </button>
        )}
        <div className="flex items-center gap-3 bg-white p-1 rounded-xl border border-[#E9E9E7]">
          {switchToMarkdown && (
            <button onClick={switchToMarkdown} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#787774] hover:bg-gray-50">Markdown</button>
          )}
          <button className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#EEF0FB] text-[#6B7CDB]">Lời Giải (LaTeX)</button>
          {switchToExamPaper && (
            <button onClick={switchToExamPaper} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#787774] hover:bg-gray-50">Soạn Đề</button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {blog && deleteBlog && (
            <button onClick={async () => {
              if (!window.confirm("Xóa bài viết này?")) return;
              setSaving(true);
              const ok = await deleteBlog(blog.id);
              setSaving(false);
              if (ok && onBack) onBack();
            }} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-red-50 text-red-600 transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Xóa bài
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-sm">
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : (blog ? 'Cập nhật' : 'Đăng bài')}
          </button>
        </div>
      </div>
      )}

      {/* ── Publish settings ── */}
      <div className="bg-white p-4 rounded-2xl border border-[#E9E9E7] shadow-sm flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 relative z-10">
        <div className="flex items-center gap-3 shrink-0">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
            <div className="w-[34px] h-[20px] bg-[#CFCFCB] rounded-full peer peer-checked:after:translate-x-[14px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
          </label>
          <span className="text-xs font-semibold" style={{ color: isPublished ? '#448361' : '#787774' }}>
            {isPublished ? '✓ Công khai' : '✎ Nháp'}
          </span>
        </div>
        <div className="hidden lg:block w-px h-6 bg-[#E9E9E7]" />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-[#AEACA8] uppercase">Khối</span>
          <div className="flex bg-[#F7F6F3] p-1 rounded-lg border border-[#E9E9E7]">
            {[{ lab: 'Tất cả', val: 0 }, { lab: '12', val: 12 }, { lab: '11', val: 11 }, { lab: '10', val: 10 }].map(g => (
              <button key={g.val} type="button" onClick={() => setGrade(g.val)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{ background: grade === g.val ? '#6B7CDB' : 'transparent', color: grade === g.val ? '#fff' : '#787774' }}>
                {g.lab}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden lg:block w-px h-6 bg-[#E9E9E7]" />
        <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-bold text-[#AEACA8] uppercase shrink-0">Chuyên mục</span>
            <input type="text" list="sol-cat-list" placeholder="Chọn hoặc nhập..."
              className="w-full p-2.5 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm font-medium"
              value={category} onChange={e => setCategory(e.target.value)} />
            <datalist id="sol-cat-list">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="hidden md:block w-px h-6 bg-[#E9E9E7]" />
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-bold text-[#AEACA8] uppercase shrink-0">Thẻ</span>
            <input type="text" placeholder="vatly12, dongdien..."
              className="w-full p-2.5 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm font-medium"
              value={tags.join(', ')} onChange={e => setTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

        {/* ════════ EDITOR ════════ */}
        <div className="xl:col-span-6 flex flex-col gap-6">

          {/* Thông tin đề + Tabs câu */}
          <div className="p-6 rounded-2xl bg-white border border-[#E9E9E7] shadow-sm space-y-5">
            <h3 className="font-semibold text-[#1A1A1A] flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-indigo-500" /> Thông tin đề thi
            </h3>
            <div>
              <label className="block text-sm font-semibold mb-2 text-[#1A1A1A]">Tên đề thi / Nguồn</label>
              <input className="w-full p-3 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm transition-colors"
                placeholder="VD: THPT QG 2024"
                value={examName} onChange={e => setExamName(e.target.value)} />
            </div>

            {/* Tabs */}
            <div className="pt-2 border-t border-[#E9E9E7]">
              <div className="flex items-center flex-wrap gap-2 mb-4">
                {questions.map((q, idx) => (
                  <button key={idx} onClick={() => setActiveQIdx(idx)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeQIdx === idx ? 'bg-indigo-600 text-white shadow-sm' : 'bg-[#F7F6F3] text-[#787774] border border-[#E9E9E7] hover:bg-white'}`}>
                    {q.questionNo || `Câu ${idx + 1}`}
                    {/* Badge loại bài */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${activeQIdx === idx ? 'bg-indigo-500 text-indigo-100' : 'bg-gray-200 text-gray-500'}`}>
                      {q.type === 'dung_sai' ? 'Đ/S' : 'TL'}
                    </span>
                    {questions.length > 1 && (
                      <span onClick={e => { e.stopPropagation(); removeQuestion(idx); }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center -mr-1 ${activeQIdx === idx ? 'hover:bg-indigo-700 text-indigo-100' : 'hover:bg-red-100 text-red-400'}`}>
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                ))}
                <button onClick={addQuestion}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border-2 border-dashed border-[#DCDCDA] text-[#787774] hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Thêm câu
                </button>
              </div>

              {/* Info câu đang active */}
              <div className="space-y-4">
                {/* Toggle loại bài */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#F7F6F3] border border-[#E9E9E7]">
                  <span className="text-sm font-semibold text-[#57564F]">Loại câu hỏi</span>
                  <button onClick={toggleType}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeQuestion.type === 'dung_sai' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
                    {activeQuestion.type === 'dung_sai'
                      ? <><ToggleRight className="w-4 h-4" /> Đúng / Sai</>
                      : <><ToggleLeft  className="w-4 h-4" /> Tự luận</>}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-[#1A1A1A]">Số bài / Số câu</label>
                  <input className="w-full p-3 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm transition-colors"
                    placeholder="VD: Câu 4"
                    value={activeQuestion.questionNo} onChange={e => updateQ('questionNo', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-[#1A1A1A]">Mô tả đề bài (Text)</label>
                  <AutoResizeTextarea rows={2}
                    className="w-full p-3 rounded-lg border border-[#E9E9E7] outline-none focus:border-indigo-500 text-sm text-gray-700 transition-colors"
                    placeholder={activeQuestion.type === 'dung_sai'
                      ? "VD: Trong ống tia điện tử, người ta tạo ra chùm tia electron nhờ điện áp U = 2,70 kV..."
                      : "Một vật dao động điều hòa..."}
                    value={activeQuestion.qText} onChange={e => updateQ('qText', e.target.value)} />
                </div>

              </div>
            </div>
          </div>

          {/* ── TỰ LUẬN: bước giải ── */}
          {activeQuestion.type === 'tu_luan' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-[#1A1A1A] flex items-center gap-2 text-lg">
                <Layers className="w-5 h-5 text-indigo-500" /> Từng bước giải — {activeQuestion.questionNo || `Câu ${activeQIdx + 1}`}
              </h3>
              {activeQuestion.steps.map((step, idx) => (
                <StepEditor key={idx} step={step} idx={idx} total={activeQuestion.steps.length} compact
                  onChange={updStep} onRemove={removeStep} onMove={moveStep} onFocus={trackFocus} />
              ))}
              <button onClick={addStep}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#DCDCDA] text-[#787774] font-semibold text-xs hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-1.5"
              ><Plus className="w-3.5 h-3.5" /> Thêm bước tiếp theo</button>
            </div>
          )}

          {/* ── ĐÚNG/SAI: 4 mệnh đề ── */}
          {activeQuestion.type === 'dung_sai' && (
            <div className="space-y-2">
              <h3 className="font-semibold text-[#1A1A1A] flex items-center gap-2 text-lg mb-4">
                <Layers className="w-5 h-5 text-amber-500" /> Phân tích 4 mệnh đề — {activeQuestion.questionNo || `Câu ${activeQIdx + 1}`}
              </h3>
              {activeQuestion.statements.map((st, si) => (
                <StatementEditor key={si} st={st} si={si} onUpdate={updStatement} onFocus={trackFocus} />
              ))}
            </div>
          )}
        </div>

        {/* ════════ PREVIEW ════════ */}
        <div className="xl:col-span-6 h-[calc(100vh-200px)] sticky top-20">
          <div className="h-full border border-[#E9E9E7] rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E9E9E7] flex justify-between items-center bg-[#FCFCFA] shrink-0">
              <h3 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-500" /> Xem trước kết quả
              </h3>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-[#F7F6F3]" style={{ fontFamily: "'KaTeX_Main', 'Computer Modern', serif" }}>
              <style>{`.solution-editor-preview, .solution-editor-preview * { font-family: 'KaTeX_Main', 'Computer Modern', serif !important; } .solution-editor-preview .font-mono { font-family: monospace !important; }`}</style>
              <div className="solution-editor-preview space-y-12">
                {questions.map((q, qIdx) => (
                  <div key={qIdx} className={`space-y-5 ${qIdx !== activeQIdx ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                    {(examName || q.questionNo || q.qText || q.qFormula) && (
                      <div>
                        {examName && <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1.5">{examName}</div>}
                        <div className="font-bold text-2xl text-indigo-900 mb-1">{q.questionNo || `Câu ${qIdx + 1}`}</div>
                        {/* Badge loại bài */}
                        <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full mb-3 ${q.type === 'dung_sai' ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                          {q.type === 'dung_sai' ? 'Đúng / Sai' : 'Tự luận'}
                        </span>
                        <div className="bg-white border-l-[3px] border-indigo-400 rounded-r-xl p-5 shadow-sm">
                          {q.qText    && <p className="text-[14px] text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap"><TextWithMath text={q.qText} /></p>}
                          {q.qFormula && <KatexSpan tex={q.qFormula} block />}
                        </div>
                      </div>
                    )}

                    {/* Preview tự luận */}
                    {q.type === 'tu_luan' && q.steps.some((s: Step) => s.title || s.formula || s.text) && (
                      <div>
                        <div className="text-[10px] font-mono text-[#AEACA8] uppercase tracking-[0.15em] flex items-center gap-3 mb-4">
                          Lời giải chi tiết <div className="h-[1px] flex-1 bg-[#E9E9E7]" />
                        </div>
                        {q.steps.map((step: Step, idx: number) =>
                          (step.title || step.formula || step.text || step.formula2)
                            ? <StepPreview key={idx} step={step} index={idx} />
                            : null
                        )}
                      </div>
                    )}

                    {/* Preview đúng/sai */}
                    {q.type === 'dung_sai' && q.statements.some((s: Statement) => s.claim || s.claim_latex) && (
                      <div>
                        <div className="text-[10px] font-mono text-[#AEACA8] uppercase tracking-[0.15em] flex items-center gap-3 mb-4">
                          Phân tích mệnh đề <div className="h-[1px] flex-1 bg-[#E9E9E7]" />
                        </div>
                        {q.statements.map((st: Statement, i: number) =>
                          (st.claim || st.claim_latex)
                            ? <StatementPreview key={i} st={st} />
                            : null
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {!examName && !activeQuestion.qText && !activeQuestion.qFormula && (
                  <div className="flex flex-col items-center justify-center text-gray-400 mt-28 opacity-60">
                    <Eye className="w-12 h-12 mb-4" />
                    <p className="text-sm">Bắt đầu nhập liệu để xem trước...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Action bar + Local Toast (khi hideTopBar=true, parent không render nút lưu) ── */}
      {hideTopBar && (
        <div className="mt-6 pt-5 border-t border-[#E9E9E7] space-y-3">

          {/* Local toast */}
          {localToast && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                background: localToast.type === 'success' ? '#EAF3EE' : localToast.type === 'error' ? '#FEE2E2' : '#EEF0FB',
                border: `1px solid ${localToast.type === 'success' ? '#B7D9C4' : localToast.type === 'error' ? '#FECACA' : '#C5CAFA'}`,
                color: localToast.type === 'success' ? '#448361' : localToast.type === 'error' ? '#E03E3E' : '#3D3D8D',
              }}
            >
              {localToast.type === 'success' && <span>✓</span>}
              {localToast.type === 'error'   && <span>✗</span>}
              {localToast.type === 'warning' && <span className="animate-spin inline-block">↻</span>}
              {localToast.msg}
            </div>
          )}

          {/* Nút lưu */}
          <div className="flex items-center gap-3 flex-wrap">
            {blog && deleteBlog && (
              <button
                onClick={async () => {
                  if (!window.confirm('Xóa bài viết này?')) return;
                  setSaving(true);
                  const ok = await deleteBlog(blog.id);
                  setSaving(false);
                  if (ok && onBack) onBack();
                }}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-red-50 text-red-600 border border-red-200 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Xóa bài
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu & sync...' : (blog ? 'Cập nhật Lời Giải' : 'Đăng bài Lời Giải')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
