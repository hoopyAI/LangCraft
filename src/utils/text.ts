import { VocabularyItem } from '../types';

export const buildFillInSentence = (sentence: string, vocabulary: VocabularyItem[]): string => {
  if (!vocabulary || vocabulary.length === 0) {
    return sentence;
  }

  let result = sentence;
  const replaced = new Set<string>();
  const lemmaUsage = new Set<string>();

  vocabulary.forEach(item => {
    if (!item.french || !item.chinese) {
      return;
    }

    const lemmaKey = (item.lemma || item.french).toLowerCase();
    if (lemmaUsage.has(lemmaKey)) {
      return;
    }

    const key = `${item.french}|${item.chinese}`;
    if (replaced.has(key)) {
      return;
    }

    const escapedWord = item.french.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedWord, 'i');
    const blankMask = item.french.replace(/[^\s]/g, '_');
    const replacement = `${blankMask}(${item.chinese})`;

    if (regex.test(result)) {
      result = result.replace(regex, replacement);
      replaced.add(key);
      lemmaUsage.add(lemmaKey);
    }
  });

  return result;
};
