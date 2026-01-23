import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ProcessedArticle } from '@core/types';
import { NOTION_COLORS } from '@core/utils/colors';
import { buildFillInSentence } from '@core/utils/text';
import { ensurePdfFonts } from '@/pdf/fonts';

type Segment = ProcessedArticle['segments'][number];
type VocabItem = Segment['vocabulary'][number];

type CreateArticlePdfDocumentOptions = {
  explicitTitle?: string;
  sections?: {
    bilingual?: boolean;
    grammar?: boolean;
    exercises?: boolean;
    fullText?: boolean;
  };
};

const DEFAULT_SECTIONS: Required<NonNullable<CreateArticlePdfDocumentOptions['sections']>> = {
  bilingual: true,
  grammar: true,
  exercises: true,
  fullText: true,
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontFamily: 'NotoSansSC',
    fontSize: 11,
    lineHeight: 1.5,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontFamily: 'NotoSansSC',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#0f172a',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#64748b',
    marginRight: 8,
  },
  metaValue: {
    fontSize: 11,
    color: '#475569',
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 12,
  },
  bilingualCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    breakInside: 'avoid',
  },
  bilingualRow: {
    flexDirection: 'row',
  },
  bilingualColumn: {
    flex: 1,
  },
  bilingualColumnRight: {
    marginLeft: 18,
  },
  columnLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#0f172a',
  },
  bodyTextSecondary: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#475569',
  },
  highlight: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5f5',
    borderRadius: 3,
  },
  grammarCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    breakInside: 'avoid',
  },
  grammarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  grammarTitle: {
    fontSize: 13,
    fontFamily: 'NotoSansSC',
    fontWeight: 700,
    color: '#0f172a',
  },
  grammarBadge: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
  },
  grammarPattern: {
    fontSize: 11,
    color: '#be123c',
    backgroundColor: '#fff1f2',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  grammarExplanation: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 8,
  },
  grammarExampleBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
  },
  grammarExampleFrench: {
    fontSize: 11,
    color: '#0f172a',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  grammarExampleChinese: {
    fontSize: 10,
    color: '#475569',
  },
  fillList: {
    marginTop: 4,
  },
  fillItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    breakInside: 'avoid',
  },
  fillIndex: {
    fontSize: 11,
    fontFamily: 'NotoSansSC',
    fontWeight: 700,
    color: '#0f172a',
    marginRight: 6,
  },
  fillSentence: {
    fontSize: 11,
    color: '#0f172a',
    flex: 1,
  },
  fullTextBlock: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    breakInside: 'avoid',
  },
  fullTextTitle: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 6,
  },
  fullTextContent: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#0f172a',
  },
  fullTextContentSecondary: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#475569',
    // Chinese can be a single long run without spaces; allow breaking so it wraps
    // inside the bordered container instead of overflowing.
    wordBreak: 'break-all',
  },
});

const toRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const trimEdgePunctuation = (value: string) =>
  value
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, '')
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/, '');

// React-PDF does not always break long CJK runs (no spaces) reliably, which can
// make Chinese text visually overflow outside bordered containers.
// Inserting zero-width spaces ( not) between characters gives the layout engine
// valid break opportunities without changing visible output.
// React-PDF doesn't always break long CJK runs (no spaces) reliably.
// The most stable workaround is to render CJK text as a sequence of smaller <Text>
// nodes so the layout engine has real break opportunities.
//
// IMPORTANT: We intentionally avoid inserting \u200B zero-width-spaces because
// some font/renderer combinations can show artifacts (overlap or replacement glyphs).
const renderCjkText = (raw: string, keyPrefix: string) => {
  // Split to graphemes-ish by code units. For CJK this is usually safe.
  // Keep newlines/spaces as-is.
  const chars = Array.from(raw);
  return chars.map((ch, idx) => (
    <Text key={`${keyPrefix}-${idx}`}>{ch}</Text>
  ));
};

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

const getHighlightVisual = (colorIndex: number) => {
  const color = NOTION_COLORS[colorIndex % NOTION_COLORS.length];
  return {
    textColor: color.hex,
    backgroundColor: toRgba(color.hex, 0.18),
    borderColor: toRgba(color.hex, 0.35),
  };
};

const renderFrenchSentence = (segment: Segment) => {
  const tokens = segment.french.split(/(\s+)/);
  const vocabularyForms = segment.vocabulary.map((vocab) => ({
    vocab,
    forms: new Set<string>([
      ...toMatchForms(vocab.french),
      ...toMatchForms(vocab.lemma),
    ]),
  }));

  return (
    <Text style={styles.bodyText}>
      {tokens.map((token, idx) => {
        if (!token.trim()) {
          return (
            <Text key={`fr-space-${idx}`}>
              {token}
            </Text>
          );
        }

        const tokenForms = toMatchForms(token);
        if (tokenForms.length === 0) {
          return (
            <Text key={`fr-word-${idx}`}>
              {token}
            </Text>
          );
        }

        const vocabMatch = vocabularyForms.find((entry) =>
          tokenForms.some((form) => entry.forms.has(form)),
        );
        const vocab = vocabMatch?.vocab;

        if (!vocab) {
          return (
            <Text key={`fr-word-${idx}`}>
              {token}
            </Text>
          );
        }

        const { textColor, backgroundColor, borderColor } = getHighlightVisual(vocab.colorIndex);

        return (
          <Text
            key={`fr-highlight-${idx}`}
            style={[
              styles.highlight,
              {
                color: textColor,
                backgroundColor,
                borderBottomColor: borderColor,
              },
            ]}
          >
            {token}
          </Text>
        );
      })}
    </Text>
  );
};

const renderChineseSentence = (segment: Segment) => {
  const text = segment.chinese;
  if (!text) {
    return <Text style={styles.bodyTextSecondary}>暂无中文翻译</Text>;
  }

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
      nodes.push(
        <Text key={`zh-plain-${cursor}`}>
            {renderCjkText(text.slice(cursor), `zh-plain-${cursor}`)}
        </Text>,
      );
      break;
    }

    if (match.index > cursor) {
      nodes.push(
        <Text key={`zh-plain-${cursor}`}>
          {renderCjkText(text.slice(cursor, match.index), `zh-plain-${cursor}`)}
        </Text>,
      );
    }

    const vocab = match.vocab;
    const term = vocab.chinese?.trim() ?? '';
    const end = match.index + term.length;
    const { textColor, backgroundColor, borderColor } = getHighlightVisual(vocab.colorIndex);

    nodes.push(
      <Text
        key={`zh-highlight-${match.index}`}
        style={[
          styles.highlight,
          {
            color: textColor,
            backgroundColor,
            // Avoid borderBottom underline on Chinese runs; it can render as
            // repeated glyph artifacts depending on font/renderer.
            borderBottomWidth: 0,
          },
        ]}
      >
        {renderCjkText(term, `zh-highlight-${match.index}`)}
      </Text>,
    );

    cursor = end;
  }

  return <Text style={styles.bodyTextSecondary}>{nodes}</Text>;
};

const collectFillExercises = (article: ProcessedArticle) =>
  article.segments
    .map((segment, idx) => {
      const sentence = buildFillInSentence(segment.french, segment.vocabulary);
      if (!sentence.includes('_')) {
        return null;
      }
      return { key: idx, sentence };
    })
    .filter(
      (value): value is { key: number; sentence: string } => value !== null,
    );

export const createArticlePdfDocument = (
  article: ProcessedArticle,
  options?: CreateArticlePdfDocumentOptions,
) => {
  // Ensure font registration kicks off early. Callers that need strict sequencing
  // should await ensurePdfFonts() before invoking react-pdf rendering.
  void ensurePdfFonts();

  const effectiveTitle = options?.explicitTitle?.trim() || article.title || 'Article bilingue';
  const fillExercises = collectFillExercises(article);
  const sections = { ...DEFAULT_SECTIONS, ...(options?.sections ?? {}) };

  return (
    <Document title={effectiveTitle} author="Notion Creator">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{effectiveTitle}</Text>
          {article.difficultyLevel ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Difficulty</Text>
              <Text style={styles.metaValue}>{article.difficultyLevel}</Text>
            </View>
          ) : null}
        </View>

        {sections.bilingual ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionLabel}>双语逐句</Text>
            {article.segments.map((segment, idx) => (
              <View key={`bilingual-${idx}`} style={styles.bilingualCard} wrap={false}>
                <View style={styles.bilingualRow} wrap={false}>
                  <View style={styles.bilingualColumn}>
                    <Text style={styles.columnLabel}>Français</Text>
                    {renderFrenchSentence(segment)}
                  </View>
                  <View style={[styles.bilingualColumn, styles.bilingualColumnRight]}>
                    <Text style={styles.columnLabel}>中文</Text>
                    {renderChineseSentence(segment)}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {sections.grammar && article.grammarHighlights && article.grammarHighlights.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionLabel}>语法要点</Text>
            {article.grammarHighlights.map((point, idx) => (
              <View key={`grammar-${idx}`} style={styles.grammarCard} wrap={false}>
                <View style={styles.grammarHeader}>
                  <Text style={styles.grammarTitle}>{point.title}</Text>
                  <Text style={styles.grammarBadge}>#{idx + 1}</Text>
                </View>
                {point.pattern ? (
                  <Text style={styles.grammarPattern}>{point.pattern}</Text>
                ) : null}
                {point.explanation ? (
                  <Text style={styles.grammarExplanation}>{point.explanation}</Text>
                ) : null}
                {point.exampleFrench || point.exampleChinese ? (
                  <View style={styles.grammarExampleBox} wrap={false}>
                    {point.exampleFrench ? (
                      <Text style={styles.grammarExampleFrench}>{point.exampleFrench}</Text>
                    ) : null}
                    {point.exampleChinese ? (
                      <Text style={styles.grammarExampleChinese}>{point.exampleChinese}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {sections.exercises && fillExercises.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionLabel}>填空练习</Text>
            <View style={styles.fillList}>
              {fillExercises.map((item, index) => (
                <View key={`fill-${item.key}`} style={styles.fillItem} wrap={false}>
                  <Text style={styles.fillIndex}>{index + 1}.</Text>
                  <Text style={styles.fillSentence}>{item.sentence}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {sections.fullText ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionLabel}>全文阅读</Text>
            <View style={styles.fullTextBlock} wrap>
              <Text style={styles.fullTextTitle}>Français</Text>
              <Text style={styles.fullTextContent}>
                {article.segments.map((segment) => segment.french).join(' ')}
              </Text>
            </View>
            <View style={styles.fullTextBlock} wrap>
              <Text style={styles.fullTextTitle}>中文</Text>
              <Text style={styles.fullTextContentSecondary}>
                {renderCjkText(article.segments.map((segment) => segment.chinese).join(' '), 'fulltext-zh')}
              </Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
};

export default createArticlePdfDocument;
