import { supabase } from '../lib/supabase';
import { dbGet, dbSet } from '../lib/db';
import { fetchViaCloudflareProxy, TELEGRAM_CHAT_ID, CLOUDFLARE_PROXY_URL, ADMIN_AUTH_HEADER } from '../lib/telegram';
import { xorObfuscate, xorDeobfuscate } from '../lib/crypto';
import { BlogPost } from '../../types';

const BLOG_LOCAL_KEY = 'physivault_blogs_local';

// ── Cloudflare Worker URL (dùng chung Worker với vault-index) ──
const VAULT_WORKER_URL = import.meta.env.VITE_VAULT_WORKER_URL || '';
const PURGE_SECRET = import.meta.env.VITE_VAULT_PURGE_SECRET || 'physivault-purge-2025';

// In-memory inflight lock — tránh nhiều tab cùng bắn vào Worker
let _blogInflight: Promise<string | null> | null = null;

async function getBlogIndexFileId(): Promise<string | null> {
    if (_blogInflight) return _blogInflight;
    _blogInflight = (async (): Promise<string | null> => {
        // Ưu tiên: Cloudflare Worker (cache 300s)
        if (VAULT_WORKER_URL) {
            try {
                const res = await fetch(`${VAULT_WORKER_URL}/blog-index`);
                if (res.ok) {
                    const data = await res.json();
                    const fid = Array.isArray(data) ? data[0]?.telegram_file_id : data?.telegram_file_id;
                    if (fid) return fid as string;
                }
            } catch { /* fallback Supabase */ }
        }
        // Fallback: hỏi Supabase trực tiếp
        try {
            const { data } = await supabase.from('blog_index')
                .select('telegram_file_id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
            return data?.telegram_file_id || null;
        } catch { return null; }
    })();
    _blogInflight.finally(() => { _blogInflight = null; });
    return _blogInflight;
}

async function purgeBlogCache(): Promise<void> {
    if (!VAULT_WORKER_URL) return;
    try {
        await fetch(`${VAULT_WORKER_URL}/purge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-purge-secret': PURGE_SECRET },
            body: JSON.stringify({ target: 'blog-index' }),
        });
    } catch { /* purge lỗi không ảnh hưởng luồng chính */ }
}

export const getBlogs = async (isAdmin: boolean): Promise<BlogPost[]> => {
    try {
        if (isAdmin) {
            const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
            if (local.length > 0) return local;
        }

        // ✅ PERF: Cache 15 phút — học sinh không spam Supabase mỗi lần vào trang Blog
        if (!isAdmin) {
            const lastBlogFetch = parseInt(localStorage.getItem('pv_blog_last_fetch') || '0', 10);
            if (Date.now() - lastBlogFetch < 15 * 60 * 1000) {
                const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
                if (local.length > 0) return local.filter(b => b.is_published);
            }
        }

        // Ưu tiên: Cloudflare Worker Cache (300s TTL) → Supabase fallback
        const fileId = await getBlogIndexFileId();
        if (!fileId) {
            const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
            return isAdmin ? local : local.filter(b => b.is_published);
        }

        const arrayBuf = await fetchViaCloudflareProxy(fileId);
        const str = new TextDecoder().decode(arrayBuf);
        const firstChar = str.charCodeAt(0);
        const blogs: BlogPost[] = (firstChar === 91 || firstChar === 123) ? JSON.parse(str) : JSON.parse(xorDeobfuscate(str));

        await dbSet(BLOG_LOCAL_KEY, blogs);
        localStorage.setItem('pv_blog_last_fetch', String(Date.now()));
        return isAdmin ? blogs : blogs.filter(b => b.is_published);
    } catch (e) {
        console.warn('[Blog] Fetch thất bại, dùng cache local:', e);
        const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
        return isAdmin ? local : local.filter(b => b.is_published);
    }
};


export const saveBlog = async (blog: Partial<BlogPost>): Promise<BlogPost | null> => {
    try {
        const localBlogs: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
        let saved: BlogPost;

        if (blog.id) {
            const idx = localBlogs.findIndex(b => b.id === blog.id);
            if (idx === -1) return null;
            saved = { ...localBlogs[idx], ...blog, updated_at: new Date().toISOString() };
            localBlogs[idx] = saved;
        } else {
            saved = {
                id: crypto.randomUUID ? crypto.randomUUID() : `blog_${Date.now()}`,
                title: blog.title || '', summary: blog.summary || '', content: blog.content || '',
                cover_image: blog.cover_image || '', category: blog.category || '',
                tags: blog.tags || [], is_published: blog.is_published || false,
                grade: blog.grade ?? 0, level: blog.level ?? 0,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            };
            localBlogs.unshift(saved);
        }

        await dbSet(BLOG_LOCAL_KEY, localBlogs);
        return saved;
    } catch (e) { console.error('[Blog] Lỗi saveBlog:', e); return null; }
};

export const deleteBlog = async (id: string): Promise<boolean> => {
    try {
        let localBlogs: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
        localBlogs = localBlogs.filter(b => b.id !== id);
        await dbSet(BLOG_LOCAL_KEY, localBlogs);
        return true;
    } catch (e) { console.error('[Blog] Lỗi deleteBlog:', e); return false; }
};

export const syncBlogs = async (onProgress?: (pct: number) => void): Promise<{ success: boolean; fileId?: string; blogCount: number }> => {
    try {
        if (onProgress) onProgress(5);
        const localBlogs: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];

        const jsonStr = xorObfuscate(JSON.stringify(localBlogs));
        if (onProgress) onProgress(20);

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('document', blob, `blog_vault_v1.json`);
        formData.append('caption', `[BLOG-V1] ${localBlogs.length} bài viết | ${new Date().toLocaleString('vi-VN')}`);

        const uploadRes = await fetch(`${CLOUDFLARE_PROXY_URL}/proxy/sendDocument`, {
            method: 'POST', headers: { 'Authorization': ADMIN_AUTH_HEADER }, body: formData
        });
        if (!uploadRes.ok) throw new Error(`Upload thất bại: ${uploadRes.statusText}`);
        const newFileId: string = (await uploadRes.json()).result.document.file_id;
        if (onProgress) onProgress(80);

        const { error: upsertErr } = await supabase.rpc('admin_upsert_blog_index', {
            p_telegram_file_id: newFileId,
            p_blog_count: localBlogs.length,
        });
        if (upsertErr) throw upsertErr;
        if (onProgress) onProgress(95);

        // Purge Cloudflare Worker cache ngay sau khi đăng bài mới
        purgeBlogCache().catch(() => {});

        try { fetchViaCloudflareProxy(newFileId).catch(() => { }); } catch { }

        if (onProgress) onProgress(100);
        return { success: true, fileId: newFileId, blogCount: localBlogs.length };
    } catch (e: any) {
        console.error('[Blog Sync] Lỗi:', e);
        return { success: false, blogCount: 0 };
    }
};

export const fetchBlogsForEditing = async (): Promise<{ blogs: BlogPost[]; loaded: boolean }> => {
    try {
        // Ưu tiên: Cloudflare Worker Cache (300s TTL) → Supabase fallback
        const fileId = await getBlogIndexFileId();
        if (!fileId) {
            const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
            return { blogs: local, loaded: false };
        }
        const arrayBuf = await fetchViaCloudflareProxy(fileId);
        const str = new TextDecoder().decode(arrayBuf);
        const firstChar = str.charCodeAt(0);
        const blogs: BlogPost[] = (firstChar === 91 || firstChar === 123) ? JSON.parse(str) : JSON.parse(xorDeobfuscate(str));

        await dbSet(BLOG_LOCAL_KEY, blogs);
        return { blogs, loaded: true };
    } catch (e) {
        console.warn('[Blog] fetchBlogsForEditing thất bại, dùng local:', e);
        const local: BlogPost[] = await dbGet(BLOG_LOCAL_KEY) || [];
        return { blogs: local, loaded: false };
    }
};
