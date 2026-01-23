import { Client } from "@notionhq/client";
import { ProcessedArticle, VocabularyItem } from './types';
import { getColorForIndex } from './utils/colors';
import { dedupeVocabulary } from './utils/vocabulary';
import { buildFillInSentence } from './utils/text';

// Helper to construct Rich Text objects for Notion with highlighting
// We return any[] to match the structure expected by the SDK's loose types in this environment
interface RichTextOptions {
  isChinese?: boolean;
  usedHighlightKeys?: Set<string>;
}

const buildRichText = (text: string, vocabulary: VocabularyItem[], options: RichTextOptions = {}): any[] => {
  const { isChinese = false, usedHighlightKeys } = options;
  if (!vocabulary || vocabulary.length === 0) {
    return [{ type: 'text', text: { content: text } }];
  }

  interface Range {
    start: number;
    end: number;
    word: VocabularyItem;
  }

  const ranges: Range[] = [];
  
  vocabulary.forEach((item) => {
    const searchWord = isChinese ? item.chinese : item.french;
    if (!searchWord) {
      return;
    }

    const keyBase = searchWord.toLowerCase();
    const highlightKey = `${isChinese ? 'zh' : 'fr'}:${keyBase}`;
    if (usedHighlightKeys?.has(highlightKey)) {
      return;
    }

    const escapedWord = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedWord, 'i');
    const match = regex.exec(text);
    
    if (match) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        word: item
      });
      usedHighlightKeys?.add(highlightKey);
    }
  });

  ranges.sort((a, b) => a.start - b.start);

  // Remove overlapping ranges
  const nonOverlappingRanges: Range[] = [];
  let lastEnd = 0;
  
  ranges.forEach(range => {
    if (range.start >= lastEnd) {
      nonOverlappingRanges.push(range);
      lastEnd = range.end;
    }
  });

  const richText: any[] = [];
  let currentPos = 0;

  nonOverlappingRanges.forEach((range) => {
    // Plain text before highlight
    if (range.start > currentPos) {
      richText.push({
        type: 'text',
        text: { content: text.slice(currentPos, range.start) }
      });
    }

    // Highlighted text with color, bold, and underline
    const color = getColorForIndex(range.word.colorIndex);
    richText.push({
      type: 'text',
      text: { content: text.slice(range.start, range.end) },
      annotations: { 
        color: color.notionColor,
        bold: true,
        underline: true
      }
    });

    currentPos = range.end;
  });

  // Remaining text
  if (currentPos < text.length) {
    richText.push({
      type: 'text',
      text: { content: text.slice(currentPos) }
    });
  }

  return richText;
};

const appendBlockChildren = async (notion: Client, parentId: string, blocks: any[], chunkSize = 90) => {
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    await notion.blocks.children.append({
      block_id: parentId,
      children: chunk
    });
  }
};

export const createNotionPage = async (
  token: string, 
  parentId: string, 
  article: ProcessedArticle,
  useProxy: boolean = false // Default to false for server-side usage
): Promise<string> => {
  
  // Initialize Notion Client
  const notion = new Client({
    auth: token,
    baseUrl: useProxy ? "https://corsproxy.io/?https://api.notion.com" : undefined,
  });

  // 1. Build Blocks
  const children: any[] = [];
  const usedHighlightKeys = new Set<string>();

  if (article.difficultyLevel) {
    children.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '🎯' },
        rich_text: [
          {
            type: 'text',
            text: { content: `推荐难度：${article.difficultyLevel}` },
            annotations: { bold: true }
          }
        ]
      }
    });
  }

  // Full article section before vocabulary
  if (article.segments.length > 0) {
    const fullFrench = article.segments.map((segment) => segment.french).join(' ');
    const fullChinese = article.segments.map((segment) => segment.chinese).join(' ');

    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '1 📰 全文阅读' } }]
      }
    });

    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: '法语原文：' },
            annotations: { bold: true }
          },
          { type: 'text', text: { content: fullFrench ? `\n${fullFrench}` : '' } }
        ]
      }
    });

    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: '中文翻译：' },
            annotations: { bold: true }
          },
          { type: 'text', text: { content: fullChinese ? `\n${fullChinese}` : '' } }
        ]
      }
    });
  }


  if (article.segments.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '2 🔎 双语逐句' } }]
      }
    });
  }

  // Segments as Column Lists (Rows) - each sentence in two columns
  article.segments.forEach((segment) => {
    // Build rich text with vocabulary highlighting for both French and Chinese
    const frenchRichText = segment.vocabulary.length > 0 
      ? buildRichText(segment.french, segment.vocabulary, { usedHighlightKeys })
      : [{ type: 'text', text: { content: segment.french } }];

    const chineseRichText = segment.vocabulary.length > 0
      ? buildRichText(segment.chinese || "", segment.vocabulary, { isChinese: true, usedHighlightKeys })
      : [{ type: 'text', text: { content: segment.chinese || "" } }];

    const frenchColumnChildren: any[] = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: frenchRichText
        }
      }
    ];

    children.push({
      object: 'block',
      type: 'column_list',
      column_list: {
        children: [
          {
            object: 'block',
            type: 'column',
            column: {
              children: frenchColumnChildren
            }
          },
          {
            object: 'block',
            type: 'column',
            column: {
              children: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: chineseRichText
                  }
                }
              ]
            }
          }
        ]
      }
    });
  });

  // Grammar highlights section
  if (article.grammarHighlights && article.grammarHighlights.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '3 📘 语法要点' } }]
      }
    });

    article.grammarHighlights.forEach((point, index) => {
      const richText: any[] = [
        {
          type: 'text',
          text: { content: `${index + 1}. ${point.title}` },
          annotations: { bold: true }
        },
        { type: 'text', text: { content: '\n' } },
        {
          type: 'text',
          text: { content: point.pattern },
          annotations: { code: true }
        },
        { type: 'text', text: { content: '\n' } },
        {
          type: 'text',
          text: { content: point.explanation }
        }
      ];

      if (point.exampleFrench) {
        richText.push({ type: 'text', text: { content: '\n例句：' } });
        richText.push({
          type: 'text',
          text: { content: point.exampleFrench },
          annotations: { italic: true }
        });
      }

      if (point.exampleChinese) {
        richText.push({ type: 'text', text: { content: '\n中文：' } });
        richText.push({
          type: 'text',
          text: { content: point.exampleChinese }
        });
      }

      children.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { emoji: '📎' },
          rich_text: richText
        }
      });
    });
  }

  const allVocab = article.segments.flatMap((segment) => segment.vocabulary);
  const uniqueVocab = dedupeVocabulary(allVocab);

  
  // Fill-in-the-blank section reproducing the text with blanks for vocabulary words
  if (article.segments.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '4 ✏️ 填空练习' } }]
      }
    });

    article.segments.forEach((segment, index) => {
      const fillSentence = buildFillInSentence(segment.french, segment.vocabulary);

      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: `${index + 1}. ${fillSentence}` }
            }
          ]
        }
      });
    });
  }

  if (uniqueVocab.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '5📚 生词卡片' } }]
      }
    });

    // Create vocabulary cards using callout blocks in a grid-like layout
    // Group cards in rows of 3
    const cardsPerRow = 3;
    
    for (let i = 0; i < uniqueVocab.length; i += cardsPerRow) {
      const rowVocab = uniqueVocab.slice(i, i + cardsPerRow);
      
      // Build columns for the vocabulary items
      const columns = rowVocab.map((item) => {
        const color = getColorForIndex(item.colorIndex);
        const displayWord = item.lemma || item.french || '';

        const cardRichText: any[] = [
          {
            type: 'text',
            text: { content: displayWord },
            annotations: { bold: true, underline: true }
          }
        ];

        if (item.partOfSpeech) {
          cardRichText.push({ type: 'text', text: { content: '\n' } });
          cardRichText.push({
            type: 'text',
            text: { content: item.partOfSpeech },
            annotations: { italic: true, color: 'gray' }
          });
        }

        if (item.chinese) {
          cardRichText.push({ type: 'text', text: { content: '\n' } });
          cardRichText.push({
            type: 'text',
            text: { content: item.chinese },
            annotations: { bold: true }
          });
        }
        
        return {
          object: 'block',
          type: 'column',
          column: {
            children: [
              {
                object: 'block',
                type: 'callout',
                callout: {
                  color: color.notionColor,
                  rich_text: cardRichText
                }
              }
            ]
          }
        };
      });

      // Notion requires at least 2 columns in a column_list, so add an empty column if needed
      if (columns.length === 1) {
        columns.push({
          object: 'block',
          type: 'column',
          column: {
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: []
                }
              } as any
            ]
          }
        } as any);
      }
      
      // Create a column list for this row
      children.push({
        object: 'block',
        type: 'column_list',
        column_list: {
          children: columns
        }
      });
    }
  }

  const MAX_CHILDREN_PER_REQUEST = 90;

  try {
    const initialChildren = children.slice(0, MAX_CHILDREN_PER_REQUEST);
    const pagePayload: any = {
      parent: { page_id: parentId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: article.title,
              },
            },
          ],
        },
      }
    };

    if (initialChildren.length > 0) {
      pagePayload.children = initialChildren;
    }

    const response = await notion.pages.create(pagePayload);
    const pageId = (response as any).id;

    if (children.length > initialChildren.length) {
      const remainingChildren = children.slice(initialChildren.length);
      await appendBlockChildren(notion, pageId, remainingChildren, MAX_CHILDREN_PER_REQUEST);
    }
    
    // Cast to any to access the URL which is present on the successful response
    return (response as any).url;
  } catch (error: any) {
    console.error("Notion SDK Error:", error);
    throw new Error(error.message || "Failed to create Notion page using SDK");
  }
};
