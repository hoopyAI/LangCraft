import React from 'react';
import { Document } from '@react-pdf/renderer';
import { ProcessedArticle } from '@core/types';
import { createArticlePdfDocument } from '@/pdf/createArticlePdfDocument';

type PdfSectionOptions = {
  bilingual?: boolean;
  grammar?: boolean;
  exercises?: boolean;
  fullText?: boolean;
};

type CreateMultiArticlePdfDocumentOptions = {
  sections?: PdfSectionOptions;
};

// This file composes multiple ProcessedArticle objects into one PDF.
// IMPORTANT: The user requested the combined PDF to look exactly like the
// single-article PDF. We therefore reuse createArticlePdfDocument() and
// concatenate its pages.

const isReactElement = (value: unknown): value is React.ReactElement =>
  typeof value === 'object' && value !== null && 'props' in (value as any);

const childrenToArray = (children: React.ReactNode): React.ReactNode[] => {
  if (children === null || children === undefined) return [];
  return Array.isArray(children) ? children : [children];
};

export const createMultiArticlePdfDocument = (
  articles: ProcessedArticle[],
  options?: CreateMultiArticlePdfDocumentOptions,
) => {
  const safeArticles = (articles ?? []).filter(Boolean);

  const mergedPages: React.ReactElement[] = [];

  safeArticles.forEach((article, idx) => {
    const single = createArticlePdfDocument(article, {
      explicitTitle: article.title || `Untitled ${idx + 1}`,
      sections: options?.sections,
    });

    // createArticlePdfDocument returns <Document> with one or more <Page>.
    // We extract its children pages and append them into our combined <Document>.
    if (isReactElement(single)) {
      const pages = childrenToArray((single.props as any).children).filter(isReactElement);
      pages.forEach((page, pageIdx) => {
        mergedPages.push(React.cloneElement(page, { key: `a-${idx}-p-${pageIdx}` }));
      });
    }
  });

  return (
    <Document title="Combined Study Guides" author="Notion Creator">
      {mergedPages}
    </Document>
  );
};

export default createMultiArticlePdfDocument;
