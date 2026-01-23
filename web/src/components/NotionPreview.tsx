import React from 'react';
import { ProcessedArticle } from '@core/types';
import { NOTION_COLORS } from '@core/utils/colors';
import { buildFillInSentence } from '@core/utils/text';

interface NotionPreviewProps {
  article: ProcessedArticle;
}

const toRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getHighlightStyle = (colorIndex: number) => {
  const color = NOTION_COLORS[colorIndex % NOTION_COLORS.length];
  return {
    color: color.hex,
    backgroundColor: toRgba(color.hex, 0.18),
    borderBottom: `1px solid ${toRgba(color.hex, 0.35)}`,
    borderRadius: '4px',
    padding: '0 4px',
  };
};

const trimEdgePunctuation = (value: string) =>
  value
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, '')
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/, '');

const toMatchForms = (value?: string | null) => {
  if (!value) {
    return [];
  }

  const trimmed = trimEdgePunctuation(value.trim().toLowerCase());
  if (!trimmed) {
    return [];
  }

  const forms = new Set<string>([trimmed]);
  trimmed
    .split(/['’]/)
    .map((part) => trimEdgePunctuation(part))
    .filter(Boolean)
    .forEach((part) => forms.add(part));

  return Array.from(forms);
};

const NotionPreview: React.FC<NotionPreviewProps> = ({ article }) => {
  type Segment = ProcessedArticle['segments'][number];
  type VocabItem = Segment['vocabulary'][number];

  const renderFrenchSentence = (segment: Segment) => {
    const tokens = segment.french.split(/(\s+)/);
    const vocabularyForms = segment.vocabulary.map((vocab) => ({
      vocab,
      forms: new Set<string>([
        ...toMatchForms(vocab.french),
        ...toMatchForms(vocab.lemma),
      ]),
    }));

    return tokens.map((token, idx) => {
      if (!token.trim()) {
        return <React.Fragment key={`space-${idx}`}>{token}</React.Fragment>;
      }

      const tokenForms = toMatchForms(token);
      if (tokenForms.length === 0) {
        return <React.Fragment key={`word-${idx}`}>{token}</React.Fragment>;
      }

      const vocabMatch = vocabularyForms.find((entry) =>
        tokenForms.some((form) => entry.forms.has(form)),
      );
      const vocab = vocabMatch?.vocab;

      if (!vocab) {
        return <React.Fragment key={`word-${idx}`}>{token}</React.Fragment>;
      }

      return (
        <span
          key={`highlight-${idx}`}
          style={getHighlightStyle(vocab.colorIndex)}
          title={vocab.chinese}
          className="whitespace-nowrap"
        >
          {token}
        </span>
      );
    });
  };

  const renderChineseSentence = (segment: Segment) => {
    const text = segment.chinese;
    if (!text) return null;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    const findNextMatch = (start: number): { vocab: VocabItem; index: number } | null => {
      let bestMatch: { vocab: VocabItem; index: number } | null = null;

      segment.vocabulary.forEach((vocab) => {
        const term = vocab.chinese?.trim();
        if (!term) return;
        const position = text.indexOf(term, start);
        if (position === -1) return;
        if (!bestMatch || position < bestMatch.index) {
          bestMatch = { vocab, index: position };
        }
      });

      return bestMatch;
    };

    while (cursor < text.length) {
      const match = findNextMatch(cursor);
      if (!match) {
        nodes.push(<React.Fragment key={`zh-${cursor}`}>{text.slice(cursor)}</React.Fragment>);
        break;
      }

      if (match.index > cursor) {
        nodes.push(
          <React.Fragment key={`zh-${cursor}`}>{text.slice(cursor, match.index)}</React.Fragment>,
        );
      }

      const vocab = match.vocab;
      const term = vocab.chinese?.trim() ?? '';
      const end = match.index + term.length;

      nodes.push(
        <span
          key={`zh-highlight-${match.index}`}
          style={getHighlightStyle(vocab.colorIndex)}
          className="whitespace-nowrap"
        >
          {term}
        </span>,
      );

      cursor = end;
    }

    return nodes;
  };

  const fillExercises = article.segments
    .map((segment, idx) => {
      const fillSentence = buildFillInSentence(segment.french, segment.vocabulary);
      if (!fillSentence.includes('_')) {
        return null;
      }
      return { key: idx, sentence: fillSentence };
    })
    .filter((value): value is { key: number; sentence: string } => value !== null);

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-slate-100 py-16 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 lg:px-10">
        <div className="rounded-3xl border border-slate-200 bg-white px-10 py-12 shadow-xl shadow-slate-200/50">
          <div data-preview-section="header" className="space-y-6">
            <h1 className="text-4xl font-semibold tracking-tight leading-snug text-slate-900">{article.title}</h1>

            {article.difficultyLevel && (
              <div className="border-t border-b border-slate-200/80 py-6">
                <div className="grid grid-cols-[120px_1fr] gap-6 text-sm sm:text-[15px]">
                  <span className="uppercase tracking-[0.14em] text-slate-400 font-medium">Difficulty</span>
                  <span className="text-slate-600">{article.difficultyLevel}</span>
                </div>
              </div>
            )}
          </div>

          <section className="mt-12 space-y-6" data-preview-section="bilingual">
            <h2 className="text-xs uppercase tracking-[0.28em] text-slate-400">双语逐句</h2>
            <div className="space-y-8">
              {article.segments.map((segment, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-6">
                  <div
                    className="grid gap-6 md:gap-10 md:grid-cols-2"
                    data-bilingual-grid="true"
                  >
                    <div className="space-y-2" data-bilingual-column="french">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Français</p>
                      <p className="text-[15px] leading-7 text-slate-900/90">
                        {segment.vocabulary.length > 0
                          ? renderFrenchSentence(segment)
                          : segment.french}
                      </p>
                    </div>
                    <div className="space-y-2" data-bilingual-column="chinese">
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">中文</p>
                      <p className="text-[15px] leading-7 text-slate-500">
                        {segment.vocabulary.length > 0
                          ? renderChineseSentence(segment)
                          : segment.chinese}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {article.grammarHighlights && article.grammarHighlights.length > 0 && (
            <section className="mt-16 space-y-6" data-preview-section="grammar">
              <h2 className="text-xs uppercase tracking-[0.28em] text-slate-400">语法要点</h2>
              <div className="space-y-5">
                {article.grammarHighlights.map((point, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-6 py-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-base font-medium text-slate-900">{point.title}</h3>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">#{idx + 1}</span>
                    </div>
                    <code className="block text-sm text-rose-600 bg-white border border-slate-200/70 rounded-lg px-3 py-2 mb-3">
                      {point.pattern}
                    </code>
                    <p className="text-[15px] leading-7 text-slate-600 mb-3">{point.explanation}</p>
                    {(point.exampleFrench || point.exampleChinese) && (
                      <div className="bg-white border border-slate-200/70 rounded-xl px-4 py-3 space-y-1">
                        {point.exampleFrench && (
                          <p className="text-[15px] text-slate-900 italic">{point.exampleFrench}</p>
                        )}
                        {point.exampleChinese && (
                          <p className="text-sm text-slate-500">{point.exampleChinese}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {fillExercises.length > 0 && (
            <section className="mt-16 space-y-6" data-preview-section="fillblank">
              <h2 className="text-xs uppercase tracking-[0.28em] text-slate-400">填空练习</h2>
              <ol className="space-y-3 text-[15px] leading-7 text-slate-900/90 list-decimal list-inside">
                {fillExercises.map((item) => (
                  <li key={item.key} className="rounded-xl border border-slate-200/60 bg-slate-50/80 px-4 py-3">
                    <span className="font-medium">{item.sentence}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="mt-16 space-y-6" data-preview-section="fulltext">
            <h2 className="text-xs uppercase tracking-[0.28em] text-slate-400">全文阅读</h2>
            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Français</h3>
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-900/90">
                  {article.segments.map((s) => s.french).join(' ')}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Chinois</h3>
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-500">
                  {article.segments.map((s) => s.chinese).join(' ')}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default NotionPreview;

