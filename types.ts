export enum GradeLevel {
  Grade10 = 10,
  Grade11 = 11,
  Grade12 = 12,
}

export interface Chapter {
  id: string;
  name: string;
  description?: string;
}

export interface Lesson {
  id: string;
  chapterId: string;
  name: string;
  createdAt: number;
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: number; // Timestamp
  url?: string; // In a real app, this is the download link. In demo, likely a blob URL.
  category?: string; // Optional category for organization
}

export interface GradeData {
  level: GradeLevel;
  title: string;
  chapters: Chapter[];
}

export type FileStorage = Record<string, StoredFile[]>; // Key is "lessonId" or "chapterId"

// ── Physics Solution Types (shared by SolutionEditor & SolutionRenderer) ──────

export interface SolutionStep {
  title: string;
  text: string;
  formula: string;
  formula2: string;
}

export interface SolutionStatement {
  label: 'a' | 'b' | 'c' | 'd';
  claim: string;
  claim_latex: string;
  verdict: true | false | null;
  steps: SolutionStep[];
}

// ── Exam (Thi Thử) Types ──────────────────────────────────────────

export interface ExamTFAnswer {
  a: 'D' | 'S' | '';
  b: 'D' | 'S' | '';
  c: 'D' | 'S' | '';
  d: 'D' | 'S' | '';
}

export interface ExamAnswers {
  mc: string[];          // 18 đáp án ABCD (index 0-17)
  tf: ExamTFAnswer[];    // 4 câu Đúng/Sai (index 0-3)
  sa: string[];          // 6 trả lời ngắn (index 0-5)
}

export interface Exam {
  id: string;
  title: string;
  pdfTelegramFileId: string;  // file_id PDF trên Telegram
  pdfFileName: string;        // tên file PDF gốc
  duration: number;           // phút
  grade: number;              // 10, 11, 12
  createdAt: number;
  answers: ExamAnswers;
  category?: 'school' | 'chapter';
  subCategory?: string;
  scheduledAt?: number; // THỜI GIAN HẸN GIỜ THI (Timestamp in ms)
  closedAt?: number;    // THỜI GIAN ĐÓNG ĐỀ CHUNG (Timestamp in ms) — khóa nộp bài sau thời điểm này
}

export interface ExamSubmission {
  examId: string;
  mc: string[];           // đáp án học sinh chọn
  tf: ExamTFAnswer[];     // đáp án học sinh chọn
  sa: string[];           // trả lời ngắn học sinh
  submittedAt: number;
  timeTaken: number;      // giây
}

export interface ExamResultRecord {
  id: string;
  student_phone: string;
  student_name: string;
  exam_id: string;
  exam_title: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  submitted_at: string;
  grade: number;
  part_scores?: { mc: number; tf: number; sa: number };
  tf_breakdown?: number[];
}

export interface StudyPlanItem {
  id: string;
  student_phone: string;
  task_name: string;
  is_completed: boolean;
  due_date: string; // YYYY-MM-DD
  color: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  grade: number; // 10, 11, 12
  created_at?: string;
}

// ── Notification (Thông Báo) Types ───────────────────────────────

export interface NotificationItem {
  id: string;
  title?: string;          // Tiêu đề thông báo (tùy chọn)
  message: string;         // Nội dung thông báo
  type: 'manual' | 'sync'; // Loại thông báo
  grade: number;           // 10, 11, 12
  fetch_enabled: boolean;
  created_at: string;
}

export interface NotificationFetch {
  id: string;
  notification_id: string;
  student_phone: string;
  fetched_at: string;
}

// ── Blog Types ──────────────────────────────────────────

export interface BlogPost {
  id: string;
  title: string;
  summary: string;
  content: string; // Markdown format
  cover_image: string; // URL
  category: string;
  tags: string[];
  is_published: boolean;
  grade: number; // 10, 11, 12 hoặc 0 (Tất cả — mặc định)
  level?: number;  // 1–4: Mức độ khó (Nhận biết / Thông hiếu / Vận dụng / Vận dụng cao)
  created_at: string;
  updated_at: string;
}

// ── Exam Comment Types ──────────────────────────────────────────

export interface ExamComment {
  id: string;
  exam_id: string;
  author_id: string;      // machine_id của học sinh (định danh ẩn danh)
  author_name: string;    // nickname tự đặt
  text: string;           // nội dung comment
  image_url?: string;     // URL ảnh trên Cloudflare R2 (nếu có)
  created_at: number;     // timestamp ms
  is_deleted?: boolean;   // Admin xóa mềm
}

export interface UserNickname {
  machine_id: string;
  nickname: string;
  updated_at: number;
}

// ── Live & Bài Giảng Types ────────────────────────────────────────

export interface LiveConfig {
  id?: number;
  is_live: boolean;
  youtube_url: string;
  chat_url: string;
  title: string;
  grade: number;  // 0 = tất cả lớp, 10/11/12 = chỉ khối đó
  updated_at?: string;
}

export interface LectureChapter {
  id: string;
  title: string;
  description: string;
  order: number;
  grade: number;      // 0 = tất cả, 10/11/12 = theo khối lớp
  created_at: string;
}

export interface LectureVideo {
  id: string;
  chapter_id: string;
  title: string;
  description: string;
  youtube_url: string;
  duration_seconds: number;
  order: number;
  created_at: string;
}

export interface LectureProgress {
  video_id: string;
  watched_seconds: number;
  completed: boolean;
  updated_at?: string;
}
