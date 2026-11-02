import React, { useEffect, useMemo, useCallback, Suspense, useState, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { GradeLevel, Lesson, Exam } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { useCloudStorage } from './src/hooks/useCloudStorage';
import { getActivatedPhone } from './src/utils/phone';
import { FileText, ChevronRight, FolderOpen, RefreshCw, Atom, Bell, Menu, Plus, X } from 'lucide-react';
import KickedScreen from './components/auth/KickedScreen';
import { useUIStore } from './src/stores/useUIStore';
import { useDataStore } from './src/stores/useDataStore';
import { useExamStore, useBlogStore } from './src/stores/useContentStore';
import { useShallow } from 'zustand/react/shallow';
import { syncPendingOnStartup } from './src/services/examService';
import { syncServerTime } from './src/lib/serverTime';

const ChapterView = React.lazy(() => import('./components/ChapterView'));
const LessonView = React.lazy(() => import('./components/LessonView'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const Chatbot = React.lazy(() => import('./components/Chatbot'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const ExamListPage = React.lazy(() => import('./components/ExamListPage'));
const ExamView = React.lazy(() => import('./components/ExamView'));
const ExamResult = React.lazy(() => import('./components/ExamResult'));
const ContactBook = React.lazy(() => import('./components/ContactBook'));
const StudyPlanner = React.lazy(() => import('./components/StudyPlanner'));
const NotificationPage = React.lazy(() => import('./components/NotificationPage'));
const SimulationLab = React.lazy(() => import('./components/SimulationLab'));
const BlogList = React.lazy(() => import('./components/BlogList'));
const BlogDetail = React.lazy(() => import('./components/BlogDetail'));
const AdminBlogEditor = React.lazy(() => import('./components/AdminBlogEditor'));
const GlobalSearch = React.lazy(() => import('./components/GlobalSearch'));
const SolutionEditor = React.lazy(() => import('./components/SolutionEditor'));
const CommunityPage = React.lazy(() => import('./components/CommunityPage'));
const TheoryKing = React.lazy(() => import('./components/TheoryKing'));
const LivePage = React.lazy(() => import('./components/LivePage'));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-[40vh]">
    <RefreshCw className="w-8 h-8 animate-spin" style={{ color: '#6B7CDB' }} />
  </div>
);

// ──────────────────────────────────────────────────────────────────
// AppDataSync: bridges useCloudStorage data → Zustand stores
// ──────────────────────────────────────────────────────────────────
function AppDataSync({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const setCurriculum = useDataStore(state => state.setCurriculum);
  const setLessons = useDataStore(state => state.setLessons);
  const setStoredFiles = useDataStore(state => state.setStoredFiles);
  const setLoading = useDataStore(state => state.setLoading);
  const setIsActivated = useDataStore(state => state.setIsActivated);
  const setStudentGradeValue = useDataStore(state => state.setStudentGradeValue);
  const isAdmin = useUIStore(state => state.isAdmin);
  const setKicked = useUIStore(state => state.setKicked);
  const setNotificationUnreadCount = useUIStore(state => state.setNotificationUnreadCount);
  const { getFetchedNotificationIds, getNotifications, verifyAccess } = cloud;

  useEffect(() => { setCurriculum(cloud.curriculum); }, [cloud.curriculum, setCurriculum]);
  useEffect(() => { setLessons(cloud.lessons); }, [cloud.lessons, setLessons]);
  useEffect(() => { setStoredFiles(cloud.storedFiles); }, [cloud.storedFiles, setStoredFiles]);
  useEffect(() => { setLoading(cloud.loading); }, [cloud.loading, setLoading]);
  
  // ── Migration Runner — bump MIGRATION_VER and add a new if-block below for future migrations
  useEffect(() => {
    const MIGRATION_VER = 3;
    // Backward compat: học sinh cũ đã có key cũ 'pv_v3_migrated_safe'
    if (localStorage.getItem('pv_v3_migrated_safe') && !localStorage.getItem('pv_migration_ver')) {
      localStorage.setItem('pv_migration_ver', '3');
      localStorage.removeItem('pv_v3_migrated_safe');
    }
    const lastRan = parseInt(localStorage.getItem('pv_migration_ver') || '0', 10);
    if (lastRan >= MIGRATION_VER) return;

    // v3: Xóa legacy IndexedDB và metadata từ bản cũ
    if (lastRan < 3) {
      indexedDB.deleteDatabase('PhysiVaultDB');
      indexedDB.deleteDatabase('pv_pdf_cache');
      localStorage.removeItem('pv_exam_versions');
      localStorage.removeItem('pv_exam_chunks_map');
      localStorage.removeItem('pv_last_fetched_exam_index');
      localStorage.setItem('pv_last_sync_time', '0');
      console.log('[Migration v3] Cleared legacy databases.');
    }
    // Để thêm migration mới: tăng MIGRATION_VER lên 4 và thêm: if (lastRan < 4) { ... }

    localStorage.setItem('pv_migration_ver', String(MIGRATION_VER));
  }, []);

  useEffect(() => {
    setIsActivated(cloud.isActivated);
    if (cloud.isActivated) {
      const g = parseInt(localStorage.getItem('physivault_grade') || '0', 10);
      setStudentGradeValue(g === 10 || g === 11 || g === 12 ? g : null);
      
      // ✅ Vớt bài thi chưa sync khi vừa vào App
      syncPendingOnStartup();
    }
  }, [cloud.isActivated, setIsActivated, setStudentGradeValue]);

  // ✅ PERF: verifyAccess cooldown 10 phút — giảm 50% Supabase queries
  const lastVerifyRef = useRef(0);
  useEffect(() => {
    const VERIFY_COOLDOWN = 10 * 60 * 1000;
    const check = async () => {
      if (!cloud.isActivated || document.hidden) return;
      if (Date.now() - lastVerifyRef.current < VERIFY_COOLDOWN) return;
      lastVerifyRef.current = Date.now();
      const status = await verifyAccess();
      if (status === 'kicked') setKicked(true);
    };
    check();
    const iv = setInterval(check, VERIFY_COOLDOWN);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', check); };
  }, [cloud.isActivated, verifyAccess, setKicked]);

  // ✅ PERF: notification polling cooldown 15 phút — giảm 87% notification queries
  const lastUnreadRef = useRef(0);
  useEffect(() => {
    if (!cloud.isActivated) return;
    const UNREAD_COOLDOWN = 15 * 60 * 1000;
    const loadUnread = async () => {
      if (document.hidden) return;
      if (Date.now() - lastUnreadRef.current < UNREAD_COOLDOWN) return;
      lastUnreadRef.current = Date.now();
      try {
        if (isAdmin) {
          const [n10, n11, n12, fetched] = await Promise.all([getNotifications(10), getNotifications(11), getNotifications(12), getFetchedNotificationIds()]);
          setNotificationUnreadCount([...n10, ...n11, ...n12].filter(n => n.fetch_enabled && !fetched.has(n.id)).length);
        } else {
          let grade = parseInt(localStorage.getItem('physivault_grade') || '0', 10);
          // ✅ BUG 3C FIX: fallback lấy grade từ Supabase nếu localStorage bị xóa
          if (grade < 10 || grade > 12) {
            const phone = localStorage.getItem('pv_activated_sdt');
            if (!phone) return;
            try {
              const { supabase: sb } = await import('./src/lib/supabase');
              const { data } = await sb.from('students').select('grade').eq('phone', phone).maybeSingle();
              if (data?.grade) {
                grade = data.grade;
                localStorage.setItem('physivault_grade', String(grade)); // re-cache
              } else return;
            } catch { return; }
          }
          const [notifs, fetched] = await Promise.all([getNotifications(grade), getFetchedNotificationIds()]);
          setNotificationUnreadCount(notifs.filter(n => n.fetch_enabled && !fetched.has(n.id)).length);
        }
      } catch { /* silent */ }
    };
    loadUnread();
    const iv = setInterval(loadUnread, UNREAD_COOLDOWN);
    document.addEventListener('visibilitychange', loadUnread);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', loadUnread); };
  }, [cloud.isActivated, isAdmin, getNotifications, getFetchedNotificationIds, setNotificationUnreadCount]);

  return null;
}

// ──────────────────────────────────────────────────────────────────
// Route pages
// ──────────────────────────────────────────────────────────────────
function GradeOverviewPage({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const { level } = useParams<{ level: string }>();
  const navigate = useNavigate();
  const lessons = useDataStore(state => state.lessons);
  const storedFiles = useDataStore(state => state.storedFiles);
  const grade = Number(level) as GradeLevel;
  const curriculum = useDataStore(state => state.curriculum);
  const isAdmin = useUIStore(state => state.isAdmin);
  const previewMode = useUIStore(state => state.previewMode);
  const showToast = useUIStore(state => state.showToast);
  const effectiveIsAdmin = isAdmin && !previewMode;

  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [newChapterDescription, setNewChapterDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const gradeData = useMemo(() => curriculum.find(g => g.level === grade), [curriculum, grade]);
  if (!gradeData) return <Navigate to="/" replace />;

  const handleCreateChapter = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newChapterName.trim()) {
      showToast('Vui lòng nhập tên chương!', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await cloud.addChapter(grade, newChapterName.trim(), newChapterDescription.trim());
      showToast(`Đã thêm chương: ${newChapterName.trim()}`, 'success');
      setNewChapterName('');
      setNewChapterDescription('');
      setIsAddingChapter(false);
    } catch {
      showToast('Không thể tạo chương mới.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-1.5 text-sm" style={{ color: '#787774' }}>
        <span onClick={() => navigate('/')} className="cursor-pointer hover:text-[#6B7CDB] transition-colors">Tổng quan</span>
        <ChevronRight className="w-3.5 h-3.5" style={{ color: '#CFCFCB' }} />
        <span className="font-medium" style={{ color: '#1A1A1A' }}>{gradeData.title}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#1A1A1A' }}>{gradeData.title}</h1>
          <p className="text-sm" style={{ color: '#787774' }}>Quản lý và theo dõi tiến độ học tập</p>
        </div>

        {effectiveIsAdmin && !isAddingChapter && (
          <button
            onClick={() => setIsAddingChapter(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all active:scale-[0.98] self-start sm:self-auto shrink-0 shadow-sm"
            style={{ background: '#EEF0FB', color: '#6B7CDB', border: '1px solid #6B7CDB30' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E0E4F9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#EEF0FB'; }}
          >
            <Plus className="w-4 h-4" />
            <span>Thêm chương mới</span>
          </button>
        )}
      </div>

      {/* Add Chapter Form (Admin only) */}
      {effectiveIsAdmin && isAddingChapter && (
        <div className="p-4 rounded-xl animate-fade-in" style={{ background: '#FFFFFF', border: '1px solid #E9E9E7', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid #F1F0EC' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7CDB' }}>Thêm chương mới cho {gradeData.title}</span>
            <button onClick={() => setIsAddingChapter(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateChapter} className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)_auto_auto] gap-2.5 items-center">
            <input
              type="text"
              value={newChapterName}
              onChange={e => setNewChapterName(e.target.value)}
              placeholder="Tên chương (VD: Chương 5: Điện động lực học vĩ mô)"
              className="text-sm rounded-lg px-3 py-2 outline-none transition-colors"
              style={{ background: '#FBFBFA', border: '1px solid #E9E9E7', color: '#1A1A1A' }}
              onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = '#6B7CDB'}
              onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = '#E9E9E7'}
              autoFocus
            />
            <input
              type="text"
              value={newChapterDescription}
              onChange={e => setNewChapterDescription(e.target.value)}
              placeholder="Mô tả ngắn kiến thức cốt lõi (tùy chọn)"
              className="text-sm rounded-lg px-3 py-2 outline-none transition-colors"
              style={{ background: '#FBFBFA', border: '1px solid #E9E9E7', color: '#1A1A1A' }}
              onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = '#6B7CDB'}
              onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = '#E9E9E7'}
            />
            <button
              type="submit"
              disabled={isSaving || !newChapterName.trim()}
              className="text-sm font-semibold text-white rounded-lg px-4 py-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: '#6B7CDB' }}
            >
              {isSaving ? 'Đang tạo...' : 'Tạo chương'}
            </button>
            <button
              type="button"
              onClick={() => setIsAddingChapter(false)}
              className="text-sm font-medium rounded-lg px-3 py-2 transition-colors"
              style={{ background: '#F1F0EC', color: '#57564F', border: '1px solid #E9E9E7' }}
            >
              Hủy
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gradeData.chapters.map((chapter) => {
          const cl = lessons.filter(l => l.chapterId === chapter.id);
          const fc = cl.reduce((s, l) => s + (storedFiles[l.id]?.length || 0), 0);
          return (
            <div key={chapter.id} onClick={() => navigate(`/grade/${grade}/chapter/${chapter.id}`)} className="rounded-xl p-5 cursor-pointer group pv-chapter-card">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-lg" style={{ background: '#EEF0FB' }}><FolderOpen className="w-5 h-5" style={{ color: '#6B7CDB' }} /></div>
                <div className="text-right"><div className="text-[10px] uppercase tracking-wider" style={{ color: '#AEACA8' }}>Bài học</div><div className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>{cl.length}</div></div>
              </div>
              <h3 className="font-semibold text-sm mb-1 line-clamp-1" style={{ color: '#1A1A1A' }}>{chapter.name}</h3>
              <p className="text-xs leading-relaxed mb-4 line-clamp-2" style={{ color: '#787774', minHeight: '2.5rem' }}>{chapter.description}</p>
              <div className="flex items-center justify-between pt-3 text-xs" style={{ borderTop: '1px solid #F1F0EC' }}>
                <div className="flex items-center gap-1" style={{ color: '#AEACA8' }}><FileText className="w-3.5 h-3.5" /><span>{fc} tài liệu</span></div>
                <ChevronRight className="w-4 h-4" style={{ color: '#CFCFCB' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChapterPage({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const { level, chapterId } = useParams<{ level: string; chapterId: string }>();
  const navigate = useNavigate();
  const lessons = useDataStore(state => state.lessons);
  const storedFiles = useDataStore(state => state.storedFiles);
  const curriculum = useDataStore(state => state.curriculum);
  const isAdmin = useUIStore(state => state.isAdmin);
  const previewMode = useUIStore(state => state.previewMode);
  const showToast = useUIStore(state => state.showToast);
  const effectiveIsAdmin = isAdmin && !previewMode;
  const grade = Number(level) as GradeLevel;
  const gradeData = useMemo(() => curriculum.find(g => g.level === grade), [curriculum, grade]);
  const chapter = gradeData?.chapters.find(c => c.id === chapterId);
  const chapterLessons = useMemo(() => lessons.filter(l => l.chapterId === chapterId), [lessons, chapterId]);
  const chapterFiles = storedFiles[chapterId!] || [];
  if (!chapter || !chapterId) return <Navigate to={`/grade/${level}`} replace />;
  const handleCreateLesson = async (name: string) => { try { await cloud.addLesson(name, chapterId); showToast(`Đã tạo bài học: ${name}`, 'success'); } catch { showToast('Lỗi khi tạo bài học', 'error'); } };
  const handleDeleteLesson = async (lessonId: string) => { const l = lessons.find(x => x.id === lessonId); if (!l) return; if (window.confirm(`Xóa bài học "${l.name}" và tất cả tài liệu?`)) { try { await cloud.deleteLesson(lessonId); showToast(`Đã xóa: ${l.name}`, 'success'); } catch { showToast('Lỗi xóa bài học', 'error'); } } };
  const handleChapterUpload = async (files: File[], category: string) => { try { showToast('Đang tải lên...', 'warning'); await cloud.uploadFiles(files, chapterId, category); showToast(`Đã tải lên ${files.length} tài liệu`, 'success'); } catch { showToast('Lỗi tải lên', 'error'); } };
  const handleDeleteChapterFile = async (fileId: string) => { const f = chapterFiles.find(x => x.id === fileId); if (window.confirm(`Xóa tài liệu "${f?.name || 'này'}"?`)) { try { await cloud.deleteFile(fileId, chapterId); showToast('Đã xóa', 'success'); } catch { showToast('Lỗi xóa file', 'error'); } } };
  return (
    <ErrorBoundary><Suspense fallback={<LazyFallback />}>
      <ChapterView chapter={chapter} lessons={chapterLessons} chapterFiles={chapterFiles} isAdmin={effectiveIsAdmin} autoCreate={false} onBack={() => navigate(`/grade/${level}`)} onCreateLesson={handleCreateLesson} onSelectLesson={(lesson: Lesson) => navigate(`/grade/${level}/chapter/${chapterId}/lesson/${lesson.id}`)} onDeleteLesson={handleDeleteLesson} onUploadChapterFile={handleChapterUpload} onDeleteChapterFile={handleDeleteChapterFile} />
    </Suspense></ErrorBoundary>
  );
}

function LessonPage({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const { level, chapterId, lessonId } = useParams<{ level: string; chapterId: string; lessonId: string }>();
  const navigate = useNavigate();
  const lessons = useDataStore(state => state.lessons);
  const storedFiles = useDataStore(state => state.storedFiles);
  const isAdmin = useUIStore(state => state.isAdmin);
  const previewMode = useUIStore(state => state.previewMode);
  const showToast = useUIStore(state => state.showToast);
  const effectiveIsAdmin = isAdmin && !previewMode;
  const lesson = lessons.find(l => l.id === lessonId);
  const lessonFiles = storedFiles[lessonId!] || [];
  if (!lesson) return <Navigate to={`/grade/${level}/chapter/${chapterId}`} replace />;
  const handleUpload = async (files: File[], category?: string) => { try { showToast('Đang tải lên...', 'warning'); await cloud.uploadFiles(files, lesson.id, category); showToast(`Đã tải lên ${files.length} tài liệu`, 'success'); } catch { showToast('Lỗi tải lên', 'error'); } };
  const handleDelete = async (fileId: string) => { const f = lessonFiles.find(x => x.id === fileId); if (window.confirm(`Xóa tài liệu "${f?.name || 'này'}"?`)) { try { await cloud.deleteFile(fileId, lesson.id); showToast('Đã xóa', 'success'); } catch { showToast('Lỗi xóa file', 'error'); } } };
  return (
    <ErrorBoundary><Suspense fallback={<LazyFallback />}>
      <LessonView lesson={lesson} files={lessonFiles} isAdmin={effectiveIsAdmin} onBack={() => navigate(`/grade/${level}/chapter/${chapterId}`)} onUpload={handleUpload} onDelete={handleDelete} />
    </Suspense></ErrorBoundary>
  );
}

function ExamRoutes({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const navigate = useNavigate();
  const isAdmin = useUIStore(state => state.isAdmin);
  const previewMode = useUIStore(state => state.previewMode);
  const { activeExam, examSubmission, setActiveExam, setExamSubmission, clearExam } = useExamStore(useShallow(state => ({
    activeExam: state.activeExam,
    examSubmission: state.examSubmission,
    setActiveExam: state.setActiveExam,
    setExamSubmission: state.setExamSubmission,
    clearExam: state.clearExam,
  })));
  if (activeExam && examSubmission) {
    return (
      <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <ExamResult exam={activeExam} submission={examSubmission} onRetry={() => setExamSubmission(null)} onBack={() => { clearExam(); navigate('/exams'); }} onSubmitVote={(part, qNum) => cloud.submitQuestionVote(activeExam.id, part, qNum)} onShowToast={useUIStore.getState().showToast} />
      </Suspense></ErrorBoundary>
    );
  }
  if (activeExam) {
    return (
      <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <ExamView exam={activeExam} isPreviewMode={!!previewMode} onShowToast={useUIStore.getState().showToast} onBack={() => { clearExam(); navigate('/exams'); }} onSubmit={async (sub) => { 
          setExamSubmission(sub); 
          const { calcScore } = await import('./components/ExamView'); 
          const score = calcScore(sub, activeExam.answers); 
          const totalQ = (activeExam.answers.mc?.length ?? 0) + (activeExam.answers.tf?.length ?? 0) + (activeExam.answers.sa?.length ?? 0); 
          cloud.saveExamResult(activeExam, score.total, totalQ, score.correctCount, { mc: score.mc, tf: score.tf, sa: score.sa }, score.tfBreakdown, sub.timeTaken); 
        }} />
      </Suspense></ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary><Suspense fallback={<LazyFallback />}>
      <ExamListPage isAdmin={isAdmin} previewMode={previewMode} onLoadExams={cloud.loadExams} onLoadHistory={(isAdmin && !previewMode) ? cloud.getExamHistory : () => { const phone = getActivatedPhone(); if (!phone) return Promise.resolve([]); return cloud.getExamHistory(phone); }} onSelectExam={(exam: Exam) => { setActiveExam(exam); setExamSubmission(null); }} />
    </Suspense></ErrorBoundary>
  );
}

function BlogRoutes({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const navigate = useNavigate();
  const isAdmin = useUIStore(state => state.isAdmin);
  const previewMode = useUIStore(state => state.previewMode);
  const effectiveIsAdmin = isAdmin && !previewMode;
  // Lấy grade học sinh từ localStorage để filter bài theo khối
  const studentGrade = useMemo(() => {
    const g = parseInt(localStorage.getItem('physivault_grade') || '0', 10);
    return (g === 10 || g === 11 || g === 12) ? g : null;
  }, []);
  const { activeBlog, activeAdminBlog, isCreatingBlog, allBlogs, setActiveBlog, setActiveAdminBlog, setIsCreatingBlog, setAllBlogs } = useBlogStore(useShallow(state => ({
    activeBlog: state.activeBlog,
    activeAdminBlog: state.activeAdminBlog,
    isCreatingBlog: state.isCreatingBlog,
    allBlogs: state.allBlogs,
    setActiveBlog: state.setActiveBlog,
    setActiveAdminBlog: state.setActiveAdminBlog,
    setIsCreatingBlog: state.setIsCreatingBlog,
    setAllBlogs: state.setAllBlogs,
  })));
  if ((activeAdminBlog || isCreatingBlog) && effectiveIsAdmin) {
    const back = () => { setActiveAdminBlog(null); setIsCreatingBlog(false); navigate('/blog', { replace: true }); };
    return (
      <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <AdminBlogEditor blog={activeAdminBlog} saveBlog={cloud.saveBlog} deleteBlog={cloud.deleteBlog} syncBlogs={cloud.syncBlogs} onBack={back} onSaved={() => { setActiveAdminBlog(null); setIsCreatingBlog(false); navigate('/blog', { replace: true }); }} />
      </Suspense></ErrorBoundary>
    );
  }
  if (activeBlog) {
    const related = allBlogs.filter(b => b.id !== activeBlog.id && b.is_published).filter(b => b.category === activeBlog.category || (b.tags || []).some(t => (activeBlog.tags || []).includes(t))).slice(0, 4);
    return (
      <ErrorBoundary><Suspense fallback={<LazyFallback />}>
        <BlogDetail blog={activeBlog} onBack={() => setActiveBlog(null)} relatedBlogs={related} onReadRelated={setActiveBlog} />
      </Suspense></ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary><Suspense fallback={<LazyFallback />}>
      <BlogList isAdmin={effectiveIsAdmin} studentGrade={effectiveIsAdmin ? null : studentGrade} onReadBlog={setActiveBlog} onEditBlog={effectiveIsAdmin ? setActiveAdminBlog : undefined} onCreateBlog={effectiveIsAdmin ? () => setIsCreatingBlog(true) : undefined} onBlogsLoaded={setAllBlogs} getBlogs={cloud.getBlogs} />
    </Suspense></ErrorBoundary>
  );
}


// ──────────────────────────────────────────────────────────────────
// AppShell: layout (sidebar + mobile nav + modals)
// ──────────────────────────────────────────────────────────────────
function AppShell({ cloud }: { cloud: ReturnType<typeof useCloudStorage> }) {
  const navigate = useNavigate();
  const { pathname: path } = useLocation();
  const {
    isSettingsOpen, setSettingsOpen,
    toasts, removeToast, isAdmin, toggleAdmin,
  } = useUIStore(useShallow(state => ({
    isSettingsOpen: state.isSettingsOpen,
    setSettingsOpen: state.setSettingsOpen,
    toasts: state.toasts,
    removeToast: state.removeToast,
    isAdmin: state.isAdmin,
    toggleAdmin: state.toggleAdmin,
  })));

  // Tự động kích hoạt quyền Admin trên Studio nếu chưa bật
  useEffect(() => {
    if (!isAdmin) {
      toggleAdmin();
    }
  }, []);

  return (
    <div className="min-h-screen font-sans flex flex-col bg-[#F7F6F3] text-[#1A1A1A]">
      {/* Top Header cho Studio */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 border-b border-[#E9E9E7] bg-white/95 backdrop-blur-md h-16 shadow-xs">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600 shadow-sm">
            <Atom className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base text-gray-900 tracking-tight leading-none">PhysiVault Studio</div>
            <div className="text-[11px] text-gray-500 font-medium mt-0.5">Góc Học Tập & Ngân Hàng Đề Thi Trực Tuyến</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/editor')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Soạn bài mới (LaTeX)
          </button>

          <button
            onClick={() => toggleAdmin()}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isAdmin ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}
          >
            {isAdmin ? '✓ Quyền Biên Soạn (Admin)' : '👁 Chế độ Học sinh'}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            title="Cài đặt & Đồng bộ"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setSettingsOpen(false)}
            onShowToast={useUIStore.getState().showToast}
            isAdmin={true}
            isActivated={true}
            lessons={[]}
            storedFiles={{}}
            onActivateSystem={cloud.activateSystem}
            onFetchLessons={cloud.fetchLessonsFromCloud}
            onToggleAdmin={toggleAdmin}
            onOpenDashboard={() => setSettingsOpen(false)}
            onLoadExams={cloud.loadExams}
          />
        </Suspense>
      </ErrorBoundary>

      {/* Main Content: 100% dành cho Góc học tập & Soạn đề */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 md:p-8 lg:p-10">
        <Routes>
          <Route path="/" element={<BlogRoutes cloud={cloud} />} />
          <Route path="/blog/*" element={<BlogRoutes cloud={cloud} />} />
          <Route path="/admin/editor" element={
            <ErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                <SolutionEditor onBack={() => navigate('/')} />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-0 right-0 p-4 space-y-2 z-50">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}

function App() {
  const cloud = useCloudStorage();
  
  useEffect(() => {
    syncServerTime();
  }, []);

  return (
    <>
      <AppDataSync cloud={cloud} />
      <AppShell cloud={cloud} />
    </>
  );
}

export default App;
