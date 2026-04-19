import { type NewsItem } from '../data/mockNews';

export type StoryEnrichment = {
  bullets: string[];
  narration: string;
  detailIntro: string;
  detailImportance: string;
  detailExplain?: string;
  sourceDepth: 'snippet' | 'article';
};

type EnrichmentOptions = {
  contextHints?: string[];
  whyItMatters?: string;
  articleText?: string;
};

const cleanText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();

const splitSentences = (text: string) =>
  cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);

const trimSentence = (sentence: string, maxWords: number) => {
  const words = cleanText(sentence).split(' ').filter(Boolean);

  if (words.length <= maxWords) {
    return cleanText(sentence);
  }

  return `${words.slice(0, maxWords).join(' ')}.`;
};

const buildFallbackBullets = (item: NewsItem, sourceText: string) => {
  const sentences = splitSentences(sourceText);

  if (sentences.length >= 2) {
    return sentences.slice(0, 3).map((sentence) => trimSentence(sentence, 18));
  }

  return [
    trimSentence(item.summary, 18),
    `Die Meldung gehört zum Thema ${item.topic}.`,
    `Details hängen von der eingebundenen Nachrichtenquelle ab.`,
  ];
};

const buildNarration = (item: NewsItem, sourceText: string) => {
  const sentences = splitSentences(sourceText).slice(0, 3);

  if (sentences.length > 0) {
    return sentences.map((sentence) => trimSentence(sentence, 22)).join(' ');
  }

  return trimSentence(item.summary, 28);
};

export const enrichStoryItem = async (
  item: NewsItem,
  options?: EnrichmentOptions
): Promise<StoryEnrichment | null> => {
  const sourceText = cleanText(
    [options?.articleText, item.summary, options?.contextHints?.join(' ')]
      .filter(Boolean)
      .join(' ')
  );

  if (!sourceText) {
    return null;
  }

  const sentences = splitSentences(sourceText);
  const introSentences = sentences.slice(0, 2);

  return {
    bullets: buildFallbackBullets(item, sourceText),
    narration: buildNarration(item, sourceText),
    detailIntro:
      introSentences.length > 0
        ? introSentences.map((sentence) => trimSentence(sentence, 22)).join(' ')
        : trimSentence(item.summary, 28),
    detailImportance:
      options?.whyItMatters || `Die Meldung ordnet ein aktuelles Thema aus ${item.topic} ein.`,
    detailExplain: undefined,
    sourceDepth: options?.articleText ? 'article' : 'snippet',
  };
};
