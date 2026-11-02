import React, { useState } from 'react';
import {
  X, RotateCcw, Palette, Droplets, Sliders, Layout,
  Layers, CheckSquare, FileText, Download, ExternalLink,
  ChevronDown, Check, Sparkles, Loader2, Printer
} from 'lucide-react';
import {
  ExamStyleConfig, DEFAULT_EXAM_STYLE, SelectedQuestionItem,
  generateExamLatex, downloadTexFile, openInOverleaf,
  printExamDirectlyToPdf
} from '../src/services/examLatexService';

interface ExamStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: SelectedQuestionItem[];
}

export const ExamStyleModal: React.FC<ExamStyleModalProps> = ({
  isOpen,
  onClose,
  questions,
}) => {
  const [config, setConfig] = useState<ExamStyleConfig>(DEFAULT_EXAM_STYLE);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileStatus, setCompileStatus] = useState<string>('');

  if (!isOpen) return null;

  const updateConfig = <K extends keyof ExamStyleConfig>(key: K, val: ExamStyleConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: val }));
  };

  const handleResetDefault = () => {
    if (window.confirm('Khôi phục toàn bộ cấu hình về mặc định?')) {
      setConfig(DEFAULT_EXAM_STYLE);
    }
  };

  // 1. Tải file .tex (mã nguồn cho ai cần)
  const handleDownloadTex = () => {
    const tex = generateExamLatex(questions, config);
    downloadTexFile(tex, `De_Thi_${config.subject}_Ma_${config.examCode}.tex`);
  };

  // 2. Xuất file PDF TRỰC TIẾP TRONG WEB (100% Client-side, không qua bên thứ 3)
  const handleExportPdf = async () => {
    setIsCompiling(true);
    setCompileStatus('Đang biên soạn đề thi...');
    const tex = generateExamLatex(questions, config);

    try {
      // 1. Thử gọi backend local compiler nếu có
      const res = await fetch('/api/compile-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tex, fileName: `De_Thi_${config.subject}_Ma_${config.examCode}` }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `De_Thi_${config.subject}_Ma_${config.examCode}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCompileStatus('Đã tải file PDF về máy!');
        setIsCompiling(false);
        return;
      }
    } catch (_) {
      // Fallback sang Engine in trực tiếp trong trình duyệt
    }

    // 2. Tự biên soạn và xuất PDF trực tiếp ngay trong trình duyệt (100% nội bộ)
    setCompileStatus('Đang mở bản in PDF...');
    printExamDirectlyToPdf(questions, config);

    setTimeout(() => {
      setIsCompiling(false);
      setCompileStatus('');
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-[#E9E9E7]">
        
        {/* ── HEADER MODAL (Đỏ đô Pimax) ── */}
        <div className="px-6 py-4 flex items-center justify-between text-white shrink-0 shadow-md" style={{ background: '#7B1113' }}>
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-amber-300" />
            <h2 className="text-lg font-bold tracking-wide">Tùy biến Style &amp; Layout</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefault}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> MẶC ĐỊNH
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── BODY SCROLLABLE (7 MỤC) ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FCFCFA] text-[#1A1A1A] text-sm">

          {/* ═══ MỤC 1. MẪU GIAO DIỆN & BẢNG MÀU LATEX ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-4">
            <div className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-4 h-4" /> 1. MẪU GIAO DIỆN &amp; BẢNG MÀU LATEX
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#57564F] mb-2">Màu chủ đạo đề thi:</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Pimax Red */}
                <div
                  onClick={() => updateConfig('isCustomColor', false)}
                  className={`p-3 rounded-xl border-2 cursor-pointer flex items-center gap-3 transition-all ${
                    !config.isCustomColor ? 'border-[#7B1113] bg-[#FFF8F8]' : 'border-[#E9E9E7] hover:border-gray-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#920000] shrink-0 shadow-sm" />
                  <div>
                    <div className="font-bold text-xs">Pimax Red</div>
                    <div className="text-[11px] text-[#787774]">#920000 (Mặc định)</div>
                  </div>
                </div>

                {/* Tùy chọn màu */}
                <div
                  onClick={() => updateConfig('isCustomColor', true)}
                  className={`p-3 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                    config.isCustomColor ? 'border-[#7B1113] bg-[#FFF8F8]' : 'border-[#E9E9E7] hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={config.customColor}
                      onChange={e => {
                        updateConfig('customColor', e.target.value);
                        updateConfig('isCustomColor', true);
                      }}
                      className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0"
                    />
                    <div>
                      <div className="font-bold text-xs">Tùy chọn màu</div>
                      <div className="text-[11px] text-[#787774] font-mono">{config.customColor}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Màu công thức toán */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA]">
              <span className="text-xs font-semibold text-[#57564F]">Màu công thức toán</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.mathColor}
                  onChange={e => updateConfig('mathColor', e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                />
                <span className="text-xs font-mono font-bold text-[#7B1113]">{config.mathColor}</span>
              </div>
            </div>

            {/* Gói Font Toán học */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#57564F]">Gói Font Toán học:</label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">3 Font</span>
              </div>
              <select
                value={config.mathFont}
                onChange={e => updateConfig('mathFont', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-[#E9E9E7] bg-white text-xs font-medium outline-none focus:border-[#7B1113]"
              >
                <option value="Latin Modern">Latin Modern (Chuẩn Overleaf)</option>
                <option value="Computer Modern">Computer Modern (Cổ điển)</option>
                <option value="Times New Roman">Times New Roman</option>
              </select>
            </div>
          </div>

          {/* ═══ MỤC 2. WATERMARK ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
                <Droplets className="w-4 h-4" /> 2. WATERMARK
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.enableWatermark}
                  onChange={e => updateConfig('enableWatermark', e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7B1113]" />
              </label>
            </div>
            {config.enableWatermark && (
              <input
                type="text"
                value={config.watermarkText}
                onChange={e => updateConfig('watermarkText', e.target.value)}
                placeholder="Nhập nội dung Watermark..."
                className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs outline-none focus:border-[#7B1113]"
              />
            )}
          </div>

          {/* ═══ MỤC 3. THUỘC TÍNH KHUNG ĐỀ (BOX & CONTENT) ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
                <Layout className="w-4 h-4" /> 3. THUỘC TÍNH KHUNG ĐỀ (BOX &amp; CONTENT)
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.enableBox}
                  onChange={e => updateConfig('enableBox', e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7B1113]" />
              </label>
            </div>

            {config.enableBox && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-[#787774] mb-1">Tiêu đề cấp trên</label>
                    <input
                      type="text"
                      value={config.headerTitle}
                      onChange={e => updateConfig('headerTitle', e.target.value)}
                      placeholder="VD: SỞ GD&ĐT AN GIANG"
                      className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#787774] mb-1">Mã đề</label>
                    <input
                      type="text"
                      value={config.examCode}
                      onChange={e => updateConfig('examCode', e.target.value)}
                      placeholder="101"
                      className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#787774] mb-1">Tên trường / Đơn vị</label>
                  <input
                    type="text"
                    value={config.schoolName}
                    onChange={e => updateConfig('schoolName', e.target.value)}
                    placeholder="VD: TRƯỜNG THPT CHUYÊN THỰC HÀNH"
                    className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#787774] mb-1">Tên kỳ thi / Đề thi</label>
                  <input
                    type="text"
                    value={config.examName}
                    onChange={e => updateConfig('examName', e.target.value)}
                    placeholder="VD: KỲ THI THỬ TỐT NGHIỆP THPT"
                    className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#787774] mb-1">Môn thi</label>
                    <input
                      type="text"
                      value={config.subject}
                      onChange={e => updateConfig('subject', e.target.value)}
                      placeholder="Vật lý"
                      className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#787774] mb-1">Thời gian (phút)</label>
                    <input
                      type="number"
                      value={config.duration}
                      onChange={e => updateConfig('duration', parseInt(e.target.value, 10) || 50)}
                      className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#787774] mb-1">Tiền tố nhãn câu</label>
                    <input
                      type="text"
                      value={config.questionPrefix}
                      onChange={e => updateConfig('questionPrefix', e.target.value)}
                      placeholder="Câu"
                      className="w-full p-2.5 rounded-lg border border-[#E9E9E7] text-xs font-medium outline-none focus:border-[#7B1113]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ MỤC 4. CẤU HÌNH HEADER & FOOTER ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-4">
            <div className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> 4. CẤU HÌNH HEADER &amp; FOOTER
            </div>

            {/* Header Box */}
            <div className="p-4 rounded-xl border border-[#E9E9E7] bg-[#FAFAFA] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#57564F]">Tiêu đề đầu trang (Header)</span>
                <div className="flex items-center gap-1.5 text-xs text-[#787774]">
                  <span>Kẻ viền:</span>
                  <input
                    type="number"
                    value={config.headerRuleWidth}
                    onChange={e => updateConfig('headerRuleWidth', parseFloat(e.target.value) || 0)}
                    className="w-12 p-1 rounded border border-[#E9E9E7] text-center text-xs"
                  />
                  <span>pt</span>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={config.headerLeft}
                  onChange={e => updateConfig('headerLeft', e.target.value)}
                  placeholder="Header Trái..."
                  className="w-full p-2 rounded border border-[#E9E9E7] text-xs font-mono bg-white"
                />
                <input
                  type="text"
                  value={config.headerRight}
                  onChange={e => updateConfig('headerRight', e.target.value)}
                  placeholder="Header Phải (VD: Thầy Cô biên soạn)..."
                  className="w-full p-2 rounded border border-[#E9E9E7] text-xs font-mono bg-white"
                />
              </div>
            </div>

            {/* Footer Box */}
            <div className="p-4 rounded-xl border border-[#E9E9E7] bg-[#FAFAFA] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[#57564F]">Chân trang (Footer)</span>
                <div className="flex items-center gap-1.5 text-xs text-[#787774]">
                  <span>Kẻ viền:</span>
                  <input
                    type="number"
                    value={config.footerRuleWidth}
                    onChange={e => updateConfig('footerRuleWidth', parseFloat(e.target.value) || 0)}
                    className="w-12 p-1 rounded border border-[#E9E9E7] text-center text-xs"
                  />
                  <span>pt</span>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={config.footerCenter}
                  onChange={e => updateConfig('footerCenter', e.target.value)}
                  placeholder="Footer Giữa (VD: Trang \thepage / \pageref{LastPage})"
                  className="w-full p-2 rounded border border-[#E9E9E7] text-xs font-mono bg-white"
                />
              </div>
            </div>
          </div>

          {/* ═══ MỤC 6. TÙY CHỌN XUẤT BẢN (OUTPUT OPTIONS) ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-3">
            <div className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4" /> 6. TÙY CHỌN XUẤT BẢN (OUTPUT OPTIONS)
            </div>

            <div className="space-y-2">
              {/* Xuất bảng đáp án */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA]">
                <div>
                  <div className="font-semibold text-xs text-[#1A1A1A]">Xuất bảng đáp án</div>
                  <div className="text-[11px] text-[#787774]">Chèn bảng đáp án tổng hợp ở cuối đề thi</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.exportAnswerTable}
                    onChange={e => updateConfig('exportAnswerTable', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7B1113]" />
                </label>
              </div>

              {/* Xuất lời giải chi tiết */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA]">
                <div>
                  <div className="font-semibold text-xs text-[#1A1A1A]">Xuất lời giải chi tiết</div>
                  <div className="text-[11px] text-[#787774]">Đính kèm hướng dẫn giải chi tiết cho từng câu hỏi</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.exportDetailedSolution}
                    onChange={e => updateConfig('exportDetailedSolution', e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7B1113]" />
                </label>
              </div>
            </div>
          </div>

          {/* ═══ MỤC 7. TIÊU ĐỀ PHẦN THI (CHUẨN BỘ GD) ═══ */}
          <div className="bg-white p-5 rounded-xl border border-[#E9E9E7] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#7B1113] uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4" /> 7. TIÊU ĐỀ PHẦN THI
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.enableSectionTitles}
                  onChange={e => updateConfig('enableSectionTitles', e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7B1113]" />
              </label>
            </div>

            {config.enableSectionTitles && (
              <div className="space-y-3 pt-2">
                {/* Phần Trắc nghiệm 4 PA */}
                <div className="p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA] space-y-2">
                  <label className="block text-xs font-semibold text-[#57564F]">Tiêu đề — Trắc nghiệm 4 PA</label>
                  <input
                    type="text"
                    value={config.choice4Title}
                    onChange={e => updateConfig('choice4Title', e.target.value)}
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs bg-white"
                  />
                  <input
                    type="text"
                    value={config.choice4Note}
                    onChange={e => updateConfig('choice4Note', e.target.value)}
                    placeholder="Ghi chú in nghiêng..."
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs italic bg-white"
                  />
                </div>

                {/* Phần Đúng / Sai */}
                <div className="p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA] space-y-2">
                  <label className="block text-xs font-semibold text-[#57564F]">Tiêu đề — Đúng / Sai</label>
                  <input
                    type="text"
                    value={config.trueFalseTitle}
                    onChange={e => updateConfig('trueFalseTitle', e.target.value)}
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs bg-white"
                  />
                  <input
                    type="text"
                    value={config.trueFalseNote}
                    onChange={e => updateConfig('trueFalseNote', e.target.value)}
                    placeholder="Ghi chú in nghiêng..."
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs italic bg-white"
                  />
                </div>

                {/* Phần Tự luận */}
                <div className="p-3 rounded-lg border border-[#E9E9E7] bg-[#FAFAFA] space-y-2">
                  <label className="block text-xs font-semibold text-[#57564F]">Tiêu đề — Tự luận / Trả lời ngắn</label>
                  <input
                    type="text"
                    value={config.essayTitle}
                    onChange={e => updateConfig('essayTitle', e.target.value)}
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs bg-white"
                  />
                  <input
                    type="text"
                    value={config.essayNote}
                    onChange={e => updateConfig('essayNote', e.target.value)}
                    placeholder="Ghi chú in nghiêng..."
                    className="w-full p-2 rounded border border-[#E9E9E7] text-xs italic bg-white"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── FOOTER MODAL: NÚT XUẤT ĐỀ TRỰC TIẾP TRONG WEB ── */}
        <div className="px-6 py-4 bg-white border-t border-[#E9E9E7] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[#787774]">
            Đã chọn: <b className="text-[#1A1A1A]">{questions.length}</b> câu hỏi vào đề
          </div>

          <div className="flex items-center gap-3">
            {/* Tải .tex */}
            <button
              onClick={handleDownloadTex}
              title="Tải mã nguồn TeX về máy"
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#E9E9E7] hover:bg-gray-50 text-[#57564F] transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Mã nguồn .tex
            </button>

            {/* Nút chính: TỰ BIÊN SOẠN & XUẤT PDF TRỰC TIẾP TRONG WEB */}
            <button
              onClick={handleExportPdf}
              disabled={isCompiling}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50"
              style={{ background: '#7B1113' }}
            >
              {isCompiling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{compileStatus || 'Đang biên soạn...'}</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 text-amber-300" />
                  <span>XUẤT ĐỀ THI RA PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ExamStyleModal;
