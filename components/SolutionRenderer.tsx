// SolutionRenderer.tsx
// Component phía học sinh — tự nhận diện type (tu_luan | dung_sai)
// Tương thích ngược với data cũ không có `type`
//
// Usage:
//   import SolutionRenderer from './SolutionRenderer'
//   <SolutionRenderer content={blog.content} />

import React, { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { SolutionStep as Step, SolutionStatement as Statement } from '../types';

interface Question {
  question_no: string;
  question_text: string;
  question_latex: string;
  type?: 'tu_luan' | 'dung_sai' | 'trac_nghiem';
  solution?: string;
  steps: Step[];
  statements: Statement[];
  choices?: string[];
  correctChoice?: string;
  solutionSteps?: Step[];
}

interface PhysicsSolutionData {
  exam_name: string;
  questions?: Question[];
  // root-level backward compat
  question_no?: string;
  question_text?: string;
  question_latex?: string;
  steps?: Step[];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Parse blog.content (JSON string) → danh sách Question đã normalize
function parseContent(content: string): { examName: string; questions: Question[] } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type !== 'physics_solution' || !parsed.data) return null;

    const data: PhysicsSolutionData = parsed.data;
    const examName = data.exam_name || "";

    let questions: Question[];

    if (data.questions && data.questions.length > 0) {
      questions = data.questions.map(q => ({
        question_no:    q.question_no    || "",
        question_text:  q.question_text  || "",
        question_latex: q.question_latex || "",
        type:           q.type === 'dung_sai' ? 'dung_sai' : q.type === 'trac_nghiem' ? 'trac_nghiem' : 'tu_luan',
        steps:          q.steps          || [],
        statements:     q.statements     || [],
        choices:        q.choices        || [],
        correctChoice:  q.correctChoice  || '',
        solutionSteps:  q.solutionSteps  || [],
        solution:       q.solution       || "",
      }));
    } else {
      // Backward compat: câu duy nhất ở root-level, không có `type`
      questions = [{
        question_no:    data.question_no    || "",
        question_text:  data.question_text  || "",
        question_latex: data.question_latex || "",
        type:           'tu_luan',
        steps:       data.steps || [],
        statements:  [],
        solution:    (data as any).solution || "",
      }];
    }

    return { examName, questions };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// KATEX & TEXT
// ─────────────────────────────────────────────────────────────
function KatexBlock({ tex }: { tex: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !tex?.trim()) return;
    try { katex.render(tex, ref.current, { throwOnError: false, displayMode: true }); }
    catch (_) {}
  }, [tex]);
  return <div ref={ref} style={{ textAlign: "center", padding: "6px 0", overflowX: "auto" }} />;
}

function KatexInline({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current || !tex?.trim()) return;
    try { katex.render(tex, ref.current, { throwOnError: false, displayMode: false }); }
    catch (_) {}
  }, [tex]);
  return <span ref={ref} />;
}

function renderInlineMath(text: string): React.ReactNode[] {
  return text.split(/(\$(?!\$)[^$\n]+(?<!\$)\$|\\\([\s\S]*?\\\))/g).map((part, i) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2 && !part.startsWith('$$')) {
      return <KatexInline key={i} tex={part.slice(1, -1).trim()} />;
    }
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 3) {
      return <KatexInline key={i} tex={part.slice(2, -2).trim()} />;
    }
    return <span key={i}>{part}</span>;
  });
}

function TextWithMath({ text }: { text: string }) {
  if (!text) return null;
  const clean = text.replace(/\[\/?justify\]/gi, '');
  const rawLines = clean.split('\n');

  const elements: React.ReactNode[] = [];
  let inBlockMath = false;
  let blockMathBuffer: string[] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      if (!inBlockMath) {
        elements.push(<div key={`empty-${idx}`} className="h-2" />);
      }
      continue;
    }

    // Dòng chứa công thức độc lập $$...$$ (căn giữa 100%, đứng riêng một dòng)
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 3) {
      const tex = trimmed.slice(2, -2).trim();
      elements.push(
        <div key={`bm-${idx}`} className="my-2.5 text-center overflow-x-auto">
          <KatexBlock tex={tex} />
        </div>
      );
      continue;
    }

    // Dòng chứa công thức độc lập \[...\]
    if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 3) {
      const tex = trimmed.slice(2, -2).trim();
      elements.push(
        <div key={`bm-${idx}`} className="my-2.5 text-center overflow-x-auto">
          <KatexBlock tex={tex} />
        </div>
      );
      continue;
    }

    // Multi-line block math bắt đầu bằng $$
    if (trimmed.startsWith('$$')) {
      inBlockMath = true;
      blockMathBuffer = [trimmed.slice(2)];
      continue;
    }

    if (inBlockMath) {
      if (trimmed.endsWith('$$')) {
        blockMathBuffer.push(trimmed.slice(0, -2));
        const tex = blockMathBuffer.join('\n').trim();
        elements.push(
          <div key={`bmm-${idx}`} className="my-2.5 text-center overflow-x-auto">
            <KatexBlock tex={tex} />
          </div>
        );
        blockMathBuffer = [];
        inBlockMath = false;
      } else {
        blockMathBuffer.push(line);
      }
      continue;
    }

    // Thẻ [center]...[/center]
    if (trimmed.startsWith('[center]') && trimmed.endsWith('[/center]')) {
      const inner = trimmed.slice(8, -9);
      elements.push(
        <div key={`c-${idx}`} className="my-1 text-center">
          {renderInlineMath(inner)}
        </div>
      );
      continue;
    }

    // Dòng văn bản bình thường (tự động căn đều 2 bên mép, công thức $...$ nằm gọn gàng)
    elements.push(
      <div key={`t-${idx}`} style={{ textAlign: 'justify', textJustify: 'inter-word' }} className="leading-relaxed my-0.5">
        {renderInlineMath(line)}
      </div>
    );
  }

  return <div className="space-y-1">{elements}</div>;
}

// ─────────────────────────────────────────────────────────────
// STEP RENDERER (dùng chung cho cả hai loại)
// ─────────────────────────────────────────────────────────────
function StepRenderer({ step, index }: { step: Step; index: number }) {
  if (!step.title && !step.text && !step.formula && !step.formula2) return null;
  return (
    <div className="bg-white border border-[#E9E9E7] rounded-xl mb-4 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#E9E9E7] bg-[#FCFCFA]">
        <span className="font-mono text-[11px] font-bold bg-[#6B7CDB] text-white w-6 h-6 rounded-full flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        {step.title && (
          <span className="text-[13px] font-semibold text-[#1A1A1A]"><TextWithMath text={step.title} /></span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-3">
        {step.text    && (
          <p className="text-[15px] text-[#57564F] leading-relaxed m-0 whitespace-pre-wrap">
            <TextWithMath text={step.text} />
          </p>
        )}
        {step.formula  && <KatexBlock tex={step.formula} />}
        {step.formula2 && <KatexBlock tex={step.formula2} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TỰ LUẬN RENDERER
// ─────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// TRẮC NGHIỆM RENDERER
// ──────────────────────────────────────────────────────────────
function TracNghiemRenderer({ question }: { question: Question }) {
  const choices  = question.choices  || [];
  const correct  = question.correctChoice || '';
  const solSteps = question.solutionSteps || [];
  return (
    <div className="space-y-5">
      <QuestionHeader question={question} />
      {/* 4 đáp án A/B/C/D */}
      <div className="space-y-2">
        {['A','B','C','D'].map((lbl, ci) => choices[ci] ? (
          <div key={lbl}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors"
            style={{
              background: correct === lbl ? '#EAF3EE' : '#fff',
              borderColor: correct === lbl ? '#44836150' : '#E9E9E7',
            }}>
            <span
              className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shrink-0"
              style={{
                background: correct === lbl ? '#448361' : '#F1F0EC',
                color:      correct === lbl ? '#fff' : '#787774',
              }}>{lbl}</span>
            <span className="text-[15px] text-[#1A1A1A] leading-relaxed flex-1">
              <TextWithMath text={choices[ci]} />
            </span>
            {correct === lbl && (
              <span className="text-xs font-bold text-emerald-600 shrink-0">✓ Đúng</span>
            )}
          </div>
        ) : null)}
      </div>
      {/* Lời giải */}
      {(question.solution || solSteps.some(s => s.title || s.text || s.formula)) && (
        <div>
          <SectionLabel>Lời giải chi tiết</SectionLabel>
          {question.solution ? (
            <div className="bg-white border border-[#E9E9E7] rounded-xl p-5 shadow-sm text-[15px] text-[#1A1A1A] leading-relaxed">
              <TextWithMath text={question.solution} />
            </div>
          ) : (
            solSteps.map((s, i) =>
              (s.title || s.text || s.formula || s.formula2)
                ? <StepRenderer key={i} step={s} index={i} />
                : null
            )
          )}
        </div>
      )}
    </div>
  );
}

function TuLuanRenderer({ question }: { question: Question }) {
  const hasSteps = question.steps.some(s => s.title || s.formula || s.text || s.formula2);
  return (
    <div className="space-y-6">
      {/* Đề bài */}
      <QuestionHeader question={question} />

      {/* Lời giải */}
      {(question.solution || hasSteps) && (
        <div>
          <SectionLabel>Lời giải chi tiết</SectionLabel>
          {question.solution ? (
            <div className="bg-white border border-[#E9E9E7] rounded-xl p-5 shadow-sm text-[15px] text-[#1A1A1A] leading-relaxed">
              <TextWithMath text={question.solution} />
            </div>
          ) : (
            question.steps.map((step, idx) => (
              <StepRenderer key={idx} step={step} index={idx} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ĐÚNG/SAI RENDERER
// ─────────────────────────────────────────────────────────────
function DungSaiRenderer({ question }: { question: Question }) {
  const hasStatements = question.statements.some(s => s.claim || s.claim_latex);
  const trueCount  = question.statements.filter(s => s.verdict === true).length;
  const falseCount = question.statements.filter(s => s.verdict === false).length;

  return (
    <div className="space-y-6">
      {/* Đề bài */}
      <QuestionHeader question={question} />

      {/* Tổng kết verdict */}
      {hasStatements && (trueCount + falseCount > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-[#57564F]">Tổng kết:</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
            ✓ {trueCount} mệnh đề đúng
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-300">
            ✗ {falseCount} mệnh đề sai
          </span>
        </div>
      )}

      {/* Các mệnh đề */}
      {hasStatements && (
        <div>
          <SectionLabel>Phân tích 4 mệnh đề</SectionLabel>
          <div className="space-y-4">
            {question.statements.map((st, i) => (
              (st.claim || st.claim_latex) ? <StatementRenderer key={i} st={st} /> : null
            ))}
          </div>
        </div>
      )}

      {/* Lời giải chi tiết chung */}
      {question.solution && (
        <div className="mt-6">
          <SectionLabel>Hướng dẫn giải chi tiết</SectionLabel>
          <div className="bg-white border border-[#E9E9E7] rounded-xl p-5 shadow-sm text-[15px] text-[#1A1A1A] leading-relaxed">
            <TextWithMath text={question.solution} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATEMENT RENDERER (một mệnh đề)
// ─────────────────────────────────────────────────────────────
function StatementRenderer({ st }: { st: Statement }) {
  const isTrue  = st.verdict === true;
  const isFalse = st.verdict === false;

  const borderColor = isTrue ? 'border-emerald-300' : isFalse ? 'border-red-300' : 'border-[#E9E9E7]';
  const headBg      = isTrue ? 'bg-emerald-50'      : isFalse ? 'bg-red-50'      : 'bg-[#FCFCFA]';

  const VerdictBadge = () => {
    if (isTrue)  return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ĐÚNG</span>;
    if (isFalse) return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-300">✗ SAI</span>;
    return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Chưa kết luận</span>;
  };

  const hasProof = st.steps?.some(s => s.title || s.text || s.formula);

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${borderColor}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${borderColor} ${headBg}`}>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center text-white ${isTrue ? 'bg-emerald-500' : isFalse ? 'bg-red-500' : 'bg-[#6B7CDB]'}`}>
            {st.label.toUpperCase()}
          </span>
          <span className="font-bold text-sm text-[#1A1A1A]">Mệnh đề {st.label.toUpperCase()}</span>
        </div>
        <VerdictBadge />
      </div>

      {/* Nội dung mệnh đề */}
      <div className="px-5 pt-4 pb-3">
        {st.claim && (
          <p className="text-[15px] text-[#1A1A1A] leading-relaxed mb-3 whitespace-pre-wrap">
            <TextWithMath text={st.claim} />
          </p>
        )}
        {st.claim_latex && <KatexBlock tex={st.claim_latex} />}
      </div>

      {/* Chứng minh */}
      {hasProof && (
        <div className="px-5 pb-5">
          <div className="pt-3 border-t border-dashed border-[#E9E9E7]">
            <div className="text-[10px] font-mono font-bold text-[#AEACA8] uppercase tracking-[0.15em] mb-3">
              Chứng minh
            </div>
            {st.steps.map((s, i) => (s.title || s.text || s.formula || s.formula2) ? <StepRenderer key={i} step={s} index={i} /> : null)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED PIECES
// ─────────────────────────────────────────────────────────────
function QuestionHeader({ question }: { question: Question }) {
  const isDungSai    = question.type === 'dung_sai';
  const isTracNghiem = question.type === 'trac_nghiem';
  if (!question.question_text && !question.question_latex) return null;
  return (
    <div>
      {question.question_no && (
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-bold text-xl text-indigo-900">{question.question_no}</h2>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${isDungSai ? 'bg-amber-100 text-amber-700 border-amber-300' : isTracNghiem ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
            {isDungSai ? 'Đúng / Sai' : isTracNghiem ? 'Trắc nghiệm' : 'Tự luận'}
          </span>
        </div>
      )}
      <div className="bg-white border-l-[3px] border-indigo-400 rounded-r-xl p-5 shadow-sm">
        {question.question_text && (
          <p className="text-[15px] text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap">
            <TextWithMath text={question.question_text} />
          </p>
        )}
        {question.question_latex && <KatexBlock tex={question.question_latex} />}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono text-[#AEACA8] uppercase tracking-[0.15em] flex items-center gap-3 mb-5">
      {children}
      <div className="h-[1px] flex-1 bg-[#E9E9E7]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────
interface SolutionRendererProps {
  content: string;    // blog.content (JSON string)
  className?: string;
}

export default function SolutionRenderer({ content, className = "" }: SolutionRendererProps) {
  const parsed = parseContent(content);

  if (!parsed) {
    return (
      <div className={`p-8 text-center text-gray-400 ${className}`}>
        <p className="text-sm">Không thể tải nội dung bài giải.</p>
      </div>
    );
  }

  const { examName, questions } = parsed;

  return (
    <div className={`solution-renderer space-y-12 font-sans ${className}`} style={{ fontFamily: "'KaTeX_Main', 'Computer Modern', serif" }}>
      <style>{`.katex { color: #1A1A1A !important; } .solution-renderer, .solution-renderer * { font-family: 'KaTeX_Main', 'Computer Modern', serif !important; } .solution-renderer .font-mono, .solution-renderer span.font-mono { font-family: monospace !important; }`}</style>

      {/* Tên đề thi */}
      {examName && (
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider pb-2 border-b border-[#E9E9E7]">
          {examName}
        </div>
      )}

      {/* Từng câu hỏi */}
      {questions.map((q, idx) => (
        <div key={idx} className="space-y-6">
          {/* Đường phân cách giữa các câu */}
          {idx > 0 && <div className="h-px bg-[#E9E9E7] my-8" />}

          {/* Router: tự luận / đúng sài / trắc nghiệm */}
          {q.type === 'dung_sai'
            ? <DungSaiRenderer   question={q} />
            : q.type === 'trac_nghiem'
            ? <TracNghiemRenderer question={q} />
            : <TuLuanRenderer    question={q} />
          }
        </div>
      ))}
    </div>
  );
}
