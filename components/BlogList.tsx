import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BlogPost } from '../types';
import { BookOpen, Plus, Search, Filter, FileText } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ─────────────────────────────────────────────────────────────
// Mini renderers — tái sử dụng logic của SolutionRenderer để
// hiển thị đề bài trực tiếp trên card (đồng nhất 100% với
// giao diện chi tiết khi click vào)
// ─────────────────────────────────────────────────────────────

function KatexInlineCard({ tex }: { tex: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!ref.current || !tex?.trim()) return;
        try { katex.render(tex, ref.current, { throwOnError: false, displayMode: false }); }
        catch (_) {}
    }, [tex]);
    return <span ref={ref} />;
}

function KatexBlockCard({ tex }: { tex: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!ref.current || !tex?.trim()) return;
        try { katex.render(tex, ref.current, { throwOnError: false, displayMode: true }); }
        catch (_) {}
    }, [tex]);
    return <div ref={ref} style={{ textAlign: 'center', padding: '4px 0', overflowX: 'auto' }} />;
}

function renderMathCard(text: string): React.ReactNode[] {
    return text.split(/(\$[^$]+\$|\\\([^)]*\\\))/g).map((part, i) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length > 1)
            return <KatexInlineCard key={i} tex={part.slice(1, -1)} />;
        if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 3)
            return <KatexInlineCard key={i} tex={part.slice(2, -2)} />;
        return <span key={i}>{part}</span>;
    });
}

function TextWithMathCard({ text }: { text: string }) {
    if (!text) return null;
    return (
        <>
            {text.split(/(\[center\][\s\S]*?\[\/center\]|\[justify\][\s\S]*?\[\/justify\])/g).map((block, i) => {
                if (block.startsWith('[center]') && block.endsWith('[/center]'))
                    return <div key={i} style={{ textAlign: 'center' }}>{renderMathCard(block.slice(8, -9))}</div>;
                if (block.startsWith('[justify]') && block.endsWith('[/justify]'))
                    return <div key={i} style={{ textAlign: 'justify' }}>{renderMathCard(block.slice(9, -10))}</div>;
                return <React.Fragment key={i}>{renderMathCard(block)}</React.Fragment>;
            })}
        </>
    );
}

// Parse blog.content → lấy câu hỏi đầu tiên để hiển thị trên card
interface CardQuestionData {
    questionNo: string;
    questionText: string;
    questionLatex: string;
    type: 'tu_luan' | 'dung_sai';
}

function parseCardQuestion(content: string): CardQuestionData | null {
    try {
        const parsed = JSON.parse(content);
        if (parsed.type !== 'physics_solution' || !parsed.data) return null;
        const data = parsed.data;
        if (data.questions && data.questions.length > 0) {
            const q = data.questions[0];
            return {
                questionNo: q.question_no || '',
                questionText: q.question_text || '',
                questionLatex: q.question_latex || '',
                type: q.type === 'dung_sai' ? 'dung_sai' : 'tu_luan',
            };
        }
        // Backward compat: root-level single question
        return {
            questionNo: data.question_no || '',
            questionText: data.question_text || '',
            questionLatex: data.question_latex || '',
            type: 'tu_luan',
        };
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// CARD THUMBNAIL: Khung đề bài (toàn bộ card là đề bài)
// ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
    blog: BlogPost;
    isAdmin: boolean;
    onEditBlog?: (blog: BlogPost) => void;
    onClick: () => void;
    gc: { bg: string; text: string; dot: string };
}

function QuestionCard({ blog, isAdmin, onEditBlog, onClick, gc }: QuestionCardProps) {
    const q = parseCardQuestion(blog.content);
    const isDungSai = q?.type === 'dung_sai';
    const hasQuestion = q && (q.questionText || q.questionLatex);

    return (
        <article
            onClick={onClick}
            style={{
                borderRadius: '14px',
                overflow: 'hidden',
                cursor: 'pointer',
                border: '1px solid #E9E9E7',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#CFCFCB';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E9E9E7';
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            {/* ── Thanh Header ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: '1px solid #F0F0EE',
                background: '#FAFAFA',
                gap: '8px',
                flexShrink: 0,
            }}>
                {/* Bên trái: Số câu + Loại bài */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {q?.questionNo ? (
                        <span style={{
                            fontSize: '11px', fontWeight: 700, color: '#1A1A1A',
                            background: '#F1F0EC', padding: '2px 8px',
                            borderRadius: '5px', border: '1px solid #E2E1DD',
                        }}>
                            {q.questionNo}
                        </span>
                    ) : null}
                    <span style={{
                        fontSize: '10px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '5px',
                        background: isDungSai ? '#FEF3C7' : '#EEF0FB',
                        color: isDungSai ? '#92400E' : '#6B7CDB',
                        border: `1px solid ${isDungSai ? '#FDE68A' : '#D0D5F5'}`,
                    }}>
                        {isDungSai ? 'Đúng / Sai' : q ? 'Tự luận' : 'Bài viết'}
                    </span>
                    {/* Grade badge */}
                    <span style={{
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
                        padding: '2px 8px', borderRadius: '5px',
                        background: gc.bg, color: gc.text, border: `1px solid ${gc.dot}30`,
                    }}>
                        {(blog.grade || 0) === 0 ? 'Chung' : `Lớp ${blog.grade}`}
                    </span>
                </div>

                {/* Bên phải: Mức độ (placeholder) + Thêm + Admin status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Mức độ — placeholder cho Bước 2 */}
                    <span style={{
                        fontSize: '10px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '5px',
                        background: '#F1F0EC', color: '#AEACA8',
                        border: '1px solid #E2E1DD',
                    }}>
                        Mức —
                    </span>

                    {/* Nút Thêm — chức năng code sau */}
                    <button
                        onClick={e => e.stopPropagation()}
                        title="Thêm"
                        style={{
                            fontSize: '11px', fontWeight: 700, lineHeight: 1,
                            padding: '2px 7px', borderRadius: '5px',
                            background: '#F1F0EC', color: '#787774',
                            border: '1px solid #E2E1DD', cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EEF0FB'; e.currentTarget.style.color = '#6B7CDB'; e.currentTarget.style.borderColor = '#D0D5F5'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F1F0EC'; e.currentTarget.style.color = '#787774'; e.currentTarget.style.borderColor = '#E2E1DD'; }}
                    >
                        + Thêm
                    </button>

                    {/* Admin: trạng thái đã đăng / nháp */}
                    {isAdmin && (
                        <span style={{
                            fontSize: '9px', fontWeight: 700,
                            padding: '2px 6px', borderRadius: '5px',
                            background: blog.is_published ? '#EAF3EE' : '#F3ECF8',
                            color: blog.is_published ? '#448361' : '#9065B0',
                            border: `1px solid ${blog.is_published ? '#B7D9C4' : '#C8A8DC'}`,
                        }}>
                            {blog.is_published ? 'Đã đăng' : 'Nháp'}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Vùng đề bài (scroll nếu dài, click toàn bộ card = vào xem) ── */}
            {hasQuestion ? (
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '14px 16px',
                        fontSize: '13.5px',
                        color: '#374151',
                        lineHeight: 1.7,
                        fontFamily: "'KaTeX_Main', 'Computer Modern', serif",
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#D1D5DB transparent',
                    }}
                    onWheel={e => e.stopPropagation()}
                >
                    <style>{`.katex { color: #1A1A1A !important; font-size: 1em !important; }`}</style>
                    {q!.questionText && (
                        <div style={{ marginBottom: q!.questionLatex ? '8px' : 0, whiteSpace: 'pre-wrap' }}>
                            <TextWithMathCard text={q!.questionText} />
                        </div>
                    )}
                    {q!.questionLatex && <KatexBlockCard tex={q!.questionLatex} />}
                </div>
            ) : (
                /* Fallback: bài viết thường không phải lời giải */
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '14px 16px',
                    fontSize: '13.5px', color: '#374151', lineHeight: 1.7,
                }}>
                    <p style={{ margin: 0, color: '#787774' }}>{blog.summary}</p>
                </div>
            )}
        </article>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

interface BlogListProps {
    isAdmin: boolean;
    studentGrade?: number | null;
    onReadBlog: (blog: BlogPost) => void;
    onEditBlog?: (blog: BlogPost) => void;
    onCreateBlog?: () => void;
    onBlogsLoaded?: (blogs: BlogPost[]) => void;
    getBlogs: (isAdmin: boolean) => Promise<BlogPost[]>;
}

const estimateReadTime = (content: string): number =>
    Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 200));

const GRADE_COLORS: Record<number, { bg: string; text: string; dot: string }> = {
    12: { bg: '#F3ECF8', text: '#9065B0', dot: '#9065B0' },
    11: { bg: '#EEF0FB', text: '#6B7CDB', dot: '#6B7CDB' },
    10: { bg: '#EAF3EE', text: '#448361', dot: '#448361' },
    0:  { bg: '#F1F0EC', text: '#787774', dot: '#AEACA8' },
};

const BlogList: React.FC<BlogListProps> = ({ isAdmin, studentGrade, onReadBlog, onEditBlog, onCreateBlog, onBlogsLoaded, getBlogs }) => {
    const [blogs, setBlogs] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedTag, setSelectedTag] = useState('');
    const [gradeFilter, setGradeFilter] = useState<number>(0);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const fetchBlogs = async () => {
            setLoading(true);
            const data = await getBlogs(isAdmin);
            setBlogs(data);
            if (onBlogsLoaded) onBlogsLoaded(data);
            setLoading(false);
        };
        fetchBlogs();
    }, [isAdmin]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const categories = useMemo(() => [...new Set(blogs.map(b => b.category).filter(Boolean))], [blogs]);
    const allTags = useMemo(() => [...new Set(blogs.flatMap(b => b.tags || []))], [blogs]);

    const filteredBlogs = useMemo(() => blogs.filter(b => {
        // Ẩn đề thi (exam_paper) khỏi Góc học tập của học sinh — chỉ admin mới thấy để quản lý
        if (!isAdmin && b.category === 'exam_paper') return false;

        // Lọc theo khối lớp học sinh
        const postGrade = b.grade || 0;
        if (!isAdmin && studentGrade) {
            if (postGrade !== 0 && postGrade !== studentGrade) return false;
        }

        // Tab filter
        const matchGrade = gradeFilter === 0 || postGrade === gradeFilter;

        const q = debouncedSearch.toLowerCase();
        const matchSearch = !q || b.title.toLowerCase().includes(q) || b.summary.toLowerCase().includes(q) || (b.tags || []).some(t => t.toLowerCase().includes(q));
        const matchCat = !selectedCategory || b.category === selectedCategory;
        const matchTag = !selectedTag || (b.tags || []).includes(selectedTag);
        return matchSearch && matchCat && matchTag && matchGrade;
    }), [blogs, debouncedSearch, selectedCategory, selectedTag, gradeFilter, isAdmin, studentGrade]);

    const allGradeTabs = [
        { label: 'Tất cả', value: 0, color: '#787774' },
        { label: 'Lớp 12', value: 12, color: '#9065B0' },
        { label: 'Lớp 11', value: 11, color: '#6B7CDB' },
        { label: 'Lớp 10', value: 10, color: '#448361' },
    ];
    // Học sinh chỉ thấy "Tất cả" + tab đúng khối của mình
    const gradeTabs = (!isAdmin && studentGrade)
        ? allGradeTabs.filter(t => t.value === 0 || t.value === studentGrade)
        : allGradeTabs;

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in relative pb-20" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: isAdmin ? '#EEF0FB' : '#F3ECF8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                        {isAdmin
                            ? <FileText style={{ width: '20px', height: '20px', color: '#6B7CDB' }} />
                            : <BookOpen style={{ width: '20px', height: '20px', color: '#9065B0' }} />}
                    </div>
                    <div>
                        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
                            {isAdmin ? 'Quản lý Blog' : 'Góc Học Tập'}
                        </h1>
                        <p style={{ fontSize: '13px', color: '#787774', marginTop: '2px' }}>
                            {isAdmin ? 'Quản lý bài viết & kiến thức chuyên sâu' : 'Kiến thức, mẹo giải bài tập và tài liệu Vật Lý'}
                        </p>
                    </div>
                </div>

                {isAdmin && onCreateBlog && (
                    <button
                        onClick={onCreateBlog}
                        style={{
                            padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            background: '#1A1A1A', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <Plus style={{ width: '15px', height: '15px' }} /> Viết bài mới
                    </button>
                )}
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {gradeTabs.map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setGradeFilter(tab.value)}
                        style={{
                            padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            border: `1px solid ${gradeFilter === tab.value ? tab.color : '#E9E9E7'}`,
                            background: gradeFilter === tab.value ? tab.color : '#fff',
                            color: gradeFilter === tab.value ? '#fff' : '#787774',
                            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}

                <div style={{ width: '1px', height: '20px', background: '#E9E9E7', margin: '0 4px', flexShrink: 0 }} />

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #E9E9E7',
                    background: '#fff', flex: 1, minWidth: '180px'
                }}>
                    <Search style={{ width: '14px', height: '14px', color: '#AEACA8', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Tìm kiếm bài viết..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none', outline: 'none', background: 'transparent', width: '100%',
                            fontSize: '13px', color: '#1A1A1A'
                        }}
                    />
                    {(categories.length > 0 || allTags.length > 0) && (
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            style={{
                                padding: '3px', borderRadius: '5px', border: 'none', background: 'transparent',
                                color: showFilters ? '#6B7CDB' : '#AEACA8', cursor: 'pointer', display: 'flex',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Filter style={{ width: '14px', height: '14px' }} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sub-Filters */}
            {showFilters && (categories.length > 0 || allTags.length > 0) && (
                <div
                    className="animate-fade-in"
                    style={{
                        padding: '16px', borderRadius: '12px', marginBottom: '20px',
                        background: '#fff', border: '1px solid #E9E9E7',
                        display: 'flex', flexDirection: 'column', gap: '12px'
                    }}
                >
                    {categories.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#AEACA8', marginRight: '4px', letterSpacing: '0.05em' }}>Chuyên mục:</span>
                            {categories.map(cat => (
                                <button key={cat} onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                        background: selectedCategory === cat ? '#6B7CDB' : '#F7F6F3',
                                        color: selectedCategory === cat ? '#fff' : '#57564F'
                                    }}>{cat}</button>
                            ))}
                        </div>
                    )}
                    {allTags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#AEACA8', marginRight: '4px', letterSpacing: '0.05em' }}>Thẻ:</span>
                            {allTags.map(tag => (
                                <button key={tag} onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                                    style={{
                                        padding: '3px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 500,
                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                        background: selectedTag === tag ? '#EAF3EE' : '#F7F6F3',
                                        color: selectedTag === tag ? '#448361' : '#AEACA8'
                                    }}>#{tag}</button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
                    <div className="animate-spin" style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #EEF0FB', borderTopColor: '#6B7CDB' }} />
                    <p style={{ fontSize: '13px', color: '#AEACA8', fontWeight: 500 }}>Đang tải bài viết...</p>
                </div>
            ) : filteredBlogs.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '64px 24px', borderRadius: '12px',
                    border: '1px solid #E9E9E7', background: '#fff'
                }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '12px', background: '#F1F0EC',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                    }}>
                        <BookOpen style={{ width: '22px', height: '22px', color: '#CFCFCB' }} />
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A1A', marginBottom: '6px' }}>Chưa có bài viết nào</h3>
                    <p style={{ fontSize: '13px', color: '#AEACA8', maxWidth: '280px', margin: '0 auto' }}>
                        Thầy đang biên tập thêm nội dung. Quay lại sau nhé!
                    </p>
                </div>
            ) : (
                /* ── Grid 2 cột (tối đa), mỗi card tối thiểu 400px ── */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
                    {filteredBlogs.map(blog => {
                        const gc = GRADE_COLORS[blog.grade || 0] || GRADE_COLORS[0];
                        return (
                            <QuestionCard
                                key={blog.id}
                                blog={blog}
                                isAdmin={isAdmin}
                                onEditBlog={onEditBlog}
                                onClick={() => onReadBlog(blog)}
                                gc={gc}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default BlogList;
