const COMPACT_TITLE_MAX_WORDS = 9;
const COMPACT_TITLE_MAX_CHARS = 72;

const cleanCompactTitle = (title: string) =>
  title
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^[^A-Za-zÄÖÜäöü0-9]+/, '')
    .replace(/[.,:;?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const trimTrailingFillerWords = (title: string) => {
  const fillerWords = new Set([
    'und',
    'oder',
    '&',
    'für',
    'mit',
    'von',
    'zu',
    'bei',
    'in',
    'an',
    'auf',
    'über',
    'der',
    'die',
    'das',
    'den',
    'dem',
    'des',
    'ein',
    'eine',
  ]);
  const words = title.split(' ').filter(Boolean);

  while (words.length > 3) {
    const lastWord = words.at(-1)?.toLowerCase();

    if (!lastWord || !fillerWords.has(lastWord)) {
      break;
    }

    words.pop();
  }

  return words.join(' ');
};

const compressCompactTitle = (title: string) => {
  const cleanedTitle = cleanCompactTitle(title);

  if (!cleanedTitle) {
    return '';
  }

  const words = cleanedTitle.split(' ').filter(Boolean);
  const compactWords: string[] = [];

  for (const word of words) {
    const nextTitle = [...compactWords, word].join(' ');

    if (
      compactWords.length >= COMPACT_TITLE_MAX_WORDS ||
      (nextTitle.length > COMPACT_TITLE_MAX_CHARS && compactWords.length >= 4)
    ) {
      break;
    }

    compactWords.push(word);
  }

  return trimTrailingFillerWords(compactWords.join(' '));
};

export const summarizeArticleTitle = async (title: string, _summary?: string) => {
  const withoutDateline = title.replace(
    /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+){0,2}\s*(?:\([A-Za-z0-9\-]+\))?\s*[-–—:]\s*)+/u,
    ''
  );

  return compressCompactTitle(withoutDateline || title) || null;
};
