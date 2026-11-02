// src/services/examLatexService.ts
// Engine sinh mã LaTeX chuẩn TeX/Overleaf & xử lý xuất bản đề thi

export interface ExamStyleConfig {
  // 1. Mẫu giao diện & Bảng màu LaTeX
  themeColor: string; // #920000 Pimax Red, #000092...
  customColor: string;
  isCustomColor: boolean;
  mathColor: string; // #000000
  mathFont: string; // 'Latin Modern' | 'Computer Modern' | 'Times New Roman'

  // 2. Watermark
  enableWatermark: boolean;
  watermarkText: string;

  // 3. Thuộc tính khung đề (Box & Content)
  enableBox: boolean;
  boxStyle: string; // 'Mẫu 0 (Mặc định)'
  headerTitle: string; // 'SỞ GD&ĐT AN GIANG'
  examCode: string; // '101'
  schoolName: string; // 'PHỔ THÔNG THỰC HÀNH SƯ PHẠM'
  examName: string; // 'TIAD QUESTIONS-BANK'
  subject: string; // 'Vật lý'
  duration: number; // 50
  questionPrefix: string; // 'Câu'

  // 4. Cấu hình Header & Footer
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
  headerRuleWidth: number; // pt
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  footerRuleWidth: number; // pt

  // 5. Thư viện giao diện mẫu
  choice4Template: string;
  trueFalseTemplate: string;
  shortAnswerTemplate: string;
  sectionTemplate: string;

  // 6. Tùy chọn xuất bản
  exportAnswerTable: boolean; // Xuất bảng đáp án ở cuối trang
  exportDetailedSolution: boolean; // Xuất lời giải chi tiết

  // 7. Tiêu đề phần thi
  enableSectionTitles: boolean;
  choice4Title: string;
  choice4Note: string;
  trueFalseTitle: string;
  trueFalseNote: string;
  shortAnswerTitle: string;
  shortAnswerNote: string;
  essayTitle: string;
  essayNote: string;
}

export const DEFAULT_EXAM_STYLE: ExamStyleConfig = {
  themeColor: '#920000',
  customColor: '#000092',
  isCustomColor: false,
  mathColor: '#000000',
  mathFont: 'Latin Modern',

  enableWatermark: false,
  watermarkText: 'PHYSI VAULT',

  enableBox: true,
  boxStyle: 'Mẫu 0 (Mặc định)',
  headerTitle: 'SỞ GD&ĐT AN GIANG',
  examCode: '101',
  schoolName: 'PHỔ THÔNG THỰC HÀNH SƯ PHẠM',
  examName: 'TIAD QUESTIONS-BANK',
  subject: 'Vật lý',
  duration: 50,
  questionPrefix: 'Câu',

  headerLeft: '{\\large \\faFolder}\\,$\\mid$,KỲ THI THỬ TN THPT NĂM 2026',
  headerCenter: '',
  headerRight: 'THẦY DƯƠNG MINH ĐỨC',
  headerRuleWidth: 1,

  footerLeft: '',
  footerCenter: '\\MakeUppercase{Trang}~\\thepage\\ / \\pageref{LastPage}',
  footerRight: '',
  footerRuleWidth: 1,

  choice4Template: 'Mẫu 0 (Mặc định)',
  trueFalseTemplate: 'Mẫu 0 (Mặc định)',
  shortAnswerTemplate: 'Mẫu 0 (Mặc định)',
  sectionTemplate: 'Mẫu 0 (Mặc định)',

  exportAnswerTable: true,
  exportDetailedSolution: true,

  enableSectionTitles: true,
  choice4Title: 'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN',
  choice4Note: 'Thí sinh trả lời từ câu 1 đến câu n. Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
  trueFalseTitle: 'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI',
  trueFalseNote: 'Thí sinh trả lời từ câu 1 đến câu n. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.',
  shortAnswerTitle: 'PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN',
  shortAnswerNote: 'Thí sinh trả lời từ câu 1 đến câu n. Thí sinh điền kết quả vào ô tương ứng.',
  essayTitle: 'PHẦN IV. TỰ LUẬN',
  essayNote: 'Thí sinh trình bày lời giải chi tiết vào giấy thi.',
};

export interface SelectedQuestionItem {
  id: string;
  questionNo: string;
  qText: string;
  qFormula?: string;
  type: 'trac_nghiem' | 'dung_sai' | 'tu_luan';
  solution?: string;
  choices?: string[];
  correctChoice?: string;
  statements?: Array<{ label: string; claim: string; verdict?: boolean | null; steps?: any[] }>;
  solutionSteps?: Array<{ title?: string; text?: string; formula?: string; formula2?: string }>;
  steps?: Array<{ title?: string; text?: string; formula?: string; formula2?: string }>;
  level?: number;
}

/**
 * Thuật toán tính chiều ngang đáp án trắc nghiệm 4 phương án:
 * - 4 cột (1 dòng): nếu đáp án ngắn (số, đơn vị, từ đơn)
 * - 2 cột (2 dòng): nếu đáp án dài vừa phải
 * - 1 cột (4 dòng): nếu đáp án dài (câu lý thuyết hoặc công thức phức tạp)
 */
export function calculateChoiceLayout(choices: string[]): 1 | 2 | 4 {
  if (!choices || choices.length === 0) return 1;

  // Lược bỏ bớt cú pháp LaTeX để ước lượng độ dài chữ hiển thị thực tế
  const estimateDisplayLength = (s: string) => {
    if (!s) return 0;
    const stripped = s
      .replace(/\\[a-zA-Z]+/g, 'XX')
      .replace(/[\{\}\$\^_]/g, '')
      .trim();
    return stripped.length;
  };

  const lengths = choices.map(estimateDisplayLength);
  const maxLen = Math.max(...lengths, 0);

  // Nếu tất cả phương án <= 15 ký tự -> Dàn 4 cột trên 1 dòng
  if (maxLen <= 15) return 4;

  // Nếu tất cả phương án <= 40 ký tự -> Dàn 2 cột trên 2 dòng
  if (maxLen <= 40) return 2;

  // Nếu dài hơn -> Mỗi phương án 1 dòng riêng
  return 1;
}

/**
 * Sinh mã nguồn LaTeX hoàn chỉnh từ danh sách câu hỏi và cấu hình giao diện
 */
export function generateExamLatex(questions: SelectedQuestionItem[], config: ExamStyleConfig): string {
  const primaryColorHex = (config.isCustomColor ? config.customColor : config.themeColor).replace('#', '');

  // Lọc câu theo từng phần
  const tracNghiemList = questions.filter(q => q.type === 'trac_nghiem');
  const dungSaiList = questions.filter(q => q.type === 'dung_sai');
  const tuLuanList = questions.filter(q => q.type === 'tu_luan');

  let currentGlobalQIdx = 1;

  // 1. Header template
  let out = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T5]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage[a4paper,left=18mm,right=18mm,top=22mm,bottom=22mm]{geometry}
\\usepackage{xcolor}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{enumitem}

% Màu chủ đạo
\\definecolor{primaryColor}{HTML}{${primaryColorHex}}

% Cấu hình Header & Footer
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{${config.headerRuleWidth}pt}
\\renewcommand{\\footrulewidth}{${config.footerRuleWidth}pt}
\\fancyhead[L]{${config.headerLeft || ''}}
\\fancyhead[C]{${config.headerCenter || ''}}
\\fancyhead[R]{${config.headerRight || ''}}
\\fancyfoot[L]{${config.footerLeft || ''}}
\\fancyfoot[C]{${config.footerCenter || '\\MakeUppercase{Trang}~\\thepage\\ / \\pageref{LastPage}'}}
\\fancyfoot[R]{${config.footerRight || ''}}

\\begin{document}
`;

  // 2. Khung tiêu đề đề thi (Box & Content)
  if (config.enableBox) {
    out += `
% ── KHUNG TIÊU ĐỀ ĐỀ THI ──
\\begin{center}
\\noindent\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}} p{0.48\\textwidth} p{0.48\\textwidth}}
\\centering \\textbf{${config.headerTitle.toUpperCase()}} & \\centering \\textbf{${config.examName.toUpperCase()}} \\\\
\\centering \\textbf{${config.schoolName}} & \\centering \\textbf{MÔN: ${config.subject.toUpperCase()}} \\\\
\\centering \\textit{(Đề thi có \\pageref{LastPage} trang)} & \\centering \\textit{Thời gian làm bài: ${config.duration} phút} \\\\
\\centering \\textbf{Mã đề thi: ${config.examCode}} & \\centering \\textit{(không kể thời gian phát đề)}
\\end{tabular*}
\\vspace{2mm}
\\noindent\\rule{\\textwidth}{1pt}
\\end{center}
\\vspace{3mm}
`;
  }

  // 3. PHẦN I: Trắc nghiệm 4 phương án
  if (tracNghiemList.length > 0) {
    if (config.enableSectionTitles) {
      out += `
\\vspace{2mm}
\\noindent\\textbf{\\color{primaryColor} ${config.choice4Title}}\\\\
\\textit{${config.choice4Note}}
\\vspace{3mm}
`;
    }

    tracNghiemList.forEach((q) => {
      const qNum = currentGlobalQIdx++;
      const prefix = config.questionPrefix || 'Câu';
      out += `\n\\noindent \\textbf{${prefix} ${qNum}:} ${q.qText || ''}\n`;
      if (q.qFormula) {
        out += `\\[ ${q.qFormula} \\]\n`;
      }

      const choices = q.choices || ['', '', '', ''];
      const cA = choices[0] || '';
      const cB = choices[1] || '';
      const cC = choices[2] || '';
      const cD = choices[3] || '';

      const layout = calculateChoiceLayout(choices);

      if (layout === 4) {
        // 1 dòng 4 cột
        out += `\\vspace{1mm}\n\\noindent\\makebox[0.24\\textwidth][l]{\\textbf{A.} ${cA}}\\makebox[0.24\\textwidth][l]{\\textbf{B.} ${cB}}\\makebox[0.24\\textwidth][l]{\\textbf{C.} ${cC}}\\makebox[0.24\\textwidth][l]{\\textbf{D.} ${cD}}\n\\vspace{2mm}\n`;
      } else if (layout === 2) {
        // 2 dòng, mỗi dòng 2 cột
        out += `\\vspace{1mm}\n\\noindent\\makebox[0.48\\textwidth][l]{\\textbf{A.} ${cA}}\\makebox[0.48\\textwidth][l]{\\textbf{B.} ${cB}}\\\\[1.5mm]\n\\noindent\\makebox[0.48\\textwidth][l]{\\textbf{C.} ${cC}}\\makebox[0.48\\textwidth][l]{\\textbf{D.} ${cD}}\n\\vspace{2mm}\n`;
      } else {
        // 4 dòng, mỗi đáp án 1 dòng
        out += `\\begin{enumerate}[label=\\textbf{\\Alph*.}, leftmargin=20pt, itemsep=1.5mm]\n  \\item ${cA}\n  \\item ${cB}\n  \\item ${cC}\n  \\item ${cD}\n\\end{enumerate}\n\\vspace{2mm}\n`;
      }
    });
  }

  // 4. PHẦN II: Trắc nghiệm Đúng / Sai
  if (dungSaiList.length > 0) {
    if (config.enableSectionTitles) {
      out += `
\\vspace{4mm}
\\noindent\\textbf{\\color{primaryColor} ${config.trueFalseTitle}}\\\\
\\textit{${config.trueFalseNote}}
\\vspace{3mm}
`;
    }

    dungSaiList.forEach((q) => {
      const qNum = currentGlobalQIdx++;
      const prefix = config.questionPrefix || 'Câu';
      out += `\n\\noindent \\textbf{${prefix} ${qNum}:} ${q.qText || ''}\n`;
      if (q.qFormula) {
        out += `\\[ ${q.qFormula} \\]\n`;
      }

      if (q.statements && q.statements.length > 0) {
        out += `\\begin{enumerate}[label=\\textbf{\\alph*)}, leftmargin=20pt, itemsep=1.5mm]\n`;
        q.statements.forEach((st) => {
          out += `  \\item ${st.claim || ''}\n`;
        });
        out += `\\end{enumerate}\n\\vspace{2mm}\n`;
      }
    });
  }

  // 5. PHẦN III & IV: Tự luận / Trả lời ngắn
  if (tuLuanList.length > 0) {
    if (config.enableSectionTitles) {
      out += `
\\vspace{4mm}
\\noindent\\textbf{\\color{primaryColor} ${config.essayTitle}}\\\\
\\textit{${config.essayNote}}
\\vspace{3mm}
`;
    }

    tuLuanList.forEach((q) => {
      const qNum = currentGlobalQIdx++;
      const prefix = config.questionPrefix || 'Câu';
      out += `\n\\noindent \\textbf{${prefix} ${qNum}:} ${q.qText || ''}\n`;
      if (q.qFormula) {
        out += `\\[ ${q.qFormula} \\]\n`;
      }
      out += `\\vspace{3mm}\n`;
    });
  }

  // 6. BẢNG ĐÁP ÁN (NẾU BẬT)
  if (config.exportAnswerTable && (tracNghiemList.length > 0 || dungSaiList.length > 0)) {
    out += `
\\newpage
\\begin{center}
\\textbf{\\color{primaryColor}\\large BẢNG ĐÁP ÁN THAM KHẢO (MÃ ĐỀ: ${config.examCode})}
\\end{center}
\\vspace{2mm}
`;

    if (tracNghiemList.length > 0) {
      out += `\\noindent\\textbf{PHẦN I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN}\\\\[2mm]\n`;
      out += `\\noindent\\begin{tabular}{|c|c|c|c|c|c|c|c|c|c|}\n\\hline\n`;
      
      const rows = Math.ceil(tracNghiemList.length / 10);
      for (let r = 0; r < rows; r++) {
        const slice = tracNghiemList.slice(r * 10, (r + 1) * 10);
        // Hàng số câu
        const nums = slice.map((_, i) => `\\textbf{${r * 10 + i + 1}}`).join(' & ');
        // Hàng đáp án
        const answers = slice.map(q => `\\textbf{${q.correctChoice || '-'}}`).join(' & ');
        
        // Pad cho đủ 10 cột
        const padCount = 10 - slice.length;
        const padNums = padCount > 0 ? ' & ' + Array(padCount).fill('').join(' & ') : '';
        const padAnswers = padCount > 0 ? ' & ' + Array(padCount).fill('').join(' & ') : '';

        out += `${nums}${padNums} \\\\\n\\hline\n`;
        out += `${answers}${padAnswers} \\\\\n\\hline\n`;
      }
      out += `\\end{tabular}\n\\vspace{4mm}\n`;
    }
  }

  // 7. LỜI GIẢI CHI TIẾT (NẾU BẬT)
  if (config.exportDetailedSolution) {
    out += `
\\vspace{5mm}
\\begin{center}
\\noindent\\rule{\\textwidth}{1pt}\\\\[2mm]
\\textbf{\\color{primaryColor}\\Large HƯỚNG DẪN GIẢI CHI TIẾT}
\\end{center}
\\vspace{3mm}
`;

    let solIdx = 1;
    questions.forEach((q) => {
      const prefix = config.questionPrefix || 'Câu';
      const qNum = solIdx++;
      out += `\n\\noindent \\textbf{\\color{primaryColor} ${prefix} ${qNum}:} ${q.qText || ''}\n`;

      if (q.solution) {
        out += `\noindent ${q.solution}\\[2mm]
`;
        if (q.type === 'trac_nghiem' && q.correctChoice) {
          out += `\noindent $\\Rightarrow$ \textbf{Chọn đáp án ${q.correctChoice}.}\\[2mm]
`;
        }
      } else if (q.type === 'trac_nghiem' && q.solutionSteps && q.solutionSteps.length > 0) {
        out += `\\begin{itemize}[leftmargin=15pt, itemsep=1mm]\n`;
        q.solutionSteps.forEach((s) => {
          if (s.title || s.text || s.formula) {
            out += `  \\item ${s.title ? `\\textbf{${s.title}:} ` : ''}${s.text || ''}`;
            if (s.formula) out += `\n  \\[ ${s.formula} \\]`;
            out += `\n`;
          }
        });
        out += `\\end{itemize}\n`;
        if (q.correctChoice) {
          out += `\\noindent $\\Rightarrow$ \\textbf{Chọn đáp án ${q.correctChoice}.}\\\\[2mm]\n`;
        }
      } else if (q.type === 'dung_sai' && q.statements) {
        out += `\\begin{itemize}[leftmargin=15pt, itemsep=1.5mm]\n`;
        q.statements.forEach((st) => {
          const vStr = st.verdict === true ? '\\textbf{\\color{green!60!black}ĐÚNG}' : st.verdict === false ? '\\textbf{\\color{red!70!black}SAI}' : '';
          out += `  \\item Ý \\textbf{${st.label})}: ${st.claim || ''} $\\rightarrow$ ${vStr}\n`;
        });
        out += `\\end{itemize}\\\\[2mm]\n`;
      } else if (q.type === 'tu_luan' && q.steps && q.steps.length > 0) {
        out += `\\begin{itemize}[leftmargin=15pt, itemsep=1mm]\n`;
        q.steps.forEach((s) => {
          if (s.title || s.text || s.formula) {
            out += `  \\item ${s.title ? `\\textbf{${s.title}:} ` : ''}${s.text || ''}`;
            if (s.formula) out += `\n  \\[ ${s.formula} \\]`;
            out += `\n`;
          }
        });
        out += `\\end{itemize}\\\\[2mm]\n`;
      }
    });
  }

  out += `\n\\end{document}\n`;
  return out;
}

/**
 * Tải file .tex về máy tính người dùng
 */
export function downloadTexFile(texContent: string, fileName = 'de_thi_vat_ly.tex') {
  const blob = new Blob([texContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Mở 1 click trên Overleaf (dùng Overleaf POST API)
 */
export function openInOverleaf(texContent: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://www.overleaf.com/docs';
  form.target = '_blank';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'snip';
  input.value = texContent;

  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}


/**
 * Tự động biên soạn đề và in/xuất PDF trực tiếp ngay trong trình duyệt (100% nội bộ, không qua bên thứ 3)
 */
export function printExamDirectlyToPdf(questions: SelectedQuestionItem[], config: ExamStyleConfig) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cho phép mở pop-up để xuất PDF!');
    return;
  }

  const primaryColor = config.isCustomColor ? config.customColor : config.themeColor;
  const tracNghiemList = questions.filter(q => q.type === 'trac_nghiem');
  const dungSaiList = questions.filter(q => q.type === 'dung_sai');
  const tuLuanList = questions.filter(q => q.type === 'tu_luan');

  let qCount = 1;

  let bodyHtml = `
    <!-- HEADER ĐỀ THI -->
    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 24px;">
      <div style="text-align: center; width: 45%;">
        <div style="font-weight: bold; font-size: 11pt; text-transform: uppercase;">${config.headerTitle}</div>
        <div style="font-size: 10.5pt; font-weight: bold;">${config.schoolName}</div>
        <div style="margin-top: 4px; font-size: 9.5pt;">Mã đề thi: <b>${config.examCode}</b></div>
      </div>
      <div style="text-align: center; width: 50%;">
        <div style="font-weight: bold; font-size: 13pt; text-transform: uppercase; color: ${primaryColor};">${config.examName}</div>
        <div style="font-size: 10.5pt;">Môn thi: <b>${config.subject.toUpperCase()}</b></div>
        <div style="font-size: 10pt; font-style: italic;">Thời gian làm bài: ${config.duration} phút</div>
      </div>
    </div>
  `;

  // PHẦN I: TRẮC NGHIỆM
  if (tracNghiemList.length > 0) {
    if (config.enableSectionTitles) {
      bodyHtml += `
        <div style="margin: 16px 0 10px 0;">
          <div style="font-weight: bold; font-size: 12pt; color: ${primaryColor};">${config.choice4Title}</div>
          <div style="font-size: 10pt; font-style: italic; color: #555;">${config.choice4Note}</div>
        </div>
      `;
    }

    tracNghiemList.forEach(q => {
      const qNum = qCount++;
      const choices = q.choices || ['', '', '', ''];
      const layout = calculateChoiceLayout(choices);
      const cols = layout === 4 ? '1fr 1fr 1fr 1fr' : layout === 2 ? '1fr 1fr' : '1fr';

      bodyHtml += `
        <div style="margin-bottom: 16px; page-break-inside: avoid; text-align: justify;">
          <div><b>${config.questionPrefix || 'Câu'} ${qNum}:</b> ${q.qText || ''}</div>
          ${q.qFormula ? `<div style="text-align: center; margin: 6px 0;">$$${q.qFormula}$$</div>` : ''}
          <div style="display: grid; grid-template-columns: ${cols}; gap: 6px 16px; margin-top: 8px;">
            <div><b>A.</b> ${choices[0] || ''}</div>
            <div><b>B.</b> ${choices[1] || ''}</div>
            <div><b>C.</b> ${choices[2] || ''}</div>
            <div><b>D.</b> ${choices[3] || ''}</div>
          </div>
        </div>
      `;
    });
  }

  // PHẦN II: ĐÚNG / SAI
  if (dungSaiList.length > 0) {
    if (config.enableSectionTitles) {
      bodyHtml += `
        <div style="margin: 20px 0 10px 0; page-break-before: auto;">
          <div style="font-weight: bold; font-size: 12pt; color: ${primaryColor};">${config.trueFalseTitle}</div>
          <div style="font-size: 10pt; font-style: italic; color: #555;">${config.trueFalseNote}</div>
        </div>
      `;
    }

    dungSaiList.forEach(q => {
      const qNum = qCount++;
      bodyHtml += `
        <div style="margin-bottom: 16px; page-break-inside: avoid; text-align: justify;">
          <div><b>${config.questionPrefix || 'Câu'} ${qNum}:</b> ${q.qText || ''}</div>
          ${q.qFormula ? `<div style="text-align: center; margin: 6px 0;">$$${q.qFormula}$$</div>` : ''}
          <div style="margin-top: 6px; padding-left: 12px; display: flex; flex-direction: column; gap: 4px;">
            ${(q.statements || []).map(st => `<div><b>${st.label})</b> ${st.claim || ''}</div>`).join('')}
          </div>
        </div>
      `;
    });
  }

  // PHẦN III: TỰ LUẬN
  if (tuLuanList.length > 0) {
    if (config.enableSectionTitles) {
      bodyHtml += `
        <div style="margin: 20px 0 10px 0;">
          <div style="font-weight: bold; font-size: 12pt; color: ${primaryColor};">${config.essayTitle}</div>
          <div style="font-size: 10pt; font-style: italic; color: #555;">${config.essayNote}</div>
        </div>
      `;
    }

    tuLuanList.forEach(q => {
      const qNum = qCount++;
      bodyHtml += `
        <div style="margin-bottom: 16px; page-break-inside: avoid; text-align: justify;">
          <div><b>${config.questionPrefix || 'Câu'} ${qNum}:</b> ${q.qText || ''}</div>
          ${q.qFormula ? `<div style="text-align: center; margin: 6px 0;">$$${q.qFormula}$$</div>` : ''}
        </div>
      `;
    });
  }

  // BẢNG ĐÁP ÁN (NẾU BẬT)
  if (config.exportAnswerTable && tracNghiemList.length > 0) {
    bodyHtml += `
      <div style="margin-top: 30px; page-break-before: always;">
        <div style="text-align: center; font-weight: bold; font-size: 12pt; color: ${primaryColor}; margin-bottom: 12px;">
          BẢNG ĐÁP ÁN THAM KHẢO (MÃ ĐỀ: ${config.examCode})
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11pt;">
          <tr style="background: #f5f5f5;">
            ${tracNghiemList.map((_, i) => `<th style="border: 1px solid #333; padding: 6px;">${i + 1}</th>`).join('')}
          </tr>
          <tr>
            ${tracNghiemList.map(q => `<td style="border: 1px solid #333; padding: 6px; font-weight: bold;">${q.correctChoice || '-'}</td>`).join('')}
          </tr>
        </table>
      </div>
    `;
  }

  // LỜI GIẢI CHI TIẾT (NẾU BẬT)
  if (config.exportDetailedSolution) {
    bodyHtml += `
      <div style="margin-top: 30px; page-break-before: always;">
        <div style="text-align: center; font-weight: bold; font-size: 14pt; color: ${primaryColor}; border-bottom: 2px solid ${primaryColor}; padding-bottom: 6px; margin-bottom: 18px;">
          HƯỚNG DẪN GIẢI CHI TIẾT
        </div>
    `;

    let sIdx = 1;
    questions.forEach(q => {
      const qNum = sIdx++;
      bodyHtml += `
        <div style="margin-bottom: 18px; page-break-inside: avoid;">
          <div style="font-weight: bold; color: ${primaryColor}; margin-bottom: 4px;">${config.questionPrefix || 'Câu'} ${qNum}: ${q.qText || ''}</div>
          <div style="padding-left: 12px; font-size: 11pt; text-align: justify;">
            ${q.solution ? `
              <div style="margin-bottom: 6px; white-space: pre-wrap; line-height: 1.45;">${q.solution}</div>
            ` : (q.solutionSteps || q.steps || []).map(s => `
              <div style="margin-bottom: 6px;">
                ${s.title ? `<b>${s.title}:</b> ` : ''}${s.text || ''}
                ${s.formula ? `<div style="text-align: center; margin: 4px 0;">$$${s.formula}$$</div>` : ''}
              </div>
            `).join('')}
            ${q.correctChoice ? `<div style="font-weight: bold; color: #2e7d32; margin-top: 4px;">➔ Đáp án: ${q.correctChoice}</div>` : ''}
          </div>
        </div>
      `;
    });

    bodyHtml += `</div>`;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${config.examName} - Mã đề ${config.examCode}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
  <style>
    @page { 
      size: A4; 
      margin: 18mm 15mm 18mm 15mm; 
    }
    * { 
      box-sizing: border-box; 
    }
    body {
      font-family: 'KaTeX_Main', 'Computer Modern', 'Times New Roman', serif;
      font-size: 12pt;
      font-weight: 400;
      line-height: 1.4;
      color: #1a1a1a;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      margin: 0;
      padding: 15px;
    }
    b, strong {
      font-weight: 600;
    }
    .katex {
      font-size: 1em !important;
      font-weight: normal !important;
    }
    .katex-display {
      margin: 6px 0 !important;
    }
    @media print {
      body { 
        padding: 0; 
      }
    }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>
    function doRenderAndPrint() {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
          ],
          throwOnError: false
        });
      }
      setTimeout(function() {
        window.print();
      }, 500);
    }
    if (document.readyState === 'loading') {
      document.addEventListener("DOMContentLoaded", doRenderAndPrint);
    } else {
      doRenderAndPrint();
    }
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
}
