import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import axios from 'axios';
import NotionPreview from '@/components/NotionPreview';
import { ProcessedArticle } from '@core/types';
import {
  Upload,
  FileText,
  Loader2,
  Download,
  Send,
  CheckCircle,
  AlertCircle,
  Wand2,
} from 'lucide-react';

type CachedArticle = {
  id: string;
  title: string;
  updatedAt?: string;
  sentenceCount?: number;
};

export default function Home() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<ProcessedArticle | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [notionUrl, setNotionUrl] = useState('');
  const [cachedArticles, setCachedArticles] = useState<CachedArticle[]>([]);
  const [loadingCache, setLoadingCache] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [selectedCacheId, setSelectedCacheId] = useState<string | null>(null);
  const [selectedCacheIds, setSelectedCacheIds] = useState<string[]>([]);
  const [loadingCachedArticleId, setLoadingCachedArticleId] = useState<string | null>(null);
  const [cacheArticleError, setCacheArticleError] = useState('');
  const [downloadingCombinedPdf, setDownloadingCombinedPdf] = useState(false);
  const [publishingSelected, setPublishingSelected] = useState(false);
  const [publishedNotionUrls, setPublishedNotionUrls] = useState<string[]>([]);
  const [pdfSections, setPdfSections] = useState({
    bilingual: true,
    grammar: true,
    exercises: true,
    fullText: true,
  });

  const fetchCacheEntries = useCallback(async () => {
    setLoadingCache(true);
    setCacheError('');
    setCacheArticleError('');
    try {
      const response = await axios.get<{ entries?: CachedArticle[] }>('/api/cache');
      const entries = response.data?.entries ?? [];
      setCachedArticles(entries);
      setSelectedCacheId((prev) => (prev && entries.some((entry) => entry.id === prev) ? prev : null));
      setSelectedCacheIds((prev) => prev.filter((id) => entries.some((entry) => entry.id === id)));
    } catch (err: unknown) {
      console.error('Failed to load cache entries', err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.message
        : err instanceof Error
        ? err.message
        : 'Failed to load cache contents';
      setCacheError(message);
    } finally {
      setLoadingCache(false);
    }
  }, []);

  const formatCacheTimestamp = (value?: string) => {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Unknown';
    }
    return parsed.toLocaleString();
  };

  const computeCacheId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'untitled';
    return trimmed.replace(/[^a-z0-9-_]+/gi, '_');
  };

  const handleCacheRefresh = () => {
    void fetchCacheEntries();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
      const fileName = file.name.replace(/\.txt$/i, '');
      setTitle(fileName);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setArticle(null);
    setNotionUrl('');

    try {
      const response = await axios.post('/api/process', {
        title,
        content
      });
      setArticle(response.data);
      if (response.data?.title) {
        setSelectedCacheId(computeCacheId(response.data.title));
      }
      await fetchCacheEntries();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to process article');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishToNotion = async () => {
    if (!article) return;
    setPublishing(true);
    setError('');
    try {
      const response = await axios.post('/api/publish', article);
      setNotionUrl(response.data.url);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Failed to publish to Notion');
    } finally {
      setPublishing(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!article) {
      alert('Please generate content first.');
      return;
    }

    try {
      const [{ pdf }, { createArticlePdfDocument }, { ensurePdfFonts }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/pdf/createArticlePdfDocument'),
        import('@/pdf/fonts'),
      ]);

      // Fonts must be registered (and fetched/parsed) before react-pdf starts layout.
      // This greatly reduces (and usually eliminates) "Could not resolve font ... 400".
      await ensurePdfFonts();

      const safeTitle = (title || article.title || 'article').trim() || 'article';
      const sanitizedFileName = safeTitle.replace(/[\\/:*?"<>|]+/g, '_');

      const pdfDocument = createArticlePdfDocument(article, {
        explicitTitle: title,
        sections: pdfSections,
      });

      console.log('[PDF] Document created, converting to blob...');
      const instance = pdf(pdfDocument);
      const blob = await instance.toBlob();
      console.log('[PDF] Blob created successfully');

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${sanitizedFileName}.pdf`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      if (err instanceof Error) {
        console.error('PDF generation failed', err.message, err);
      } else {
        console.error('PDF generation failed', err);
      }
      alert('Failed to generate PDF');
    }
  };

  const handleLoadCachedArticle = async (entry: CachedArticle) => {
    setCacheArticleError('');
    setSelectedCacheId(entry.id);
    setLoadingCachedArticleId(entry.id);
    setError('');
    setNotionUrl('');

    try {
      const response = await axios.get<ProcessedArticle>(`/api/cache/${entry.id}`);
      setArticle(response.data);
      setTitle(response.data.title ?? '');
      setContent('');
    } catch (err: unknown) {
      console.error('Failed to load cached article', err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.message
        : err instanceof Error
        ? err.message
        : 'Failed to load cached article';
      setCacheArticleError(message);
    } finally {
      setLoadingCachedArticleId(null);
    }
  };

  const toggleCacheSelection = (id: string) => {
    setSelectedCacheIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const clearCacheSelection = () => {
    setSelectedCacheIds([]);
  };

  const selectAllCached = () => {
    setSelectedCacheIds(cachedArticles.map((entry) => entry.id));
  };

  const handleDownloadCombinedPDF = async () => {
    if (selectedCacheIds.length === 0) {
      alert('Please select at least one document from the library.');
      return;
    }

    setDownloadingCombinedPdf(true);
    setCacheArticleError('');

    try {
      const [{ pdf }, { ensurePdfFonts }, { createMultiArticlePdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/pdf/fonts'),
        import('../pdf/createMultiArticlePdfDocument'),
      ]);

      await ensurePdfFonts();

      // Fetch selected cached articles in parallel.
      const articles = await Promise.all(
        selectedCacheIds.map(async (id) => {
          const response = await axios.get<ProcessedArticle>(`/api/cache/${id}`);
          return response.data;
        }),
      );

      const doc = createMultiArticlePdfDocument(articles, {
        sections: pdfSections,
      });
      const blob = await pdf(doc).toBlob();

      const fileSafeDate = new Date().toISOString().slice(0, 10);
      const fileName = `combined-study-guides-${fileSafeDate}.pdf`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err: unknown) {
      console.error('Combined PDF generation failed', err);
      const message = err instanceof Error ? err.message : 'Failed to generate combined PDF';
      setCacheArticleError(message);
      alert('Failed to generate combined PDF');
    } finally {
      setDownloadingCombinedPdf(false);
    }
  };

  const handlePublishSelectedToNotion = async () => {
    if (selectedCacheIds.length === 0) {
      alert('Please select at least one document from the library.');
      return;
    }

    setPublishingSelected(true);
    setCacheArticleError('');
    setPublishedNotionUrls([]);

    try {
      const urls: string[] = [];
      const errors: string[] = [];

      for (const id of selectedCacheIds) {
        try {
          const articleResponse = await axios.get<ProcessedArticle>(`/api/cache/${id}`);
          const publishResponse = await axios.post('/api/publish', articleResponse.data);
          urls.push(publishResponse.data.url);
        } catch (err: unknown) {
          const message = axios.isAxiosError(err)
            ? err.response?.data?.message || err.message
            : err instanceof Error
            ? err.message
            : 'Unknown error';
          errors.push(`${id}: ${message}`);
        }
      }

      setPublishedNotionUrls(urls);

      if (errors.length > 0) {
        setCacheArticleError(`Some articles failed to publish: ${errors.join('; ')}`);
      }
    } catch (err: unknown) {
      console.error('Publish to Notion failed', err);
      const message = err instanceof Error ? err.message : 'Failed to publish to Notion';
      setCacheArticleError(message);
    } finally {
      setPublishingSelected(false);
    }
  };

  useEffect(() => {
    void fetchCacheEntries();
  }, [fetchCacheEntries]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 font-sans text-slate-900">
      <Head>
        <title>Notion Creator Web</title>
      </Head>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col gap-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <Wand2 className="h-4 w-4" />
                AI-powered study pack generator
              </span>
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
                  Craft immersive French study guides in minutes
                </h1>
                <p className="max-w-2xl text-lg text-slate-600">
                  Upload or paste your article. We create clean bilingual layouts, grammar insights, and a polished PDF that’s ready to share.
                </p>
              </div>
              <div className="rounded-3xl bg-white px-6 py-5 shadow-lg ring-1 ring-slate-200">
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  <div className="space-y-1">
                    <p className="font-medium text-slate-800">Designed for French learners</p>
                    <p>Generate, preview, export, publish</p>
                  </div>
                </div>
              </div>
            </div>
            <aside className="rounded-3xl border border-slate-200 bg-white/90 backdrop-blur px-6 py-6 shadow-xl shadow-slate-200/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Library</p>
                  <h2 className="text-lg font-semibold text-slate-900">Existing study guides</h2>
                </div>
                <button
                  type="button"
                  onClick={handleCacheRefresh}
                  disabled={loadingCache}
                  className={`inline-flex items-center gap-2 rounded-full border border-slate-200/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300/60 focus:ring-offset-1 focus:ring-offset-white ${loadingCache ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  {loadingCache ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>Refresh</span>}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllCached}
                  disabled={loadingCache || cachedArticles.length === 0}
                  className="rounded-full border border-slate-200/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearCacheSelection}
                  disabled={selectedCacheIds.length === 0}
                  className="rounded-full border border-slate-200/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCombinedPDF}
                  disabled={selectedCacheIds.length === 0 || downloadingCombinedPdf}
                  className="ml-auto inline-flex items-center rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {downloadingCombinedPdf ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Building PDF…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      PDF ({selectedCacheIds.length})
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePublishSelectedToNotion}
                  disabled={selectedCacheIds.length === 0 || publishingSelected}
                  className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {publishingSelected ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-3.5 w-3.5" />
                      Notion ({selectedCacheIds.length})
                    </>
                  )}
                </button>
              </div>
              {publishedNotionUrls.length > 0 && (
                <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-700">
                  <p className="font-medium flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Published {publishedNotionUrls.length} article(s):
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {publishedNotionUrls.map((url, idx) => (
                      <li key={idx}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-emerald-800 truncate block"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
                {cacheError ? (
                  <p className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-600">
                    {cacheError}
                  </p>
                ) : cachedArticles.length === 0 ? (
                  <p className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
                    No cached study guides yet. Generate one to see it here.
                  </p>
                ) : (
                  <>
                    {cacheArticleError && (
                      <p className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-600">
                        {cacheArticleError}
                      </p>
                    )}
                    <ul className="space-y-3">
                      {cachedArticles.map((entry) => {
                        const isSelected = selectedCacheId === entry.id;
                        const isChecked = selectedCacheIds.includes(entry.id);
                        const isLoadingEntry = loadingCachedArticleId === entry.id;
                        return (
                          <li key={entry.id}>
                            <div
                              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm transition ${isSelected ? 'border-indigo-300 bg-indigo-50/70 text-indigo-900 shadow-md' : 'border-slate-200/70 bg-slate-50/80 text-slate-900 hover:border-indigo-200 hover:bg-indigo-50/60'} ${isLoadingEntry ? 'opacity-75' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={isChecked}
                                onChange={() => toggleCacheSelection(entry.id)}
                                aria-label={`Select ${entry.title}`}
                              />
                              <button
                                type="button"
                                onClick={() => handleLoadCachedArticle(entry)}
                                disabled={isLoadingEntry}
                                className="flex-1 text-left focus:outline-none"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="truncate text-sm font-medium" title={entry.title}>
                                    {entry.title}
                                  </p>
                                  {isLoadingEntry && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                  <span>{formatCacheTimestamp(entry.updatedAt)}</span>
                                  {typeof entry.sentenceCount === 'number' && (
                                    <span>{entry.sentenceCount} sentences</span>
                                  )}
                                </div>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </aside>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)]">
            <section className="rounded-3xl bg-white/90 backdrop-blur border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 text-sm font-medium text-slate-600">
                Step 1 · Prepare your content
              </div>
              <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                  <div className="lg:col-span-3 space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                        Article title
                      </label>
                      <input
                        type="text"
                        name="title"
                        id="title"
                        required
                        placeholder="Pause Café — La vie à la française"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Upload article (optional)
                      </label>
                      <label
                        htmlFor="file-upload"
                        className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/50"
                      >
                        <Upload className="mb-4 h-12 w-12 text-slate-400 transition group-hover:text-indigo-500" />
                        <p className="text-sm font-medium text-slate-700">
                          Drag & drop or <span className="text-indigo-600">browse files</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">TXT files up to 10MB</p>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".txt"
                          onChange={handleFileUpload}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-2">
                    <label htmlFor="content" className="block text-sm font-medium text-slate-700">
                      Or paste text directly
                    </label>
                    <textarea
                      id="content"
                      name="content"
                      rows={14}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Paste your French article here..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-slate-500">
                    We generate grammar notes, bilingual sentences, and a shareable PDF preview.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">PDF sections:</span>
                    {([
                      ['bilingual', '双语逐句'],
                      ['grammar', '语法要点'],
                      ['exercises', '填空练习'],
                      ['fullText', '全文阅读'],
                    ] as const).map(([key, label]) => (
                      <label
                        key={key}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={pdfSections[key]}
                          onChange={(e) =>
                            setPdfSections((prev) => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={`inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-2 focus:ring-offset-white ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                        Generating...
                      </>
                    ) : (
                      'Generate preview'
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>

        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-8 rounded-2xl border border-red-200/80 bg-red-50/80 p-4 animate-fade-in">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {article && (
          <div className="mt-12 space-y-6 animate-fade-in">
            <div className="sticky top-6 z-10">
              <div className="rounded-3xl bg-slate-900 text-white px-6 py-4 shadow-2xl shadow-slate-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Step 2</p>
                  <h3 className="text-lg font-semibold">Your study guide is ready</h3>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <button
                    onClick={handleDownloadPDF}
                    className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </button>
                  <button
                    onClick={handlePublishToNotion}
                    disabled={publishing}
                    className={`inline-flex items-center justify-center rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60 focus:ring-offset-2 focus:ring-offset-slate-900 ${publishing ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {publishing ? (
                      <>
                        <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                        Publishing…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Publish to Notion
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {notionUrl && (
              <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 animate-fade-in">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Success</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>
                        Page created successfully!{' '}
                        <a
                          href={notionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-emerald-800 underline decoration-emerald-400 underline-offset-4 hover:text-emerald-900"
                        >
                          View in Notion →
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div id="preview-container" className="transform transition-all">
              <NotionPreview article={article} />
            </div>
          </div>
        )}
      </main>
      
      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Notion Creator · Crafted for focused learning
          </p>
        </div>
      </footer>
    </div>
  );
}
