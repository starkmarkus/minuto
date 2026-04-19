import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayerStatus,
} from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type NewsItem } from './src/data/mockNews';
import {
  fetchArticleContent,
  type ArticleContent,
  selectRelevantArticleContent,
} from './src/lib/articleContent';
import { fetchNewsForTopics } from './src/lib/news';
import {
  enrichStoryItem,
  type StoryEnrichment,
} from './src/lib/storyEnrichment';
import {
  buildStoryCoverage,
  formatFactualityLabel,
  formatOwnershipLabel,
  type StoryCoverageResult,
} from './src/lib/storyCoverage';
import { synthesizeStoryNarration } from './src/lib/storyTts';
import { summarizeArticleTitle } from './src/lib/titleSummary';

const DEFAULT_TOPIC_LIBRARY = [
  'KI',
  'Startups',
  'Politik',
  'Wirtschaft',
  'Klima',
  'Wissenschaft',
  'Europa',
  'Energie',
  'Gesundheit',
  'Finanzen',
  'China',
  'USA',
  'Cybersecurity',
  'Börse',
  'Geopolitik',
];

const STORAGE_KEY = 'daily-brief-selected-topics';
const VISIBLE_TOPICS_STORAGE_KEY = 'daily-brief-visible-topics';
const TOPIC_LIBRARY_STORAGE_KEY = 'daily-brief-topic-library';
const DEFAULT_TOPICS = ['KI', 'Wirtschaft', 'Politik'];
const DEFAULT_DURATION = 120;
const STORY_PREVIEW_CARD_WIDTH = Math.min(Dimensions.get('window').width - 116, 320);
const STORY_PREVIEW_GAP = 12;
const SHEET_CLOSE_DISTANCE = Dimensions.get('window').height;
const PREMIUM_AUDIO_FALLBACK_INITIAL_DELAY = 3200;
const PREMIUM_AUDIO_FALLBACK_RECHECK_DELAY = 1800;
const PREMIUM_AUDIO_FALLBACK_MAX_CHECKS = 5;

const formatNewsDate = (date?: string) => {
  if (!date) {
    return 'Heute';
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds} Sek.`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes} Min.`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')} Min.`;
};

const formatRelativeAge = (date?: string) => {
  if (!date) {
    return 'gerade eben';
  }

  const diffInMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(date).getTime()) / (1000 * 60))
  );

  if (diffInMinutes < 60) {
    return `vor ${diffInMinutes} Min.`;
  }

  const diffInHours = Math.round(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `vor ${diffInHours} Std.`;
  }

  const diffInDays = Math.round(diffInHours / 24);
  return `vor ${diffInDays} Tg.`;
};

const FEEDBACK_EMAIL = 'feedback@example.com';

const getSourceInitials = (source: string) =>
  source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const inferCoverageScope = (item: NewsItem) => {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();

  if (
    /(deutschland|germany|bundestag|bundesrat|bundesregierung|berlin|hamburg|münchen|munich|deutsche)/i.test(
      haystack
    )
  ) {
    return 'National';
  }

  if (/(eu|brussels|brüssel|europa|europe)/i.test(haystack)) {
    return 'Europa';
  }

  return 'International';
};

const SOFT_HYPHEN = '\u00AD';
const LONG_WORD_MIN_LENGTH = 14;
const GERMAN_HYPHEN_HINTS = [
  'pflicht',
  'pflichten',
  'schutz',
  'technik',
  'politik',
  'preise',
  'entlast',
  'gesetz',
  'modelle',
  'systeme',
  'forschung',
  'energie',
  'industrie',
  'wettbewerb',
  'fähigkeit',
  'faehigkeit',
  'verhandlung',
  'genehmigung',
  'transparenz',
  'maßnahmen',
  'massnahmen',
];

const findSoftHyphenIndex = (word: string, fromIndex = 0) => {
  const lowerWord = word.toLowerCase();

  for (const hint of GERMAN_HYPHEN_HINTS) {
    const hintIndex = lowerWord.indexOf(hint, Math.max(5, fromIndex + 4));

    if (hintIndex > fromIndex + 4 && hintIndex < word.length - 4) {
      return hintIndex;
    }
  }

  const targetIndex = Math.min(word.length - 4, fromIndex + 9);
  const windowStart = Math.max(fromIndex + 5, targetIndex - 3);
  const windowEnd = Math.min(word.length - 4, targetIndex + 3);

  for (let index = targetIndex; index >= windowStart; index -= 1) {
    if (/[aeiouyäöü]/i.test(word[index - 1] ?? '') && /[bcdfghjklmnpqrstvwxyzß]/i.test(word[index] ?? '')) {
      return index;
    }
  }

  for (let index = targetIndex + 1; index <= windowEnd; index += 1) {
    if (/[aeiouyäöü]/i.test(word[index - 1] ?? '') && /[bcdfghjklmnpqrstvwxyzß]/i.test(word[index] ?? '')) {
      return index;
    }
  }

  return targetIndex;
};

const addSoftHyphensToWord = (word: string) => {
  if (word.length < LONG_WORD_MIN_LENGTH || word.includes(SOFT_HYPHEN)) {
    return word;
  }

  const parts: string[] = [];
  let cursor = 0;

  while (word.length - cursor > 11) {
    const splitIndex = findSoftHyphenIndex(word, cursor);

    if (splitIndex <= cursor + 4 || splitIndex >= word.length - 3) {
      break;
    }

    parts.push(word.slice(cursor, splitIndex));
    cursor = splitIndex;
  }

  if (cursor === 0) {
    return word;
  }

  parts.push(word.slice(cursor));
  return parts.join(SOFT_HYPHEN);
};

const addSoftHyphensToHeadline = (headline: string) =>
  headline.replace(/[A-Za-zÄÖÜäöüß]{14,}/g, addSoftHyphensToWord);

const getVisualModeLabel = (seconds: number) => {
  if (seconds <= 60) {
    return 'Ultra Short';
  }

  if (seconds <= 150) {
    return 'Quick Brief';
  }

  return 'Deep Brief';
};

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const getTargetSlides = (topics: string[], durationInSeconds: number) => {
  return Math.max(topics.length, Math.ceil(durationInSeconds / 30));
};

const getDurationLockRatio = (minimumDuration: number) =>
  Math.max(0, Math.min(1, (minimumDuration - 30) / (300 - 30)));

const isCustomTopic = (topic: string) => !DEFAULT_TOPIC_LIBRARY.includes(topic);
const normalizeLookupKey = (topic: string) =>
  topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const getSlidePlaybackDuration = (narration: string) => {
  const wordCount = narration.split(/\s+/).length;
  return Math.max(6500, Math.min(22000, Math.round((wordCount / 2.4) * 1000)));
};

const compactPhrase = (text: string) =>
  text
    .replace(/^dass\s+/i, '')
    .replace(/^dabei\s+/i, '')
    .replace(/^für\s+/i, '')
    .replace(/^im\s+mittelpunkt\s+stehen\s+/i, '')
    .replace(/^relevant\s+ist\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const buildReadableBullet = (text: string) =>
  compactPhrase(text)
    .replace(/^relevant ist dabei vor allem\s+/i, '')
    .replace(/^relevant ist\s+/i, '')
    .replace(/^für [^ ]+ und [^ ]+ ist entscheidend\s*/i, '')
    .replace(/^für [^ ]+ ist entscheidend\s*/i, '')
    .replace(/^im mittelpunkt stehen\s+/i, '')
    .replace(/^besonders relevant sind\s+/i, '')
    .replace(/^das ist vor allem deshalb relevant weil\s+/i, '')
    .replace(/^analysten schauen besonders auf\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const capitalizeSentence = (text: string) =>
  text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;

const normalizeBulletSentence = (text: string) => {
  let bullet = buildReadableBullet(text)
    .replace(/^hier geht es darum,? dass\s+/i, '')
    .replace(/^der punkt ist hier vor allem,? dass\s+/i, '')
    .replace(/^im kern passiert hier gerade folgendes:?\s*/i, '')
    .replace(/^gerade besonders wichtig sind\s+/i, '')
    .replace(/^das ist wichtig, weil\s+/i, '')
    .replace(/^relevant ist das vor allem deshalb, weil\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!bullet) {
    return '';
  }

  if (bullet.length > 120) {
    const firstClause = bullet.split(/(?<=[.!?])\s|,\s/)[0]?.trim();

    if (firstClause && firstClause.length >= 36) {
      bullet = firstClause;
    }
  }

  bullet = bullet.replace(/[.;:!?]+$/g, '').trim();
  return capitalizeSentence(bullet);
};

const buildSentenceBullets = (text?: string) => {
  if (!text) {
    return [];
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => normalizeBulletSentence(part))
    .filter((part) => part.length >= 28);
};

const dedupeBulletSentences = (bullets: string[]) => {
  const seen = new Set<string>();

  return bullets.filter((bullet) => {
    const key = bullet
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const lowerCaseFirstLetter = (text: string) =>
  text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;

const buildPerspectiveSummaryText = (items: NewsItem[]) => {
  if (items.length === 0) {
    return 'Dazu liegen in dieser Auswahl gerade keine passenden Quellen vor.';
  }

  const compactHeadlines = items
    .slice(0, 2)
    .map((item) => buildCompactArticleTitle(item.title, item.summary, 88))
    .filter(Boolean);

  if (compactHeadlines.length === 1) {
    return `Hier wird vor allem betont: ${compactHeadlines[0]}.`;
  }

  return `Hier wird vor allem betont: ${compactHeadlines[0]}. Außerdem spielt ${lowerCaseFirstLetter(compactHeadlines[1])} eine Rolle.`;
};

const buildCoverageStoryHint = (coverage: StoryCoverageResult | null) => {
  if (!coverage || coverage.totalSourceCount === 0) {
    return 'Noch keine eingeordneten Vergleichsquellen für diese Story.';
  }

  if (coverage.blindspot) {
    return coverage.blindspot.explanation;
  }

  const populatedBuckets = coverage.buckets.filter((bucket) => bucket.count > 0);

  if (populatedBuckets.length === 0) {
    return 'Die Coverage wird gerade noch aufgebaut.';
  }

  if (populatedBuckets.length === 1) {
    const adjective =
      populatedBuckets[0].perspective === 'left'
        ? 'linke'
        : populatedBuckets[0].perspective === 'right'
          ? 'rechte'
          : 'zentristische';
    return `Bisher berichten vor allem ${adjective} Quellen über diese Story.`;
  }

  const labels = populatedBuckets.map((bucket) =>
    bucket.perspective === 'left'
      ? 'linke'
      : bucket.perspective === 'right'
        ? 'rechte'
        : 'zentristische'
  );

  if (labels.length === 2) {
    return `Die Coverage verteilt sich aktuell auf ${labels[0]} und ${labels[1]} Quellen.`;
  }

  return `Die Coverage verteilt sich aktuell auf ${labels[0]}, ${labels[1]} und ${labels[2]} Quellen.`;
};

const buildCoverageTransparencyText = (coverage: StoryCoverageResult | null) => {
  const base =
    'Die Einordnung basiert auf Quellenprofilen und sagt nichts Endgültiges über einen einzelnen Artikel aus.';

  if (!coverage?.blindspot) {
    return base;
  }

  return `${coverage.blindspot.label}: ${coverage.blindspot.explanation} ${base}`;
};

const POLITICAL_STORY_TERMS = [
  'politik',
  'geopolitik',
  'krieg',
  'konflikt',
  'iran',
  'israel',
  'gaza',
  'ukraine',
  'russland',
  'nato',
  'sanktion',
  'waffenruhe',
  'waffenstillstand',
  'regierung',
  'bundestag',
  'bundesrat',
  'bundesregierung',
  'ministerium',
  'minister',
  'parlament',
  'koalition',
  'kanzler',
  'eu',
  'brussels',
  'bruessel',
  'kommission',
  'gesetz',
  'regulierung',
  'regulation',
  'wahl',
  'wahlen',
  'aussenpolitik',
  'außenpolitik',
  'diplomatie',
  'zoll',
  'tarif',
];

const isPoliticalStoryItem = (item: NewsItem) => {
  const haystack = normalizeLookupKey(`${item.topic} ${item.title} ${item.summary}`);
  return POLITICAL_STORY_TERMS.some((term) =>
    haystack.includes(normalizeLookupKey(term))
  );
};

const buildContextHints = (item: NewsItem) => {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  const hints: string[] = [];

  if (haystack.includes('dsgvo')) {
    hints.push('DSGVO = europäische Datenschutzregeln');
  }

  if (haystack.includes('digital omnibus')) {
    hints.push('Digital Omnibus = geplantes EU-Paket für Digitalregeln');
  }

  if (haystack.includes('bundesrat')) {
    hints.push('Bundesrat = Länderkammer mit Einfluss auf Bundespolitik');
  }

  if (haystack.includes('ai act')) {
    hints.push('AI Act = EU-Regelwerk für künstliche Intelligenz');
  }

  if (haystack.includes('ets')) {
    hints.push('ETS = EU-Emissionshandel');
  }

  if (haystack.includes('wärmepump')) {
    hints.push('Fokus auf Heizungswende und Energieeffizienz');
  }

  return hints;
};

const NARRATION_COMMENTARY_PATTERNS = [
  /^spannend ist/i,
  /^wichtig ist/i,
  /^relevant ist/i,
  /^das ist wichtig/i,
  /^fuer dein briefing/i,
  /^für dein briefing/i,
  /^kurz gesagt/i,
  /^unterm strich/i,
  /^am ende/i,
];

const buildSummaryOnlyFallbackNarration = (item: NewsItem) => {
  const contextHints = buildContextHints(item)
    .map((hint) => hint.replace(/^Fokus auf\s+/i, ''))
    .map((hint) => hint.replace(/\.$/, '').trim())
    .filter(Boolean);

  const sentences = dedupeSentences([
    ...splitReadableSentences(item.summary),
    ...contextHints.map((hint) =>
      hint.endsWith('.') ? hint : `${hint}.`
    ),
  ]).filter(
    (sentence) =>
      !NARRATION_COMMENTARY_PATTERNS.some((pattern) => pattern.test(sentence))
  );

  if (sentences.length > 0) {
    return sentences.slice(0, 3).join(' ');
  }

  return cleanDetailText(item.summary);
};

const buildFallbackSlideNarration = (item: NewsItem) => {
  return buildSummaryOnlyFallbackNarration(item);
};

const buildFallbackSlideBullets = (item: NewsItem) => {
  const parts = item.summary
    .split(/,|;|\./)
    .map((part) => buildReadableBullet(part))
    .filter((part) => part.length > 24);

  const bullets = [...new Set(parts)].slice(0, 3);
  const contextHints = buildContextHints(item);

  if (bullets.length < 2) {
    bullets.unshift(item.summary.replace(/\.$/, '').trim());
  }

  if (contextHints.length > 0) {
    bullets.push(...contextHints.slice(0, 1));
  }

  if (bullets.length > 0) {
    return bullets.slice(0, 4);
  }

  return [item.summary];
};

const buildWhyItMatters = (item: NewsItem) => {
  const topic = item.topic.toLowerCase();

  if (topic.includes('politik') || topic.includes('europa')) {
    return 'Solche Meldungen sind wichtig, weil hier oft entschieden wird, welche Regeln, Kompromisse oder Blockaden als Nächstes ganz konkrete Folgen für Unternehmen, Behörden und Verbraucher haben.';
  }

  if (topic.includes('wirtschaft') || topic.includes('finanzen') || topic.includes('börse')) {
    return 'Relevant ist das vor allem deshalb, weil solche Entwicklungen schnell auf Investitionen, Preise, Marktstimmung und die wirtschaftliche Planung durchschlagen können.';
  }

  if (
    topic.includes('klima') ||
    topic.includes('energie') ||
    topic.includes('wissenschaft')
  ) {
    return 'Das ist wichtig, weil hier oft sichtbar wird, welche Technologien, Studien oder politischen Maßnahmen tatsächlich in Richtung Umsetzung gehen und nicht nur auf dem Papier diskutiert werden.';
  }

  if (
    topic.includes('ki') ||
    topic.includes('cybersecurity') ||
    topic.includes('startups')
  ) {
    return 'Für dein Briefing ist das relevant, weil hier oft sichtbar wird, welche konkreten Anwendungen, Regeln oder Marktverschiebungen gerade wirklich Substanz bekommen.';
  }

  return 'Der Punkt ist hier vor allem, dass hinter der Schlagzeile oft konkrete Entscheidungen, Konflikte oder Verschiebungen stehen, die in den nächsten Tagen noch wichtiger werden können.';
};

const buildFallbackArticleDetailSections = (item: NewsItem) => {
  const summary = item.summary.endsWith('.') ? item.summary : `${item.summary}.`;
  const focusPoints = buildFallbackSlideBullets(item)
    .slice(0, 3)
    .map((point) => compactPhrase(point))
    .filter(Boolean);
  const contextHints = buildContextHints(item);

  return [
    {
      title: 'Worum es geht',
      body: `Im Kern passiert hier gerade Folgendes: ${summary}${
        focusPoints.length > 0
          ? ` Gerade besonders wichtig sind ${focusPoints.join(', ')}.`
          : ''
      }`,
    },
    {
      title: 'Warum das wichtig ist',
      body: buildWhyItMatters(item),
    },
    ...(contextHints.length > 0
      ? [
          {
            title: 'Begriffe & Kontext',
            body: contextHints.join('. ') + '.',
          },
        ]
      : []),
  ];
};

const SUMMARY_NOISE_PATTERNS = [
  /full article/iu,
  /read article/iu,
  /subscribe/iu,
  /all rights reserved/iu,
  /copyright/iu,
  /newsletter/iu,
];

const ENGLISH_SUMMARY_MARKERS = new Set([
  'the',
  'and',
  'with',
  'from',
  'this',
  'that',
  'will',
  'would',
  'could',
  'says',
  'according',
  'article',
  'full',
  'over',
  'its',
  'their',
  'while',
]);

const GERMAN_SUMMARY_MARKERS = new Set([
  'der',
  'die',
  'das',
  'und',
  'mit',
  'für',
  'fuer',
  'ist',
  'sind',
  'wird',
  'werden',
  'diese',
  'dieser',
  'dieses',
  'konkret',
  'deutschland',
  'eu',
  'bundes',
]);

const cleanDetailText = (text: string) =>
  text
    .replace(/\.\.\.+/g, '.')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();

const isLikelyEnglishSentence = (sentence: string) => {
  const tokens = sentence
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const englishHits = tokens.filter((token) => ENGLISH_SUMMARY_MARKERS.has(token)).length;
  const germanHits = tokens.filter((token) => GERMAN_SUMMARY_MARKERS.has(token)).length;

  return englishHits >= 2 && englishHits > germanHits;
};

const splitReadableSentences = (text?: string) => {
  if (!text) {
    return [];
  }

  const cleaned = cleanDetailText(text);

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .map((sentence) => sentence.replace(/^[•\-–—]\s*/u, ''))
    .map((sentence) =>
      /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
    )
    .filter((sentence) => sentence.length >= 30)
    .filter((sentence) => !SUMMARY_NOISE_PATTERNS.some((pattern) => pattern.test(sentence)));
};

const dedupeSentences = (sentences: string[]) => {
  const seen = new Set<string>();

  return sentences.filter((sentence) => {
    const key = sentence
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const stripSummaryDateline = (sentence: string) =>
  sentence.replace(
    /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+){0,2}\s*(?:\([A-Za-z0-9\-]+\))?\s*[-–—:]\s*)+/u,
    ''
  );

const SUMMARY_CARD_DISALLOWED_PREFIXES = [
  /^im kern passiert/i,
  /^gerade besonders wichtig/i,
  /^warum das wichtig ist/i,
  /^kurz gesagt/i,
];

const SUMMARY_CARD_NOISE_PATTERNS = [
  /\bplus[- ]abo\b/iu,
  /\bprobeabo\b/iu,
  /\bjetzt\b.*\b€|\beuro\b/iu,
  /\b[0-9]+,[0-9]{2}\s*(€|euro)\b/iu,
  /\babonnieren\b/iu,
  /\bregistrieren\b/iu,
  /\bvoller artikel\b/iu,
];

const sanitizeSummaryCardSentence = (sentence: string) =>
  cleanDetailText(stripSummaryDateline(sentence))
    .replace(/^\|+\s*/g, '')
    .replace(/\s*\|+\s*/g, ' ')
    .replace(/^n[a-z0-9]*\s*\|\s*/i, '')
    .trim();

const NARRATION_STOPWORDS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einer',
  'einem',
  'einen',
  'und',
  'oder',
  'aber',
  'doch',
  'mit',
  'von',
  'für',
  'fuer',
  'auf',
  'aus',
  'bei',
  'im',
  'in',
  'am',
  'an',
  'zu',
  'zum',
  'zur',
  'nach',
  'vor',
  'wird',
  'werden',
  'wurden',
  'wurde',
  'ist',
  'sind',
  'war',
  'waren',
  'hat',
  'haben',
  'hier',
  'dort',
  'dabei',
  'aktuell',
  'jetzt',
  'noch',
  'auch',
  'mehr',
  'diese',
  'dieser',
  'dieses',
  'sowie',
]);

const sentenceContentTokens = (sentence: string) =>
  normalizeLookupKey(sentence)
    .split(' ')
    .filter((token) => token.length >= 4 && !NARRATION_STOPWORDS.has(token));

const areNarrationSentencesTooSimilar = (left: string, right: string) => {
  const leftTokens = sentenceContentTokens(left);
  const rightTokens = sentenceContentTokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  const overlapAgainstShorter = shared / Math.min(leftTokens.length, rightTokens.length);
  const overlapAgainstLonger = shared / Math.max(leftTokens.length, rightTokens.length);

  return overlapAgainstShorter >= 0.72 || (shared >= 4 && overlapAgainstLonger >= 0.58);
};

const dedupeSemanticallySimilarSentences = (sentences: string[]) => {
  const deduped: string[] = [];

  sentences.forEach((sentence) => {
    if (deduped.some((existing) => areNarrationSentencesTooSimilar(existing, sentence))) {
      return;
    }

    deduped.push(sentence);
  });

  return deduped;
};

const ARTICLE_TITLE_STOPWORDS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einer',
  'eines',
  'einem',
  'einen',
  'und',
  'oder',
  'mit',
  'für',
  'von',
  'im',
  'in',
  'am',
  'an',
  'auf',
  'bei',
  'zu',
  'zum',
  'zur',
  'über',
  'unter',
  'nach',
]);

const ARTICLE_HEADLINE_VERBS = [
  'fordert',
  'prüft',
  'plant',
  'diskutiert',
  'kritisiert',
  'beschließt',
  'beschliesst',
  'testet',
  'meldet',
  'ringt',
  'setzt',
  'treibt',
  'will',
  'stellt',
  'verhandelt',
  'einigt',
  'einigen',
  'verschärft',
  'verschärfen',
  'lockert',
  'lockern',
];

const normalizeHeadlineWord = (word: string) =>
  word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const trimTrailingStopwords = (text: string) => {
  const words = text.split(' ');

  while (words.length > 4) {
    const last = normalizeHeadlineWord(words[words.length - 1]);

    if (!ARTICLE_TITLE_STOPWORDS.has(last)) {
      break;
    }

    words.pop();
  }

  return words.join(' ');
};

const buildCompactArticleTitle = (
  title: string,
  summary?: string,
  maxLength = 42
) => {
  const cleanedTitle = title.replace(/\s+/g, ' ').trim();
  const segments = cleanedTitle
    .split(/\s[:\-–—|]\s|:\s+| - | – | — | \| /)
    .map((segment) => segment.trim())
    .filter(Boolean);

  let candidate = cleanedTitle;

  if (segments.length > 1) {
    candidate =
      segments[0].length >= 28
        ? segments[0]
        : `${segments[0]} ${segments[1]}`.trim();
  }

  const words = cleanedTitle.split(' ');
  const verbIndex = words.findIndex((word) =>
    ARTICLE_HEADLINE_VERBS.includes(normalizeHeadlineWord(word))
  );

  if (verbIndex >= 0 && verbIndex < words.length - 1) {
    const afterVerb = words.slice(verbIndex + 1).join(' ').trim();

    if (afterVerb.length >= 18) {
      candidate = afterVerb;
    }
  }

  const sourceWords =
    candidate.length <= maxLength ? cleanedTitle.split(' ') : candidate.split(' ');
  const compactWords: string[] = [];

  for (const [index, word] of sourceWords.entries()) {
    const normalizedWord = normalizeHeadlineWord(word);
    const isImportantShortWord = /[A-ZÄÖÜ]{2,}/.test(word);
    const shouldKeep =
      index < 5 ||
      isImportantShortWord ||
      !ARTICLE_TITLE_STOPWORDS.has(normalizedWord);

    if (!shouldKeep) {
      continue;
    }

    const nextText = [...compactWords, word].join(' ');

    if (nextText.length > maxLength && compactWords.length >= 4) {
      break;
    }

    compactWords.push(word);
  }

  const compactTitle = compactWords.join(' ').trim();

  if (!compactTitle) {
    const summaryFallback =
      summary
        ?.split(/[.;]/)[0]
        .replace(/\s+/g, ' ')
        .trim() ?? '';

    if (summaryFallback) {
      const summaryWords = summaryFallback
        .split(' ')
        .filter((word, index) => {
          const normalizedWord = normalizeHeadlineWord(word);
          return index < 6 || !ARTICLE_TITLE_STOPWORDS.has(normalizedWord);
        })
        .slice(0, 7)
        .join(' ');

      return trimTrailingStopwords(summaryWords);
    }

    return trimTrailingStopwords(cleanedTitle.split(' ').slice(0, 6).join(' '));
  }

  return trimTrailingStopwords(compactTitle);
};

export default function App() {
  const [topicLibrary, setTopicLibrary] = useState<string[]>(DEFAULT_TOPIC_LIBRARY);
  const [visibleTopics, setVisibleTopics] = useState<string[]>(DEFAULT_TOPICS);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(DEFAULT_TOPICS);
  const [durationInSeconds, setDurationInSeconds] = useState(DEFAULT_DURATION);
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [coverageByTopic, setCoverageByTopic] = useState<Record<string, NewsItem[]>>({});
  const [newsMode, setNewsMode] = useState<'live' | 'mock' | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [previewStoryIndex, setPreviewStoryIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);
  const [isStoryMuted, setIsStoryMuted] = useState(true);
  const [videoTranslateY] = useState(() => new Animated.Value(0));
  const [storyProgress] = useState(() => new Animated.Value(0));
  const [isArticleOpen, setIsArticleOpen] = useState(false);
  const [articleTranslateY] = useState(() => new Animated.Value(SHEET_CLOSE_DISTANCE));
  const [articleContentTranslateX] = useState(() => new Animated.Value(0));
  const [isTopicSettingsOpen, setIsTopicSettingsOpen] = useState(false);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [addTopicEntryPoint, setAddTopicEntryPoint] = useState<'home' | 'settings'>(
    'settings'
  );
  const [compactArticleTitles, setCompactArticleTitles] = useState<Record<string, string>>(
    {}
  );
  const [articleContentById, setArticleContentById] = useState<
    Record<string, ArticleContent>
  >({});
  const [storyEnrichmentById, setStoryEnrichmentById] = useState<
    Record<string, StoryEnrichment>
  >({});
  const [topicSheetTranslateY] = useState(() => new Animated.Value(0));
  const [newTopicDraft, setNewTopicDraft] = useState('');
  const videoSpeechTokenRef = useRef(0);
  const storyAudioPlaybackTokenRef = useRef(0);
  const storyAudioPendingPlaybackRef = useRef<{
    token: number;
    item: NewsItem;
    isLastSlide: boolean;
    provider: 'premium';
  } | null>(null);
  const storyAudioFallbackAttemptsRef = useRef(0);
  const storyAudioFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVideoClosingRef = useRef(false);
  const isArticleClosingRef = useRef(false);
  const isTopicSheetClosingRef = useRef(false);
  const addTopicInputRef = useRef<TextInput | null>(null);
  const compactTitleRequestsRef = useRef(new Set<string>());
  const articleContentRequestsRef = useRef(new Set<string>());
  const storyEnrichmentRequestsRef = useRef(new Set<string>());
  const storyAudioRequestCacheRef = useRef<Record<string, Promise<{
    provider: 'premium';
    uri: string;
  } | null>>>({});
  const storyAudioCacheRef = useRef<
    Record<string, { provider: 'premium'; uri: string }>
  >({});
  const handledStoryAudioFinishRef = useRef<number | null>(null);
  const storyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyProgressValueRef = useRef(0);
  const storyProgressTargetRef = useRef(1);
  const storyBaseDurationRef = useRef(0);
  const storyRemainingDurationRef = useRef(0);
  const storySlideIdRef = useRef<string | null>(null);
  const storyPausedRef = useRef(false);
  const storySpeechPausedRef = useRef(false);
  const currentNarrationModeRef = useRef<'audio' | 'native' | 'muted' | null>(
    null
  );
  const videoDragWasPlayingRef = useRef(false);
  const [storyAudioPlayer] = useState(() =>
    createAudioPlayer(null, {
      updateInterval: 100,
      keepAudioSessionActive: true,
    })
  );
  const storyAudioStatus = useAudioPlayerStatus(storyAudioPlayer);
  const storyAudioStatusRef = useRef(storyAudioStatus);
  const [podcastStatus, setPodcastStatus] = useState(
    'Wähle deine Themen und erstelle dann deine News Story.'
  );

  useEffect(() => {
    const loadTopics = async () => {
      try {
        const [savedTopics, savedVisibleTopics, savedTopicLibrary] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY),
            AsyncStorage.getItem(VISIBLE_TOPICS_STORAGE_KEY),
            AsyncStorage.getItem(TOPIC_LIBRARY_STORAGE_KEY),
          ]);

        if (savedTopicLibrary) {
          const parsedLibrary = JSON.parse(savedTopicLibrary);

          if (Array.isArray(parsedLibrary) && parsedLibrary.length > 0) {
            setTopicLibrary(parsedLibrary);
          }
        }

        if (savedVisibleTopics) {
          const parsedVisibleTopics = JSON.parse(savedVisibleTopics);

          if (Array.isArray(parsedVisibleTopics)) {
            setVisibleTopics(parsedVisibleTopics);
          }
        }

        if (savedTopics) {
          const parsedTopics = JSON.parse(savedTopics);

          if (Array.isArray(parsedTopics) && parsedTopics.length > 0) {
            setSelectedTopics(parsedTopics);
          }
        }
      } catch {
        setPodcastStatus(
          'Deine Standardthemen sind aktiv. Du kannst sie jederzeit anpassen.'
        );
      } finally {
        setIsReady(true);
      }
    };

    loadTopics();
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selectedTopics)),
      AsyncStorage.setItem(
        VISIBLE_TOPICS_STORAGE_KEY,
        JSON.stringify(visibleTopics)
      ),
      AsyncStorage.setItem(
        TOPIC_LIBRARY_STORAGE_KEY,
        JSON.stringify(topicLibrary)
      ),
    ]).catch(() =>
      setPodcastStatus('Deine Auswahl konnte gerade nicht gespeichert werden.')
    );
  }, [isReady, selectedTopics, topicLibrary, visibleTopics]);

  useEffect(() => {
    const minimumDuration = Math.max(30, selectedTopics.length * 30);

    if (durationInSeconds < minimumDuration) {
      setDurationInSeconds(minimumDuration);
    }
  }, [durationInSeconds, selectedTopics.length]);

  useEffect(() => {
    setSelectedTopics((current) =>
      current.filter((topic) => visibleTopics.includes(topic))
    );
  }, [visibleTopics]);

  useEffect(() => {
    storyAudioStatusRef.current = storyAudioStatus;
  }, [storyAudioStatus]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);

    setIsAudioActiveAsync(true).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (storyTimeoutRef.current) {
        clearTimeout(storyTimeoutRef.current);
      }
      if (storyAudioFallbackTimeoutRef.current) {
        clearTimeout(storyAudioFallbackTimeoutRef.current);
      }
      try {
        storyAudioPlayer.pause();
        void storyAudioPlayer.seekTo(0);
        storyAudioPlayer.replace(null);
      } catch {
        // Ignore shutdown errors.
      }
      storyAudioPlayer.remove();
      Speech.stop();
    };
  }, [storyAudioPlayer]);

  useEffect(() => {
    if (!isTopicSettingsOpen) {
      return;
    }

    isTopicSheetClosingRef.current = false;
    topicSheetTranslateY.setValue(SHEET_CLOSE_DISTANCE);
    Animated.spring(topicSheetTranslateY, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [isTopicSettingsOpen, topicSheetTranslateY]);

  useEffect(() => {
    if (!isTopicSettingsOpen || !isAddingTopic) {
      return;
    }

    const focusTimeout = setTimeout(() => {
      addTopicInputRef.current?.focus();
    }, 260);

    return () => clearTimeout(focusTimeout);
  }, [isAddingTopic, isTopicSettingsOpen]);

  useEffect(() => {
    if (newsItems.length === 0) {
      setCompactArticleTitles({});
      setArticleContentById({});
      setStoryEnrichmentById({});
      compactTitleRequestsRef.current.clear();
      articleContentRequestsRef.current.clear();
      storyEnrichmentRequestsRef.current.clear();
      storyAudioRequestCacheRef.current = {};
      storyAudioCacheRef.current = {};
      return;
    }

    newsItems.forEach((item) => {
      if (compactTitleRequestsRef.current.has(item.id)) {
        return;
      }

      compactTitleRequestsRef.current.add(item.id);

      summarizeArticleTitle(item.title, item.summary)
        .then((compactTitle) => {
          if (!compactTitle) {
            return;
          }

          setCompactArticleTitles((current) => ({
            ...current,
            [item.id]: compactTitle,
          }));
        })
        .catch(() => {
          compactTitleRequestsRef.current.delete(item.id);
        });
    });
  }, [newsItems]);

  useEffect(() => {
    if (newsItems.length === 0) {
      return;
    }

    newsItems.forEach((item) => {
      if (
        !item.articleUrl ||
        articleContentRequestsRef.current.has(item.id) ||
        articleContentById[item.id]
      ) {
        return;
      }

      articleContentRequestsRef.current.add(item.id);

      fetchArticleContent(item.articleUrl)
        .then((content) => {
          const relevantContent = selectRelevantArticleContent(
            content,
            `${item.title}. ${item.summary}`
          );

          if (!relevantContent) {
            return;
          }

          setArticleContentById((current) => ({
            ...current,
            [item.id]: relevantContent,
          }));
        })
        .catch(() => undefined);
    });
  }, [articleContentById, newsItems]);

  useEffect(() => {
    if (newsItems.length === 0) {
      return;
    }

    newsItems.forEach((item) => {
      const articleContent = articleContentById[item.id];
      const currentEnrichment = storyEnrichmentById[item.id];
      const shouldUpgradeToArticle =
        !!articleContent?.text && currentEnrichment?.sourceDepth !== 'article';

      if (
        storyEnrichmentRequestsRef.current.has(item.id) ||
        (currentEnrichment && !shouldUpgradeToArticle)
      ) {
        return;
      }

      storyEnrichmentRequestsRef.current.add(item.id);

      enrichStoryItem(item, {
        contextHints: buildContextHints(item),
        whyItMatters: buildWhyItMatters(item),
        articleText: articleContent?.text,
      })
        .then((enrichment) => {
          if (!enrichment) {
            return;
          }

          delete storyAudioCacheRef.current[item.id];
          delete storyAudioRequestCacheRef.current[item.id];

          setStoryEnrichmentById((current) => ({
            ...current,
            [item.id]: enrichment,
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          storyEnrichmentRequestsRef.current.delete(item.id);
        });
    });
  }, [articleContentById, newsItems, storyEnrichmentById]);

  const interruptStoryNarration = () => {
    handledStoryAudioFinishRef.current = null;
    storyAudioPlaybackTokenRef.current = 0;
    storyAudioPendingPlaybackRef.current = null;
    storyAudioFallbackAttemptsRef.current = 0;

    if (storyAudioFallbackTimeoutRef.current) {
      clearTimeout(storyAudioFallbackTimeoutRef.current);
      storyAudioFallbackTimeoutRef.current = null;
    }

    try {
      storyAudioPlayer.pause();
      void storyAudioPlayer.seekTo(0);
      storyAudioPlayer.replace(null);
    } catch {
      // Ignore audio reset errors.
    }

    Speech.stop();
  };

  const pauseStoryNarration = async () => {
    let pausedCloudflareAudio = false;

    try {
      if (
        storyAudioStatus.isLoaded &&
        storyAudioPlaybackTokenRef.current === videoSpeechTokenRef.current
      ) {
        storyAudioPlayer.pause();
        pausedCloudflareAudio = true;
      }
    } catch {
      pausedCloudflareAudio = false;
    }

    if (pausedCloudflareAudio) {
      storySpeechPausedRef.current = true;
      return;
    }

    try {
      await Speech.pause();
      storySpeechPausedRef.current = true;
    } catch {
      await Speech.stop();
      storySpeechPausedRef.current = false;
    }
  };

  const resumeStoryNarration = async () => {
    try {
      if (
        storyAudioStatus.isLoaded &&
        storyAudioPlaybackTokenRef.current === videoSpeechTokenRef.current &&
        !storyAudioStatus.didJustFinish
      ) {
        storyAudioPlayer.play();
        storySpeechPausedRef.current = false;
        return true;
      }
    } catch {
      // Fall back to native speech below.
    }

    try {
      await Speech.resume();
      storySpeechPausedRef.current = false;
      return true;
    } catch {
      return false;
    }
  };

  const getStoryAudioUri = async (item: NewsItem) => {
    const cachedAudio = storyAudioCacheRef.current[item.id];

    if (cachedAudio) {
      return cachedAudio;
    }

    const pendingRequest = storyAudioRequestCacheRef.current[item.id];

    if (pendingRequest) {
      return pendingRequest;
    }

    const nextRequest = synthesizeStoryNarration(getSlideNarration(item))
      .then((nextAudio) => {
        if (!nextAudio) {
          return null;
        }

        storyAudioCacheRef.current[item.id] = nextAudio;
        return nextAudio;
      })
      .finally(() => {
        delete storyAudioRequestCacheRef.current[item.id];
      });

    storyAudioRequestCacheRef.current[item.id] = nextRequest;
    return nextRequest;
  };

  const prefetchStoryAudio = (items: NewsItem[], startIndex: number, count = 1) => {
    const nextItems = items.slice(startIndex, startIndex + count);

    nextItems.forEach((item) => {
      void getStoryAudioUri(item).catch(() => undefined);
    });
  };

  const getStoryEnrichment = (item: NewsItem) => storyEnrichmentById[item.id];

  const sanitizeNarrationForPlayback = (item: NewsItem, narration: string) => {
    const titleTokens = normalizeLookupKey(item.title)
      .split(' ')
      .filter(Boolean);

    const cleanedSentences = dedupeSemanticallySimilarSentences(
      dedupeSentences(splitReadableSentences(narration))
    ).filter(
      (sentence) => {
        if (NARRATION_COMMENTARY_PATTERNS.some((pattern) => pattern.test(sentence))) {
          return false;
        }

        const sentenceTokens = normalizeLookupKey(sentence)
          .split(' ')
          .filter(Boolean);
        const overlappingTitleTokens = sentenceTokens.filter((token) =>
          titleTokens.includes(token)
        ).length;

        if (
          sentenceTokens.length <= 10 &&
          overlappingTitleTokens >= Math.max(4, Math.floor(titleTokens.length * 0.6))
        ) {
          return false;
        }

        return true;
      }
    );

    if (cleanedSentences.length > 0) {
      return cleanedSentences.slice(0, 3).join(' ');
    }

    return buildSummaryOnlyFallbackNarration(item);
  };

  const getSlideNarration = (item: NewsItem) =>
    sanitizeNarrationForPlayback(
      item,
      getStoryEnrichment(item)?.narration ?? buildFallbackSlideNarration(item)
    );

  const getSlideBullets = (item: NewsItem) => {
    const enrichment = getStoryEnrichment(item);
    const articleContent = articleContentById[item.id];
    const bulletCandidates = dedupeBulletSentences([
      ...(enrichment?.bullets ?? []).map(normalizeBulletSentence),
      ...buildSentenceBullets(enrichment?.detailIntro),
      ...buildSentenceBullets(enrichment?.detailImportance),
      ...buildSentenceBullets(enrichment?.detailExplain),
      ...(articleContent?.paragraphs ?? []).flatMap((paragraph) =>
        buildSentenceBullets(paragraph)
      ),
      ...buildFallbackSlideBullets(item).map(normalizeBulletSentence),
    ]);

    const substantialBullets = bulletCandidates.filter((bullet) => bullet.length >= 32);

    if (substantialBullets.length >= 3) {
      return substantialBullets.slice(0, 4);
    }

    return bulletCandidates.slice(0, 4);
  };

  const buildCurrentSummaryBody = (item: NewsItem) => {
    const enrichment = getStoryEnrichment(item);
    const buildSummaryCandidates = (sentences: string[]) =>
      dedupeSemanticallySimilarSentences(dedupeSentences(sentences))
        .map(sanitizeSummaryCardSentence)
        .filter((sentence) => sentence.length >= 32)
        .filter(
          (sentence) =>
            !SUMMARY_CARD_DISALLOWED_PREFIXES.some((pattern) => pattern.test(sentence)) &&
            !SUMMARY_CARD_NOISE_PATTERNS.some((pattern) => pattern.test(sentence))
        );

    const primaryCandidates = buildSummaryCandidates([
      ...splitReadableSentences(enrichment?.detailIntro),
    ]);
    const fallbackCandidates = buildSummaryCandidates([
      ...splitReadableSentences(item.summary),
    ]);
    const candidates =
      primaryCandidates.length > 0 ? primaryCandidates : fallbackCandidates;

    const germanFirst = candidates.filter((sentence) => !isLikelyEnglishSentence(sentence));
    const usableSentences =
      germanFirst.length >= 2 ? germanFirst : germanFirst.length > 0 ? germanFirst : candidates;

    if (usableSentences.length === 0) {
      const fallbackNarrationSentences = buildSummaryCandidates(
        splitReadableSentences(buildSummaryOnlyFallbackNarration(item))
      );

      if (fallbackNarrationSentences.length > 0) {
        return fallbackNarrationSentences.slice(0, 2).join(' ');
      }

      return cleanDetailText(item.summary);
    }

    return usableSentences.slice(0, 2).join(' ');
  };

  const getArticleDetailSections = (item: NewsItem) => {
    const enrichment = getStoryEnrichment(item);

    if (!enrichment) {
      const fallbackSections = buildFallbackArticleDetailSections(item);

      return [
        {
          title: 'Kurz zusammengefasst',
          body: buildCurrentSummaryBody(item),
        },
        ...fallbackSections
          .slice(1)
          .map((section) => ({
            ...section,
            title:
              section.title === 'Kurz erklärt' ? 'Begriffe & Kontext' : section.title,
          })),
      ];
    }

    const sections = [
      {
        title: 'Kurz zusammengefasst',
        body: buildCurrentSummaryBody(item),
      },
    ];

    if (enrichment.detailExplain) {
      sections.push({
        title: 'Begriffe & Kontext',
        body: enrichment.detailExplain,
      });
    }

    return sections;
  };

  const clearStoryTimeout = () => {
    if (storyTimeoutRef.current) {
      clearTimeout(storyTimeoutRef.current);
      storyTimeoutRef.current = null;
    }
  };

  const resetStoryProgress = () => {
    clearStoryTimeout();
    storyProgress.stopAnimation();
    storyProgress.setValue(0);
    storyProgressValueRef.current = 0;
    storyProgressTargetRef.current = 1;
    storyBaseDurationRef.current = 0;
    storyRemainingDurationRef.current = 0;
    currentNarrationModeRef.current = null;
  };

  const captureStoryProgress = () =>
    new Promise<number>((resolve) => {
      storyProgress.stopAnimation((value) => {
        storyProgressValueRef.current = value;
        resolve(value);
      });
    });

  const getStoryRemainingDuration = () => {
    if (
      currentNarrationModeRef.current === 'audio' &&
      storyAudioStatusRef.current.isLoaded &&
      storyAudioStatusRef.current.duration > 0
    ) {
      return Math.max(
        0,
        Math.round(
          (storyAudioStatusRef.current.duration - storyAudioStatusRef.current.currentTime) *
            1000
        )
      );
    }

    const target = Math.max(0.0001, storyProgressTargetRef.current);
    const remainingShare = Math.max(0, target - storyProgressValueRef.current) / target;
    return Math.max(0, Math.round(storyBaseDurationRef.current * remainingShare));
  };

  const startEstimatedStoryProgress = (duration: number, toValue = 1) => {
    storyProgressTargetRef.current = toValue;
    Animated.timing(storyProgress, {
      toValue,
      duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        storyProgressValueRef.current = toValue;
      }
    });
  };

  const resetArticleSheet = () => {
    isArticleClosingRef.current = false;
    articleTranslateY.setValue(SHEET_CLOSE_DISTANCE);
    articleContentTranslateX.setValue(0);
    setIsArticleOpen(false);
  };

  const closeArticleDetail = () => {
    if (isArticleClosingRef.current) {
      return;
    }

    isArticleClosingRef.current = true;
    Animated.timing(articleTranslateY, {
      toValue: SHEET_CLOSE_DISTANCE,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      resetArticleSheet();
    });
  };

  const pauseCurrentStory = async () => {
    if (!isVideoOpen || !isVideoPlaying) {
      return;
    }

    storyPausedRef.current = true;
    await captureStoryProgress();
    storyRemainingDurationRef.current = getStoryRemainingDuration();
    clearStoryTimeout();

    if (!isStoryMuted) {
      await pauseStoryNarration();
    }

    setIsVideoPlaying(false);
  };

  const pauseStoryForDrag = () => {
    if (!isVideoOpen || !isVideoPlaying) {
      return;
    }

    storyPausedRef.current = true;
    clearStoryTimeout();
    storyProgress.stopAnimation((value) => {
      storyProgressValueRef.current = value;
      storyRemainingDurationRef.current = getStoryRemainingDuration();
    });

    if (!isStoryMuted) {
      void pauseStoryNarration();
    }

    setIsVideoPlaying(false);
  };

  const openArticleDetail = async () => {
    if (!currentVideoItem || isArticleOpen) {
      return;
    }

    await pauseCurrentStory();
    isArticleClosingRef.current = false;
    articleTranslateY.setValue(SHEET_CLOSE_DISTANCE);
    setIsArticleOpen(true);
    Animated.spring(articleTranslateY, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const completeCurrentNarration = (speechToken: number, isLastSlide: boolean) => {
    if (videoSpeechTokenRef.current !== speechToken) {
      return;
    }

    clearStoryTimeout();
    storyProgress.stopAnimation((value) => {
      storyProgressValueRef.current = value;
      Animated.timing(storyProgress, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }).start(() => {
        storyProgressValueRef.current = 1;

        if (isLastSlide) {
          storyProgressTargetRef.current = 1;
          setIsVideoPlaying(false);
          return;
        }

        advanceStorySlide(speechToken);
      });
    });
  };

  const playNativeStoryNarration = (
    item: NewsItem,
    speechToken: number,
    isLastSlide: boolean
  ) => {
    currentNarrationModeRef.current = 'native';
    storyProgress.stopAnimation();
    startEstimatedStoryProgress(
      Math.max(
        storyRemainingDurationRef.current || storyBaseDurationRef.current,
        5000
      ),
      0.96
    );
    Speech.stop();
    Speech.speak(getSlideNarration(item), {
      language: 'de-DE',
      pitch: 1,
      rate: 0.95,
      volume: 1,
      useApplicationAudioSession: false,
      onDone: () => {
        completeCurrentNarration(speechToken, isLastSlide);
      },
      onStopped: () => {
        if (videoSpeechTokenRef.current !== speechToken) {
          return;
        }

        storyProgress.stopAnimation((value) => {
          storyProgressValueRef.current = value;
        });
      },
      onError: () => {
        if (videoSpeechTokenRef.current !== speechToken) {
          return;
        }

        resetStoryProgress();
        setIsVideoPlaying(false);
        setPodcastStatus('Die News Story konnte gerade nicht abgespielt werden.');
      },
    });
  };

  const scheduleStoryAudioFallbackCheck = (
    item: NewsItem,
    speechToken: number,
    isLastSlide: boolean,
    attempt: number = 0
  ) => {
    if (storyAudioFallbackTimeoutRef.current) {
      clearTimeout(storyAudioFallbackTimeoutRef.current);
    }

    storyAudioFallbackAttemptsRef.current = attempt;
    storyAudioFallbackTimeoutRef.current = setTimeout(() => {
      const pendingPlayback = storyAudioPendingPlaybackRef.current;
      const audioStatus = storyAudioStatusRef.current;

      if (
        !pendingPlayback ||
        pendingPlayback.token !== speechToken ||
        videoSpeechTokenRef.current !== speechToken
      ) {
        return;
      }

      if (audioStatus.playing || audioStatus.currentTime > 0) {
        storyAudioPendingPlaybackRef.current = null;
        return;
      }

      if (attempt < PREMIUM_AUDIO_FALLBACK_MAX_CHECKS) {
        scheduleStoryAudioFallbackCheck(
          item,
          speechToken,
          isLastSlide,
          attempt + 1
        );
        return;
      }

      storyAudioPendingPlaybackRef.current = null;
      try {
        storyAudioPlayer.pause();
        void storyAudioPlayer.seekTo(0);
        storyAudioPlayer.replace(null);
      } catch {
        // Ignore cleanup errors before native fallback.
      }
      playNativeStoryNarration(item, speechToken, isLastSlide);
      setPodcastStatus('Premium-Stimme gerade nicht verfügbar, Geräte-Stimme läuft.');
    }, attempt === 0 ? PREMIUM_AUDIO_FALLBACK_INITIAL_DELAY : PREMIUM_AUDIO_FALLBACK_RECHECK_DELAY);
  };

  const advanceStorySlide = (token: number) => {
    if (videoSpeechTokenRef.current !== token) {
      return;
    }

    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    setCurrentVideoIndex((prev) => {
      if (prev >= newsItems.length - 1) {
        storyProgress.stopAnimation();
        storyProgress.setValue(1);
        storyProgressValueRef.current = 1;
        storyProgressTargetRef.current = 1;
        setIsVideoPlaying(false);
        return prev;
      }

      resetStoryProgress();
      return prev + 1;
    });
  };

  useEffect(() => {
    if (!isVideoOpen || !isVideoPlaying || newsItems.length === 0) {
      return;
    }

    const currentItem = newsItems[currentVideoIndex];
    const isLastSlide = currentVideoIndex >= newsItems.length - 1;

    if (!currentItem) {
      setIsVideoPlaying(false);
      return;
    }

    const isResume =
      storyPausedRef.current && storySlideIdRef.current === currentItem.id;
    const speechToken = isResume ? videoSpeechTokenRef.current : ++videoSpeechTokenRef.current;
    const progressTarget = isStoryMuted ? 1 : 0.94;

    if (!isResume) {
      clearStoryTimeout();
      storyProgress.setValue(0);
      storyProgressValueRef.current = 0;
      storyBaseDurationRef.current = getSlidePlaybackDuration(
        getSlideNarration(currentItem)
      );
      storyRemainingDurationRef.current = storyBaseDurationRef.current;
      storySlideIdRef.current = currentItem.id;
      storySpeechPausedRef.current = false;
      currentNarrationModeRef.current = isStoryMuted ? 'muted' : null;
    } else {
      storyRemainingDurationRef.current = getStoryRemainingDuration();
    }

    const remainingDuration = isResume
      ? storyRemainingDurationRef.current
      : storyBaseDurationRef.current;

    storyPausedRef.current = false;

    if (isStoryMuted) {
      currentNarrationModeRef.current = 'muted';
      storyProgress.stopAnimation();
      startEstimatedStoryProgress(remainingDuration, 1);
      clearStoryTimeout();
      storyTimeoutRef.current = setTimeout(() => {
        if (isLastSlide) {
          storyProgressValueRef.current = 1;
          storyProgressTargetRef.current = 1;
          setIsVideoPlaying(false);
          return;
        }

        advanceStorySlide(speechToken);
      }, remainingDuration);
      return;
    }

    if (isResume && storySpeechPausedRef.current) {
      resumeStoryNarration().then((resumed) => {
        if (!resumed) {
          setPodcastStatus('Der Podcast konnte gerade nicht fortgesetzt werden.');
        }
      });
      return;
    }

    interruptStoryNarration();

    getStoryAudioUri(currentItem)
      .then((audioResult) => {
        if (videoSpeechTokenRef.current !== speechToken) {
          return;
        }

        if (!audioResult) {
          playNativeStoryNarration(currentItem, speechToken, isLastSlide);
          return;
        }

        currentNarrationModeRef.current = 'audio';
        storyProgress.stopAnimation();
        handledStoryAudioFinishRef.current = null;
        storyAudioPlaybackTokenRef.current = speechToken;
        storyAudioPendingPlaybackRef.current = {
          token: speechToken,
          item: currentItem,
          isLastSlide,
          provider: audioResult.provider,
        };
        storyAudioFallbackAttemptsRef.current = 0;
        setPodcastStatus('Premium-Stimme lädt ...');
        try {
          setIsAudioActiveAsync(true).catch(() => undefined);
          storyAudioPlayer.pause();
          void storyAudioPlayer.seekTo(0);
        } catch {
          // Ignore reset errors before loading a new narration.
        }
        storyAudioPlayer.replace({ uri: audioResult.uri });
        try {
          storyAudioPlayer.play();
        } catch {
          // We retry once the player reports a loaded state.
        }
        scheduleStoryAudioFallbackCheck(currentItem, speechToken, isLastSlide);
      })
      .catch(() => {
        if (videoSpeechTokenRef.current !== speechToken) {
          return;
        }

        playNativeStoryNarration(currentItem, speechToken, isLastSlide);
      });
  }, [currentVideoIndex, isStoryMuted, isVideoOpen, isVideoPlaying, newsItems, storyProgress]);

  useEffect(() => {
    if (
      isStoryMuted ||
      !isVideoOpen ||
      !isVideoPlaying ||
      currentNarrationModeRef.current !== 'audio' ||
      !storyAudioStatus.isLoaded ||
      storyAudioStatus.duration <= 0
    ) {
      return;
    }

    const progress = Math.max(
      0,
      Math.min(1, storyAudioStatus.currentTime / storyAudioStatus.duration)
    );

    storyProgress.setValue(progress);
    storyProgressValueRef.current = progress;
    storyProgressTargetRef.current = 1;
    storyBaseDurationRef.current = Math.round(storyAudioStatus.duration * 1000);
    storyRemainingDurationRef.current = Math.max(
      0,
      Math.round((storyAudioStatus.duration - storyAudioStatus.currentTime) * 1000)
    );
  }, [
    isStoryMuted,
    isVideoOpen,
    isVideoPlaying,
    storyAudioStatus.currentTime,
    storyAudioStatus.duration,
    storyAudioStatus.isLoaded,
  ]);

  useEffect(() => {
    if (
      isStoryMuted ||
      !isVideoOpen ||
      !isVideoPlaying ||
      !storyAudioStatus.didJustFinish
    ) {
      return;
    }

    const speechToken = storyAudioPlaybackTokenRef.current;

    if (
      !speechToken ||
      handledStoryAudioFinishRef.current === speechToken ||
      videoSpeechTokenRef.current !== speechToken
    ) {
      return;
    }

    handledStoryAudioFinishRef.current = speechToken;
    completeCurrentNarration(
      speechToken,
      currentVideoIndex >= newsItems.length - 1
    );
  }, [
    completeCurrentNarration,
    currentVideoIndex,
    isStoryMuted,
    isVideoOpen,
    isVideoPlaying,
    newsItems.length,
    storyAudioStatus.didJustFinish,
  ]);

  useEffect(() => {
    const pendingPlayback = storyAudioPendingPlaybackRef.current;

    if (
      !pendingPlayback ||
      isStoryMuted ||
      !isVideoOpen ||
      !isVideoPlaying ||
      videoSpeechTokenRef.current !== pendingPlayback.token ||
      !storyAudioStatus.playing
    ) {
      return;
    }

    storyAudioPendingPlaybackRef.current = null;
    if (storyAudioFallbackTimeoutRef.current) {
      clearTimeout(storyAudioFallbackTimeoutRef.current);
      storyAudioFallbackTimeoutRef.current = null;
    }
    setPodcastStatus('Podcast mit Premium-Stimme läuft.');
  }, [
    isStoryMuted,
    isVideoOpen,
    isVideoPlaying,
    storyAudioStatus.playing,
  ]);

  useEffect(() => {
    const pendingPlayback = storyAudioPendingPlaybackRef.current;

    if (
      !pendingPlayback ||
      isStoryMuted ||
      !isVideoOpen ||
      !isVideoPlaying ||
      videoSpeechTokenRef.current !== pendingPlayback.token ||
      !storyAudioStatus.isLoaded ||
      storyAudioStatus.playing ||
      storyAudioStatus.didJustFinish
    ) {
      return;
    }

    try {
      setIsAudioActiveAsync(true).catch(() => undefined);
      storyAudioPlayer.play();
    } catch {
      storyAudioPendingPlaybackRef.current = null;
      if (storyAudioFallbackTimeoutRef.current) {
        clearTimeout(storyAudioFallbackTimeoutRef.current);
        storyAudioFallbackTimeoutRef.current = null;
      }
      playNativeStoryNarration(
        pendingPlayback.item,
        pendingPlayback.token,
        pendingPlayback.isLastSlide
      );
    }
  }, [
    isStoryMuted,
    isVideoOpen,
    isVideoPlaying,
    storyAudioPlayer,
    storyAudioStatus.didJustFinish,
    storyAudioStatus.isLoaded,
    storyAudioStatus.playing,
  ]);

  useEffect(() => {
    if (newsItems.length === 0) {
      return;
    }

    prefetchStoryAudio(newsItems, 0, Math.min(2, newsItems.length));
  }, [newsItems]);

  useEffect(() => {
    if (!isVideoOpen || newsItems.length === 0) {
      return;
    }

    prefetchStoryAudio(newsItems, currentVideoIndex, 2);
  }, [currentVideoIndex, isVideoOpen, newsItems]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((current) =>
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic]
    );
  };

  const removeVisibleTopic = (topic: string) => {
    setVisibleTopics((current) => current.filter((item) => item !== topic));
    setSelectedTopics((current) => current.filter((item) => item !== topic));
  };

  const openTopicSettings = () => {
    setAddTopicEntryPoint('settings');
    setIsAddingTopic(false);
    setNewTopicDraft('');
    setIsTopicSettingsOpen(true);
  };

  const closeTopicSettings = () => {
    if (isTopicSheetClosingRef.current) {
      return;
    }

    isTopicSheetClosingRef.current = true;
    Animated.timing(topicSheetTranslateY, {
      toValue: SHEET_CLOSE_DISTANCE,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setIsTopicSettingsOpen(false);
      setIsAddingTopic(false);
      setAddTopicEntryPoint('settings');
      setNewTopicDraft('');
    });
  };

  const openAddTopicFlow = (entryPoint: 'home' | 'settings') => {
    setAddTopicEntryPoint(entryPoint);
    setIsAddingTopic(true);
    setIsTopicSettingsOpen(true);
  };

  const leaveAddTopicFlow = () => {
    setNewTopicDraft('');

    if (addTopicEntryPoint === 'home') {
      closeTopicSettings();
      return;
    }

    setIsAddingTopic(false);
  };

  const toggleVisibleTopic = (topic: string) => {
    setVisibleTopics((current) => {
      if (current.includes(topic)) {
        return current.filter((item) => item !== topic);
      }

      return [...current, topic];
    });
  };

  const removeCustomTopic = (topic: string) => {
    if (!isCustomTopic(topic)) {
      return;
    }

    setTopicLibrary((current) => current.filter((item) => item !== topic));
    setVisibleTopics((current) => current.filter((item) => item !== topic));
    setSelectedTopics((current) => current.filter((item) => item !== topic));
    setPodcastStatus(`"${topic}" wurde entfernt.`);
  };

  const addCustomTopic = () => {
    const nextTopic = newTopicDraft.replace(/\s+/g, ' ').trim();

    if (!nextTopic) {
      return;
    }

    const alreadyExists = topicLibrary.some(
      (topic) => topic.toLowerCase() === nextTopic.toLowerCase()
    );

    if (!alreadyExists) {
      setTopicLibrary((current) => [...current, nextTopic]);
    }

    setVisibleTopics((current) =>
      current.some((topic) => topic.toLowerCase() === nextTopic.toLowerCase())
        ? current
        : [...current, nextTopic]
    );
    setSelectedTopics((current) =>
      current.some((topic) => topic.toLowerCase() === nextTopic.toLowerCase())
        ? current
        : [...current, nextTopic]
    );
    setNewTopicDraft('');
    setPodcastStatus(`"${nextTopic}" wurde zu deinen Interessen hinzugefügt.`);

    if (addTopicEntryPoint === 'home') {
      closeTopicSettings();
      return;
    }

    setIsAddingTopic(false);
  };

  const startPodcast = async () => {
    if (selectedTopics.length < 1) {
      setPodcastStatus('Bitte wähle mindestens ein Thema aus.');
      return;
    }

    setIsGenerating(true);
    setPodcastStatus(
      'Minuto sammelt aktuelle Meldungen und erstellt gerade deine Story ...'
    );
    const targetSlides = getTargetSlides(selectedTopics, durationInSeconds);

    const result = await fetchNewsForTopics(selectedTopics, targetSlides);

    setNewsItems(result.items);
    setCoverageByTopic(result.coverageByTopic);
    setNewsMode(result.mode);
    setPreviewStoryIndex(0);
    if (result.items[0]) {
      await Promise.race([
        getStoryAudioUri(result.items[0]).catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 3200)),
      ]);
    }
    setIsGenerating(false);
    prefetchStoryAudio(result.items, 0, Math.min(2, result.items.length));

    if (result.mode === 'live') {
      setPodcastStatus(
        `Minuto hat ${result.items.length} aktuelle Meldungen gefunden. Deine Story für ungefähr ${formatDuration(durationInSeconds)} ist bereit.`
      );
      return;
    }

    setPodcastStatus(
      `Minuto zeigt gerade ${result.items.length} Vorschau-Meldungen. Deine Story für ungefähr ${formatDuration(durationInSeconds)} ist bereit.`
    );
  };

  const clearCurrentBriefing = async () => {
    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    setIsVideoOpen(false);
    setIsVideoPlaying(false);
    setCurrentVideoIndex(0);
    setPreviewStoryIndex(0);
    setNewsItems([]);
    setCoverageByTopic({});
    setNewsMode(null);
    setPodcastStatus(
      'Deine letzte Story wurde gelöscht. Wähle neue Themen oder passe die Länge an.'
    );
  };

  const openVideoBriefingAt = async (index: number) => {
    if (newsItems.length === 0) {
      setPodcastStatus('Erstelle zuerst eine Story, bevor du sie öffnest.');
      return;
    }

    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    setCurrentVideoIndex(index);
    isVideoClosingRef.current = false;
    videoTranslateY.setValue(0);
    setIsStoryMuted(true);
    setIsVideoOpen(true);
    setIsVideoPlaying(true);
    prefetchStoryAudio(newsItems, index, 2);
    setPodcastStatus('Deine News Story ist geöffnet.');
  };

  const closeVideoBriefing = async () => {
    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    videoDragWasPlayingRef.current = false;
    setIsVideoDragging(false);
    setIsVideoPlaying(false);
    setIsStoryMuted(true);
    setIsVideoOpen(false);
    setCurrentVideoIndex(0);
    videoTranslateY.setValue(0);
    isVideoClosingRef.current = false;
  };

  const toggleStorySound = async () => {
    if (!isStoryMuted) {
      interruptStoryNarration();
    }

    if (isStoryMuted && currentVideoItem) {
      void getStoryAudioUri(currentVideoItem).catch(() => undefined);
    }

    videoSpeechTokenRef.current += 1;
    resetStoryProgress();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    setIsStoryMuted((current) => !current);
    setIsVideoPlaying(true);
  };

  const toggleVideoPlayback = async () => {
    if (!isVideoOpen) {
      return;
    }

    if (isVideoPlaying) {
      await pauseCurrentStory();
      return;
    }

    setIsVideoPlaying(true);
  };

  const goToVideoSlide = async (index: number) => {
    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    setCurrentVideoIndex(index);
    setIsVideoPlaying(true);
  };

  const goToPreviousVideoSlide = async () => {
    if (newsItems.length === 0) {
      return;
    }

    if (
      currentVideoIndex >= newsItems.length - 1 &&
      storyProgressValueRef.current >= 0.999
    ) {
      videoSpeechTokenRef.current += 1;
      interruptStoryNarration();
      resetStoryProgress();
      resetArticleSheet();
      storyPausedRef.current = false;
      storySpeechPausedRef.current = false;
      storySlideIdRef.current = null;
      setIsVideoPlaying(true);
      return;
    }

    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    setCurrentVideoIndex((prev) => Math.max(0, prev - 1));
    setIsVideoPlaying(true);
  };

  const goToNextVideoSlide = async () => {
    if (newsItems.length === 0) {
      return;
    }

    if (currentVideoIndex >= newsItems.length - 1) {
      if (storyProgressValueRef.current < 0.999) {
        clearStoryTimeout();
        videoSpeechTokenRef.current += 1;
        interruptStoryNarration();
        storyPausedRef.current = false;
        storySpeechPausedRef.current = false;
        storyProgress.stopAnimation();
        storyProgress.setValue(1);
        storyProgressValueRef.current = 1;
        storyProgressTargetRef.current = 1;
        setIsVideoPlaying(false);
        return;
      }

      await closeVideoBriefing();
      return;
    }

    videoSpeechTokenRef.current += 1;
    interruptStoryNarration();
    resetStoryProgress();
    resetArticleSheet();
    storyPausedRef.current = false;
    storySpeechPausedRef.current = false;
    storySlideIdRef.current = null;
    setCurrentVideoIndex((prev) => Math.min(newsItems.length - 1, prev + 1));
    setIsVideoPlaying(true);
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (isArticleOpen) {
        return false;
      }

      return (
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      );
    },
    onMoveShouldSetPanResponderCapture: (_, gestureState) => {
      if (isArticleOpen) {
        return false;
      }

      return (
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      );
    },
    onPanResponderGrant: () => {
      if (isArticleOpen || isVideoClosingRef.current) {
        return;
      }

      videoDragWasPlayingRef.current = isVideoPlaying;
      setIsVideoDragging(true);

      if (isVideoPlaying) {
        pauseStoryForDrag();
      }
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        videoTranslateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: async (_, gestureState) => {
      setIsVideoDragging(false);

      if (gestureState.dy > 140) {
        isVideoClosingRef.current = true;
        videoSpeechTokenRef.current += 1;
        interruptStoryNarration();
        setIsVideoPlaying(false);
        Animated.timing(videoTranslateY, {
          toValue: 900,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          closeVideoBriefing();
        });
        return;
      }

      Animated.spring(videoTranslateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        if (videoDragWasPlayingRef.current) {
          setIsVideoPlaying(true);
        }

        videoDragWasPlayingRef.current = false;
      });
    },
    onPanResponderTerminate: () => {
      setIsVideoDragging(false);
      Animated.spring(videoTranslateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        if (videoDragWasPlayingRef.current) {
          setIsVideoPlaying(true);
        }

        videoDragWasPlayingRef.current = false;
      });
    },
  });

  const resetTopicSheetPosition = () => {
    Animated.spring(topicSheetTranslateY, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const sheetHandlePanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 2 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      Math.abs(gestureState.dy) > 2 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      topicSheetTranslateY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 110) {
        closeTopicSettings();
        return;
      }

      resetTopicSheetPosition();
    },
    onPanResponderTerminate: () => {
      resetTopicSheetPosition();
    },
  });

  const currentVideoItem = newsItems[currentVideoIndex];
  const currentArticleDetails = currentVideoItem
    ? getArticleDetailSections(currentVideoItem)
    : [];
  const currentSummaryBody = currentVideoItem
    ? buildCurrentSummaryBody(currentVideoItem)
    : '';
  const currentCompactArticleTitle = currentVideoItem
    ? compactArticleTitles[currentVideoItem.id] ??
      buildCompactArticleTitle(currentVideoItem.title, currentVideoItem.summary)
    : '';
  const currentStoryCoverage = currentVideoItem
    ? buildStoryCoverage(
        currentVideoItem,
        coverageByTopic[normalizeLookupKey(currentVideoItem.topic)] ?? []
      )
    : null;
  const currentShouldShowPerspectives = currentVideoItem
    ? isPoliticalStoryItem(currentVideoItem)
    : false;
  const currentPerspectiveBuckets = currentStoryCoverage?.buckets ?? [];
  const currentPerspectiveTotal = currentStoryCoverage?.ratedSourceCount ?? 0;
  const currentCoverageCards = currentStoryCoverage?.items.slice(0, 6) ?? [];
  const currentStoryProgressWidth = storyProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const articleBackdropOpacity = articleTranslateY.interpolate({
    inputRange: [0, SHEET_CLOSE_DISTANCE * 0.7, SHEET_CLOSE_DISTANCE],
    outputRange: [0.62, 0.22, 0],
    extrapolate: 'clamp',
  });
  const minimumDuration = Math.max(30, selectedTopics.length * 30);
  const durationLockRatio = getDurationLockRatio(minimumDuration);

  const sendArticleFeedback = async () => {
    if (!currentVideoItem) {
      return;
    }

    const compactSummary = (currentSummaryBody || currentVideoItem.summary || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
    const subject = `Minuto Feedback: ${currentCompactArticleTitle || currentVideoItem.title}`;
    const bodyLines = [
      'Minuto Feedback',
      '',
      'Was ist aufgefallen?',
      '[Bitte hier kurz beschreiben]',
      '',
      'Kategorie:',
      '- irrelevanter Artikel',
      '- schlechte Summary',
      '- Sprechertext',
      '- Ähnliche Artikel passen nicht',
      '- UI-Bug',
      '- Sonstiges',
      '',
      'Kontext:',
      `Titel: ${currentVideoItem.title}`,
      `Quelle: ${currentVideoItem.source}`,
      `Thema: ${currentVideoItem.topic}`,
      `Datum: ${formatNewsDate(currentVideoItem.publishedAt)}`,
      `Artikel-URL: ${currentVideoItem.articleUrl ?? 'Keine URL verfügbar'}`,
      `Minuto Summary: ${compactSummary || 'Keine Summary verfügbar'}`,
      '',
      'Ergänzung:',
      '[Optional: Was wäre stattdessen richtig?]',
    ];

    const mailtoBaseUrl = `mailto:${FEEDBACK_EMAIL}`;
    const mailtoUrl = `${mailtoBaseUrl}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoBaseUrl);

      if (!canOpen) {
        setPodcastStatus(
          'Feedback-Mail konnte gerade nicht geöffnet werden. Prüfe bitte deine Mail-App.'
        );
        return;
      }

      try {
        await Linking.openURL(mailtoUrl);
      } catch {
        await Linking.openURL(mailtoBaseUrl);
      }
    } catch {
      setPodcastStatus(
        'Feedback-Mail konnte gerade nicht geöffnet werden. Prüfe bitte deine Mail-App.'
      );
    }
  };

  const resetArticleSheetPosition = () => {
    Animated.spring(articleTranslateY, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const resetArticleContentPosition = () => {
    Animated.spring(articleContentTranslateX, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.85,
      useNativeDriver: true,
    }).start();
  };

  const switchArticleDetailByOffset = (offset: -1 | 1) => {
    if (newsItems.length === 0) {
      resetArticleContentPosition();
      return;
    }

    const nextIndex = Math.min(
      newsItems.length - 1,
      Math.max(0, currentVideoIndex + offset)
    );

    if (nextIndex === currentVideoIndex) {
      resetArticleContentPosition();
      return;
    }

    const exitDirection = offset > 0 ? -72 : 72;
    const entryDirection = offset > 0 ? 72 : -72;

    Animated.timing(articleContentTranslateX, {
      toValue: exitDirection,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setCurrentVideoIndex(nextIndex);
      articleContentTranslateX.setValue(entryDirection);
      Animated.spring(articleContentTranslateX, {
        toValue: 0,
        damping: 18,
        stiffness: 220,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
    });
  };

  const articleSheetPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 2 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      Math.abs(gestureState.dy) > 2 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        articleTranslateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 110) {
        closeArticleDetail();
        return;
      }

      resetArticleSheetPosition();
    },
    onPanResponderTerminate: () => {
      resetArticleSheetPosition();
    },
    onPanResponderTerminationRequest: () => false,
  });

  const handleStoryPreviewScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / (STORY_PREVIEW_CARD_WIDTH + STORY_PREVIEW_GAP));
    setPreviewStoryIndex(Math.max(0, Math.min(newsItems.length - 1, nextIndex)));
  };

  const topicSettingsSheet = isTopicSettingsOpen ? (
    <View style={styles.sheetOverlayRoot}>
      <AnimatedBlurView
        pointerEvents="none"
        intensity={72}
        tint="dark"
        style={[
          styles.sheetBackdrop,
          {
            opacity: topicSheetTranslateY.interpolate({
              inputRange: [0, SHEET_CLOSE_DISTANCE * 0.45, SHEET_CLOSE_DISTANCE],
              outputRange: [0.92, 0.7, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sheetDimmer,
          {
            opacity: topicSheetTranslateY.interpolate({
              inputRange: [0, SHEET_CLOSE_DISTANCE * 0.55, SHEET_CLOSE_DISTANCE],
              outputRange: [0.32, 0.18, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
      <Pressable style={styles.sheetBackdropPressable} onPress={closeTopicSettings} />
      <View style={styles.sheetKeyboard}>
        <Animated.View
          style={[
            styles.sheetPanel,
            { transform: [{ translateY: topicSheetTranslateY }] },
          ]}
        >
          <View style={styles.sheetGrabZone}>
            <View
              collapsable={false}
              style={[
                styles.sheetGestureZone,
                isAddingTopic && styles.sheetGestureZoneCompact,
              ]}
              {...sheetHandlePanResponder.panHandlers}
            />
            <View style={styles.sheetDragArea}>
              <View style={styles.sheetHandle} />
            </View>
            {!isAddingTopic ? (
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Interessen verwalten</Text>
                  <Text style={styles.sheetCopy}>
                    Themen wählen. Eigene Themen kannst du unten hinzufügen und per
                    langem Druck wieder entfernen.
                  </Text>
                </View>
                <Pressable
                  onPress={closeTopicSettings}
                  style={styles.sheetCloseButton}
                  hitSlop={10}
                  pressRetentionOffset={12}
                >
                  <Text style={styles.sheetClose}>Fertig</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {isAddingTopic ? (
            <View style={styles.addTopicExpandedWrap}>
              <View style={styles.addTopicExpanded}>
                <View style={styles.addTopicExpandedHeader}>
                  <View style={styles.addTopicHeaderCopy}>
                    <Text style={styles.addTopicTitle}>
                      Eigenes Thema hinzufügen
                    </Text>
                    <Text style={styles.addTopicHint}>
                      Gib ein Thema ein, das du regelmäßig im Briefing sehen
                      möchtest, zum Beispiel Irankrieg, Batterietechnik oder
                      Nahost.
                    </Text>
                  </View>
                  <Pressable
                    onPress={leaveAddTopicFlow}
                    style={styles.addTopicToggle}
                    hitSlop={10}
                    pressRetentionOffset={12}
                  >
                    <Text style={styles.addTopicToggleText}>Zurück</Text>
                  </Pressable>
                </View>

                <View style={styles.addTopicExpandedBody}>
                  <TextInput
                    ref={addTopicInputRef}
                    value={newTopicDraft}
                    onChangeText={setNewTopicDraft}
                    placeholder="z. B. Irankrieg"
                    placeholderTextColor="#94a3b8"
                    style={styles.addTopicInputExpanded}
                  />
                  <Text style={styles.addTopicHelper}>
                    Dein Thema erscheint danach in deinen Interessen und kann
                    später im Overlay per langem Druck wieder entfernt werden.
                  </Text>
                </View>

                <View style={styles.addTopicActions}>
                  <Pressable
                    onPress={addCustomTopic}
                    style={styles.addTopicPrimaryButton}
                    hitSlop={10}
                    pressRetentionOffset={12}
                  >
                    <Text style={styles.addTopicPrimaryButtonText}>
                      Thema speichern
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <>
                <View style={styles.sheetGrid}>
                  {topicLibrary.map((topic) => {
                    const isVisible = visibleTopics.includes(topic);
                    const isUserTopic = isCustomTopic(topic);

                    return (
                      <Pressable
                        key={topic}
                        onPress={() => toggleVisibleTopic(topic)}
                        onLongPress={() => removeCustomTopic(topic)}
                        delayLongPress={250}
                        style={[
                          styles.sheetTopicChip,
                          isUserTopic && styles.sheetTopicChipCustom,
                          isVisible && styles.sheetTopicChipActive,
                          isVisible &&
                            isUserTopic &&
                            styles.sheetTopicChipCustomActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sheetTopicChipText,
                            isUserTopic && styles.sheetTopicChipTextCustom,
                            isVisible && styles.sheetTopicChipTextActive,
                            isVisible &&
                              isUserTopic &&
                              styles.sheetTopicChipTextCustomActive,
                          ]}
                        >
                          {topic}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.addTopicCard}>
                  <View style={styles.addTopicHeader}>
                    <View style={styles.addTopicHeaderCopy}>
                      <Text style={styles.addTopicTitle}>Eigenes Thema</Text>
                      <Text style={styles.addTopicHint}>
                        Zum Beispiel Irankrieg, Batterietechnik oder Nahost.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => openAddTopicFlow('settings')}
                      style={styles.addTopicToggle}
                      hitSlop={10}
                      pressRetentionOffset={12}
                    >
                      <Text style={styles.addTopicToggleText}>Hinzufügen</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {isVideoOpen ? (
        <AnimatedBlurView
          pointerEvents="none"
          intensity={70}
          tint="dark"
          style={[
            styles.backgroundBlur,
            {
              opacity: videoTranslateY.interpolate({
                inputRange: [0, 260, 580],
                outputRange: [0.82, 0.76, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ) : null}
      <Modal
        visible={isVideoOpen}
        animationType="none"
        presentationStyle="fullScreen"
        transparent
        onRequestClose={closeVideoBriefing}
      >
        <SafeAreaView style={styles.videoModal}>
          {currentVideoItem ? (
            <Animated.View
              style={[
                styles.videoModalFrame,
                { transform: [{ translateY: videoTranslateY }] },
              ]}
              {...panResponder.panHandlers}
            >
              {currentVideoItem.imageUrl ? (
                <Image
                  source={{ uri: currentVideoItem.imageUrl }}
                  style={styles.videoModalImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.videoModalImageFallback}>
                  <Text style={styles.videoModalImageFallbackText}>
                    {currentVideoItem.topic}
                  </Text>
                </View>
              )}

              <View style={styles.videoOverlay} />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.videoDismissFade,
                  {
                    opacity: videoTranslateY.interpolate({
                      inputRange: [0, 160, 320],
                      outputRange: [0, 0.22, 0.04],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              />

              <View
                pointerEvents={isArticleOpen || isVideoDragging ? 'none' : 'auto'}
                style={styles.videoTapLayer}
              >
                <Pressable
                  onPress={goToPreviousVideoSlide}
                  style={styles.videoTapZone}
                />
                <Pressable
                  onPress={toggleVideoPlayback}
                  style={styles.videoTapZone}
                />
                <Pressable
                  onPress={goToNextVideoSlide}
                  style={styles.videoTapZone}
                />
              </View>

              <View style={styles.videoProgressRow}>
                {newsItems.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.videoProgressTrack,
                      index === currentVideoIndex &&
                        styles.videoProgressTrackActive,
                    ]}
                  >
                    {index < currentVideoIndex ? (
                      <View style={styles.videoProgressFillCompleted} />
                    ) : null}
                    {index === currentVideoIndex ? (
                      <Animated.View
                        style={[
                          styles.videoProgressFillActive,
                          { width: currentStoryProgressWidth },
                        ]}
                      />
                    ) : null}
                  </View>
                ))}
              </View>

              <View style={styles.videoModalHeader}>
                <Text style={styles.videoModalBadge}>News Story</Text>
                <Pressable
                  onPress={toggleStorySound}
                  style={styles.videoSoundButton}
                  hitSlop={10}
                  pressRetentionOffset={12}
                >
                  <Text style={styles.videoSoundButtonText}>
                    {isStoryMuted ? 'Podcast hören' : 'Podcast aus'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.videoGesturePill}>
                <Text style={styles.videoGesturePillText}>
                  Links/Rechts wechselt · Mitte pausiert · Runterziehen schließt
                </Text>
              </View>

              <View style={styles.videoModalContent}>
                <View style={styles.videoHeadlineBlock}>
                  <Text style={styles.videoModalKicker}>{currentVideoItem.topic}</Text>
                  <Text
                    style={styles.videoModalTitle}
                    android_hyphenationFrequency="normal"
                    lineBreakStrategyIOS="standard"
                  >
                    {addSoftHyphensToHeadline(currentVideoItem.title)}
                  </Text>
                </View>
                <Text style={styles.videoModalMeta}>
                  {currentVideoItem.source} • {formatNewsDate(currentVideoItem.publishedAt)}
                </Text>
                {currentShouldShowPerspectives &&
                currentStoryCoverage &&
                currentStoryCoverage.totalSourceCount > 1 &&
                currentPerspectiveTotal > 0 ? (
                  <View style={styles.storyCoverageCard}>
                    <View style={styles.storyCoverageHeader}>
                      <Text style={styles.storyCoverageLabel}>Coverage</Text>
                      <Text style={styles.storyCoverageMeta}>
                        {currentStoryCoverage?.totalSourceCount ?? currentPerspectiveTotal}{' '}
                        Quellen
                      </Text>
                    </View>
                    <View style={styles.storyCoverageBar}>
                      {currentPerspectiveBuckets.map((bucket) => (
                        <View
                          key={`story-${bucket.perspective}`}
                          style={[
                            styles.storyCoverageSegment,
                            bucket.perspective === 'left' &&
                              styles.storyCoverageSegmentLeft,
                            bucket.perspective === 'center' &&
                              styles.storyCoverageSegmentCenter,
                            bucket.perspective === 'right' &&
                              styles.storyCoverageSegmentRight,
                            {
                              flex: Math.max(bucket.count, currentPerspectiveTotal > 0 ? 0.8 : 1),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.storyCoverageSegmentText,
                              bucket.perspective === 'center' &&
                                styles.storyCoverageSegmentTextCenter,
                            ]}
                          >
                            {bucket.label} {bucket.percentage}%
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.storyCoverageCaption}>
                      {buildCoverageStoryHint(currentStoryCoverage)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                onPress={openArticleDetail}
                disabled={isVideoDragging}
                style={styles.videoControls}
                hitSlop={8}
                pressRetentionOffset={12}
              >
                <Text style={styles.videoDetailLabel}>Mehr zum Artikel</Text>
                <Text style={styles.videoDetailHint}>
                  Tippen für Details und Einordnung
                </Text>
              </Pressable>

              {isArticleOpen ? (
                <>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.articleBackdrop,
                      { opacity: articleBackdropOpacity },
                    ]}
                  />
                  <Pressable
                    style={styles.articleBackdropPressable}
                    onPress={closeArticleDetail}
                  />
                  <Animated.View
                    style={[
                      styles.articleSheet,
                      { transform: [{ translateY: articleTranslateY }] },
                    ]}
                  >
                    <View style={styles.articleSheetGrabZone}>
                      <View
                        collapsable={false}
                        style={styles.articleSheetGestureZone}
                        {...articleSheetPanResponder.panHandlers}
                      />
                      <View style={styles.articleSheetDragArea}>
                        <View style={styles.articleSheetHandle} />
                      </View>
                      <View style={styles.articleSheetHeader}>
                        <View style={styles.articleSheetTopRow}>
                          <View style={styles.articleSheetMetaRow}>
                            <Text style={styles.articleSheetBadge}>
                              Artikelansicht
                            </Text>
                            <Text style={styles.articleSheetMeta}>
                              {currentVideoItem?.source} •{' '}
                              {formatNewsDate(currentVideoItem?.publishedAt)}
                            </Text>
                          </View>
                          <View style={styles.articleSheetHeaderActions}>
                            <Pressable
                              onPress={sendArticleFeedback}
                              style={styles.articleSheetFeedbackButton}
                              hitSlop={10}
                              pressRetentionOffset={12}
                            >
                              <Text style={styles.articleSheetFeedbackText}>
                                Feedback
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={closeArticleDetail}
                              style={styles.articleSheetCloseButton}
                              hitSlop={10}
                              pressRetentionOffset={12}
                            >
                              <Text style={styles.articleSheetCloseText}>
                                Zur Story
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.articleSheetHeaderCopy}>
                          <Text
                            style={styles.articleSheetTitle}
                            numberOfLines={4}
                            android_hyphenationFrequency="normal"
                            lineBreakStrategyIOS="standard"
                          >
                            {addSoftHyphensToHeadline(currentCompactArticleTitle)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Animated.View
                      style={[
                        styles.articleContentSwipeArea,
                        { transform: [{ translateX: articleContentTranslateX }] },
                      ]}
                    >
                      <ScrollView
                        style={styles.articleScroll}
                        contentContainerStyle={styles.articleScrollContent}
                        showsVerticalScrollIndicator={false}
                      >
                        {currentVideoItem ? (
                          <View style={styles.coverageSummarySection}>
                            <Text style={styles.coverageSectionHeading}>
                              Minuto Summary
                            </Text>
                            <View style={styles.coverageSummaryCard}>
                              <View style={styles.coverageSummaryTopRow}>
                                {currentVideoItem.imageUrl ? (
                                  <Image
                                    source={{ uri: currentVideoItem.imageUrl }}
                                    style={styles.coverageSummaryThumb}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <View style={styles.coverageSummaryThumbFallback}>
                                    <Text style={styles.coverageSummaryThumbText}>
                                      {currentVideoItem.topic}
                                    </Text>
                                  </View>
                                )}
                                <View style={styles.coverageSummaryCopy}>
                                  <Text style={styles.coverageSummaryTitle}>
                                    {addSoftHyphensToHeadline(currentVideoItem.title)}
                                  </Text>
                                  <Text style={styles.coverageSummaryBody}>
                                    {currentSummaryBody || currentVideoItem.summary}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.coverageSummaryMetaRow}>
                                <Text style={styles.coverageSummaryMeta}>
                                  {inferCoverageScope(currentVideoItem)} •{' '}
                                  {formatRelativeAge(currentVideoItem.publishedAt)}
                                </Text>
                                <Text style={styles.coverageSummaryMeta}>
                                  {currentStoryCoverage?.totalSourceCount ?? 1} Quellen
                                </Text>
                              </View>
                            </View>
                          </View>
                        ) : null}
                      </ScrollView>
                    </Animated.View>
                    {currentVideoIndex > 0 ? (
                      <Pressable
                        onPress={() => switchArticleDetailByOffset(-1)}
                        style={[styles.articleNavButton, styles.articleNavButtonLeft]}
                        hitSlop={10}
                        pressRetentionOffset={12}
                      >
                        <Text style={styles.articleNavButtonText}>‹</Text>
                      </Pressable>
                    ) : null}
                    {currentVideoIndex < newsItems.length - 1 ? (
                      <Pressable
                        onPress={() => switchArticleDetailByOffset(1)}
                        style={[styles.articleNavButton, styles.articleNavButtonRight]}
                        hitSlop={10}
                        pressRetentionOffset={12}
                      >
                        <Text style={styles.articleNavButtonText}>›</Text>
                      </Pressable>
                    ) : null}
                  </Animated.View>
                </>
              ) : null}
            </Animated.View>
          ) : null}
        </SafeAreaView>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Minuto</Text>
          <Text style={styles.title}>Deine persönliche News Story.</Text>
          <Text style={styles.subtitle}>
            Wähle deine Themen und die Länge. Minuto sammelt aktuelle
            Meldungen, verdichtet sie zu einem Briefing und zeigt sie dir als
            persönliche News Story.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionLead}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 1</Text>
              </View>
              <Text style={styles.sectionTitle}>Deine Interessen</Text>
            </View>
            <Pressable
              onPress={openTopicSettings}
              style={styles.sectionSettingsButton}
              hitSlop={10}
              pressRetentionOffset={12}
            >
              <Text style={styles.sectionSettingsButtonText}>Verwalten</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionCopy}>
            Tippe zum Auswählen. Lange drücken entfernt ein Thema von der Startseite.
          </Text>

          <View style={styles.topicGrid}>
            {visibleTopics.map((topic) => {
              const isSelected = selectedTopics.includes(topic);

              return (
                <Pressable
                  key={topic}
                  onPress={() => toggleTopic(topic)}
                  onLongPress={() => removeVisibleTopic(topic)}
                  style={[
                    styles.topicChip,
                    isSelected && styles.topicChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.topicChipText,
                      isSelected && styles.topicChipTextSelected,
                    ]}
                  >
                    {topic}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={openTopicSettings}
              style={styles.topicAddChip}
              hitSlop={10}
              pressRetentionOffset={12}
            >
              <Text style={styles.topicAddChipText}>+ Thema</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionLead}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>Step 2</Text>
            </View>
            <Text style={styles.sectionTitle}>Länge deiner Story</Text>
          </View>
          <Text style={styles.sectionCopy}>
            Du entscheidest, ob Minuto dir nur ein kurzes Update oder ein
            ausführlicheres Briefing zusammenstellt.
          </Text>

          <Text style={styles.durationValue}>
            {formatDuration(durationInSeconds)}
          </Text>
          <Text style={styles.durationMeta}>
            Mindestlänge aktuell: {formatDuration(minimumDuration)}
          </Text>

          <View style={styles.sliderWrap}>
            {durationLockRatio > 0 ? (
              <View
                style={[
                  styles.sliderDisabledRange,
                  { width: `${durationLockRatio * 100}%` },
                ]}
              />
            ) : null}
            <Slider
              minimumValue={30}
              maximumValue={300}
              lowerLimit={minimumDuration}
              step={30}
              value={durationInSeconds}
              minimumTrackTintColor="#ff7a45"
              maximumTrackTintColor="#26415d"
              thumbTintColor="#f4f7fb"
              onValueChange={setDurationInSeconds}
            />
          </View>

          <View style={styles.durationLabels}>
            <Text style={styles.durationLabel}>30 Sek.</Text>
            <Text style={styles.durationLabel}>5 Min.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionLead}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>Step 3</Text>
            </View>
            <Text style={styles.sectionTitle}>Für dich zusammengestellt</Text>
          </View>
          <Text style={styles.episodeTitle}>Deine Story für heute</Text>
          <Text style={styles.sectionCopy}>
            Aktuelle Meldungen der letzten 24 Stunden zu:
          </Text>
          <Text style={styles.topicSummary}>
            {selectedTopics.length > 0
              ? selectedTopics.join(' • ')
              : 'Noch kein Thema ausgewählt'}
          </Text>
          <Text style={styles.lengthHint}>
            Geplante Länge: ungefähr {formatDuration(durationInSeconds)}
          </Text>

          <View style={styles.playerRow}>
            {newsItems.length === 0 ? (
              <Pressable
                onPress={startPodcast}
                style={[
                  styles.playButton,
                  (selectedTopics.length < 1 || isGenerating) &&
                    styles.playButtonDisabled,
                ]}
              >
                <Text style={styles.playButtonText}>
                  {isGenerating ? 'Wird erstellt ...' : 'Story erstellen'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.playerMeta}>
              <Text style={styles.playerMetaLabel}>Format</Text>
              <Text style={styles.playerMetaValue}>
                {getVisualModeLabel(durationInSeconds)}
              </Text>
            </View>
          </View>
          {newsItems.length > 0 ? (
            <View style={styles.storyEmbedded}>
              <View style={styles.storyEmbeddedHeader}>
                <Text style={styles.storyEmbeddedTitle}>Persönliche News Story</Text>
                <Text style={styles.storyEmbeddedCopy}>
                  Tippe eine Headline an oder scrolle durch die Slides.
                </Text>
              </View>

              <View style={styles.videoPreview}>
                <View style={styles.videoFrame}>
                  <View style={styles.videoTopBar}>
                    <Text style={styles.videoBadge}>Minuto</Text>
                    <Text style={styles.videoMeta}>
                      {formatDuration(durationInSeconds)}
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={STORY_PREVIEW_CARD_WIDTH + STORY_PREVIEW_GAP}
                    decelerationRate="fast"
                    onScroll={handleStoryPreviewScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.storyPreviewScroller}
                  >
                    {newsItems.map((item, index) => (
                      <Pressable
                        key={item.id}
                        style={styles.storyPreviewCard}
                        onPress={() => openVideoBriefingAt(index)}
                      >
                        <Text style={styles.storyPreviewTopic}>{item.topic}</Text>
                        <Text style={styles.storyPreviewMeta}>
                          {item.source} • {formatNewsDate(item.publishedAt)}
                        </Text>
                        <Text style={styles.storyPreviewText}>
                          {addSoftHyphensToHeadline(item.title)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.storyPreviewFooter}>
                    <Text style={styles.storyPreviewHint}>
                      Horizontal durch die Headlines scrollen
                    </Text>
                    <View style={styles.storyPreviewDots}>
                      {newsItems.map((item, index) => (
                        <View
                          key={item.id}
                          style={[
                            styles.storyPreviewDotIndicator,
                            index === previewStoryIndex &&
                              styles.storyPreviewDotIndicatorActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : null}
          {newsItems.length > 0 ? (
            <Pressable
              onPress={clearCurrentBriefing}
              style={styles.resetButton}
              hitSlop={10}
              pressRetentionOffset={12}
            >
              <Text style={styles.resetButtonText}>Aktuelles Briefing löschen</Text>
            </Pressable>
          ) : null}
          <Text style={styles.statusText}>{podcastStatus}</Text>
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Nächster Schritt</Text>
          <Text style={styles.footerCopy}>
            Als Nächstes schärfen wir Relevanz, Stichpunkte und
            Artikeldetails.
          </Text>
        </View>
      </ScrollView>
      {topicSettingsSheet}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06101a',
  },
  backgroundBlur: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  videoModal: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  videoModalFrame: {
    flex: 1,
    backgroundColor: '#020817',
  },
  videoTapLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 2,
  },
  videoTapZone: {
    flex: 1,
  },
  videoModalImage: {
    ...StyleSheet.absoluteFillObject,
  },
  videoModalImageFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  videoModalImageFallbackText: {
    color: '#eff6ff',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    textAlign: 'center',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  videoDismissFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.34)',
  },
  videoProgressRow: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 6,
    zIndex: 4,
  },
  videoProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(226, 232, 240, 0.24)',
    overflow: 'hidden',
  },
  videoProgressTrackActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.42)',
  },
  videoProgressFillCompleted: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
  },
  videoProgressFillActive: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  videoModalHeader: {
    paddingHorizontal: 20,
    paddingTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 3,
  },
  videoModalBadge: {
    color: '#f8fafc',
    backgroundColor: '#f97316',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  videoSoundButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
  },
  videoSoundButtonText: {
    color: '#e0f2fe',
    fontSize: 13,
    fontWeight: '700',
  },
  videoGesturePill: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(2, 6, 23, 0.28)',
    zIndex: 3,
  },
  videoGesturePillText: {
    color: '#cbd5e1',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  videoModalContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 174,
    gap: 10,
  },
  videoModalKicker: {
    color: '#7dd3fc',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  videoModalTitle: {
    color: '#f8fafc',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
  },
  videoModalSummary: {
    color: '#e2e8f0',
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
  },
  videoModalMeta: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  storyCoverageCard: {
    marginTop: 10,
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 16, 26, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.18)',
  },
  storyCoverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  storyCoverageLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  storyCoverageMeta: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  storyCoverageBar: {
    flexDirection: 'row',
    minHeight: 28,
    borderRadius: 999,
    overflow: 'hidden',
  },
  storyCoverageSegment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  storyCoverageSegmentLeft: {
    backgroundColor: '#8a2e2d',
  },
  storyCoverageSegmentCenter: {
    backgroundColor: '#f3f4f6',
  },
  storyCoverageSegmentRight: {
    backgroundColor: '#2b579d',
  },
  storyCoverageSegmentText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
  },
  storyCoverageSegmentTextCenter: {
    color: '#111827',
  },
  storyCoverageCaption: {
    color: '#dbeafe',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  videoBulletList: {
    gap: 7,
    maxHeight: 252,
  },
  videoBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  videoBulletDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f97316',
    marginTop: 8,
    flexShrink: 0,
  },
  videoBulletText: {
    color: '#f8fafc',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    flex: 1,
  },
  videoControls: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 22,
    zIndex: 4,
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(2, 6, 23, 0.46)',
  },
  videoDetailLabel: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  videoDetailHint: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  articleBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
    zIndex: 4,
  },
  articleBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  articleSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '92%',
    backgroundColor: '#07111f',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#22344a',
    overflow: 'hidden',
    zIndex: 5,
  },
  articleSheetGrabZone: {
    position: 'relative',
    zIndex: 3,
  },
  articleSheetGestureZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 84,
    height: 176,
    zIndex: 5,
  },
  articleSheetDragArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingTop: 8,
    paddingBottom: 8,
  },
  articleSheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.7)',
  },
  articleSheetHeader: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 8,
  },
  articleSheetTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  articleSheetHeaderCopy: {
    gap: 4,
  },
  articleSheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  articleSheetMetaRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  articleSheetBadge: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  articleSheetTitle: {
    color: '#f8fafc',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  articleSheetMeta: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  articleSheetFeedbackButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  articleSheetFeedbackText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  articleSheetCloseButton: {
    backgroundColor: '#13243a',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#28405f',
  },
  articleSheetCloseText: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '700',
  },
  articleScroll: {
    flex: 1,
  },
  articleContentSwipeArea: {
    flex: 1,
  },
  articleScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 34,
    gap: 16,
  },
  articleNavButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    width: 22,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7, 17, 31, 0.12)',
    borderWidth: 0,
    zIndex: 6,
  },
  articleNavButtonLeft: {
    left: 4,
  },
  articleNavButtonRight: {
    right: 4,
  },
  articleNavButtonText: {
    color: 'rgba(224, 242, 254, 0.82)',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '500',
  },
  articleSection: {
    gap: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#0f1b2d',
    borderWidth: 1,
    borderColor: '#1f3148',
  },
  articleSectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  articleSectionBody: {
    color: '#dbeafe',
    fontSize: 15,
    lineHeight: 23,
  },
  coverageSummarySection: {
    gap: 10,
  },
  coverageSectionHeading: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  coverageSummaryCard: {
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#0f1b2d',
    borderWidth: 1,
    borderColor: '#1f3148',
  },
  coverageSummaryTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  coverageSummaryThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#14243a',
  },
  coverageSummaryThumbFallback: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#13243a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  coverageSummaryThumbText: {
    color: '#dbeafe',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  coverageSummaryCopy: {
    flex: 1,
    gap: 8,
  },
  coverageSummaryTitle: {
    color: '#f8fafc',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  coverageSummaryBody: {
    color: '#dbeafe',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  coverageBiasBar: {
    flexDirection: 'row',
    borderRadius: 999,
    overflow: 'hidden',
    minHeight: 18,
  },
  coverageBiasSegment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  coverageBiasSegmentLeft: {
    backgroundColor: '#8a2e2d',
  },
  coverageBiasSegmentCenter: {
    backgroundColor: '#f3f4f6',
  },
  coverageBiasSegmentRight: {
    backgroundColor: '#2b579d',
  },
  coverageBiasText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
  },
  coverageBiasTextCenter: {
    color: '#111827',
  },
  coverageSummaryMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  coverageSummaryMeta: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  perspectiveBarWrap: {
    marginTop: 4,
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 48,
  },
  perspectiveBarSegment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  perspectiveBarSegmentLeft: {
    backgroundColor: '#8a2e2d',
  },
  perspectiveBarSegmentCenter: {
    backgroundColor: '#f3f4f6',
  },
  perspectiveBarSegmentRight: {
    backgroundColor: '#2b579d',
  },
  perspectiveBarText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  perspectiveBarTextCenter: {
    color: '#111827',
  },
  perspectiveSummaryList: {
    gap: 10,
    marginTop: 12,
  },
  perspectiveBlindspot: {
    marginTop: 12,
    gap: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0b1626',
    borderWidth: 1,
    borderColor: '#203348',
  },
  perspectiveBlindspotLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  perspectiveBlindspotText: {
    color: '#dbeafe',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  perspectiveSummaryCard: {
    gap: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0b1626',
    borderWidth: 1,
    borderColor: '#1d3147',
  },
  perspectiveSummaryLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  perspectiveSummaryText: {
    color: '#dbeafe',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  perspectiveSourceRow: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  fullCoverageSection: {
    gap: 8,
  },
  fullCoverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  fullCoverageSort: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  fullCoverageCount: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  coverageCardsScroller: {
    gap: 12,
    paddingRight: 6,
  },
  coverageCard: {
    width: 274,
    minHeight: 292,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#0f1b2d',
    borderWidth: 1,
    borderColor: '#374151',
    gap: 12,
  },
  coverageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  coverageSourceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  coverageSourceIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageSourceIconText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
  },
  coverageSourceName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  coverageCardMenu: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '700',
  },
  coverageTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  coverageTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  coverageTagLeft: {
    backgroundColor: '#8a2e2d',
  },
  coverageTagCenter: {
    backgroundColor: '#f3f4f6',
  },
  coverageTagRight: {
    backgroundColor: '#2b579d',
  },
  coverageTagText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  coverageTagTextCenter: {
    color: '#111827',
  },
  coverageTagNeutral: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  coverageTagNeutralText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
  },
  coverageCardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  coverageCardSummary: {
    color: '#dbeafe',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    flex: 1,
  },
  coverageCardLink: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  coverageCardFooter: {
    marginTop: 'auto',
  },
  coverageCardFooterText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 20,
  },
  hero: {
    paddingTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 12,
    borderRadius: 30,
    backgroundColor: '#0b1624',
    borderWidth: 1,
    borderColor: '#1f3247',
  },
  sheetOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
  },
  sheetBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 4,
  },
  sheetPanel: {
    height: '84%',
    backgroundColor: '#07111f',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1f3148',
    overflow: 'hidden',
    zIndex: 5,
  },
  sheetGrabZone: {
    position: 'relative',
    zIndex: 3,
  },
  sheetGestureZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 92,
    height: 138,
    zIndex: 5,
  },
  sheetGestureZoneCompact: {
    right: 0,
    height: 52,
  },
  sheetDragArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingTop: 8,
    paddingBottom: 8,
    zIndex: 3,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.7)',
  },
  sheetHeader: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 10,
    position: 'relative',
  },
  sheetHeaderCopy: {
    paddingRight: 96,
    gap: 4,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  sheetCopy: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  sheetCloseButton: {
    position: 'absolute',
    top: 2,
    right: 18,
    backgroundColor: '#13243a',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#28405f',
  },
  sheetClose: {
    color: '#7dd3fc',
    fontSize: 14,
    fontWeight: '700',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 18,
  },
  sheetScrollContentExpanded: {
    flexGrow: 1,
  },
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sheetTopicChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#13243a',
    borderWidth: 1,
    borderColor: '#28405f',
  },
  sheetTopicChipActive: {
    backgroundColor: '#f97316',
    borderColor: '#fb923c',
  },
  sheetTopicChipCustom: {
    backgroundColor: '#10273d',
    borderColor: '#38bdf8',
  },
  sheetTopicChipCustomActive: {
    backgroundColor: '#0369a1',
    borderColor: '#7dd3fc',
  },
  sheetTopicChipText: {
    color: '#dbeafe',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetTopicChipTextActive: {
    color: '#fff7ed',
  },
  sheetTopicChipTextCustom: {
    color: '#bae6fd',
  },
  sheetTopicChipTextCustomActive: {
    color: '#f0f9ff',
  },
  addTopicCard: {
    paddingTop: 4,
    gap: 12,
  },
  addTopicExpanded: {
    flex: 1,
    minHeight: 320,
    justifyContent: 'flex-start',
    gap: 10,
    paddingTop: 6,
  },
  addTopicExpandedWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  addTopicExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  addTopicExpandedBody: {
    gap: 8,
  },
  addTopicHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  addTopicHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  addTopicTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  addTopicHint: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 19,
  },
  addTopicToggle: {
    alignSelf: 'flex-start',
    backgroundColor: '#13243a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#28405f',
  },
  addTopicToggleText: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '700',
  },
  addTopicComposer: {
    gap: 12,
  },
  addTopicInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#28405f',
    backgroundColor: '#0f1b2d',
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addTopicInputExpanded: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#28405f',
    backgroundColor: '#0f1b2d',
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 18,
  },
  addTopicHelper: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  addTopicActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  addTopicPrimaryButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f97316',
  },
  addTopicPrimaryButtonText: {
    color: '#fff7ed',
    fontSize: 14,
    fontWeight: '800',
  },
  eyebrow: {
    color: '#8de1e7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f4f7fb',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
  },
  subtitle: {
    color: '#b3c2d4',
    fontSize: 16,
    lineHeight: 25,
  },
  card: {
    backgroundColor: '#0b1624',
    borderRadius: 28,
    padding: 20,
    gap: 15,
    borderWidth: 1,
    borderColor: '#1c3148',
  },
  sectionTitle: {
    color: '#f4f7fb',
    fontSize: 21,
    fontWeight: '800',
  },
  sectionLead: {
    gap: 8,
    flexShrink: 1,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(141, 225, 231, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(141, 225, 231, 0.24)',
  },
  stepBadgeText: {
    color: '#8de1e7',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionSettingsButton: {
    backgroundColor: '#122133',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#29425c',
  },
  sectionSettingsButtonText: {
    color: '#d6e0ea',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCopy: {
    color: '#94a8bf',
    fontSize: 15,
    lineHeight: 22,
  },
  topicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  topicChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#102031',
    borderWidth: 1,
    borderColor: '#2a4158',
  },
  topicChipSelected: {
    backgroundColor: '#ff7a45',
    borderColor: '#ff956d',
  },
  topicChipText: {
    color: '#dce7f1',
    fontSize: 15,
    fontWeight: '700',
  },
  topicChipTextSelected: {
    color: '#fff8f2',
  },
  topicAddChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#8de1e7',
  },
  topicAddChipText: {
    color: '#08212c',
    fontSize: 15,
    fontWeight: '800',
  },
  episodeTitle: {
    color: '#f4f7fb',
    fontSize: 30,
    fontWeight: '800',
  },
  topicSummary: {
    color: '#8de1e7',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  lengthHint: {
    color: '#94a8bf',
    fontSize: 14,
    lineHeight: 20,
  },
  durationValue: {
    color: '#f4f7fb',
    fontSize: 30,
    fontWeight: '800',
  },
  durationMeta: {
    color: '#93a7bd',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sliderWrap: {
    justifyContent: 'center',
  },
  sliderDisabledRange: {
    position: 'absolute',
    left: 8,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(61, 89, 120, 0.65)',
    zIndex: 1,
  },
  durationLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationLabel: {
    color: '#8093a9',
    fontSize: 13,
    fontWeight: '700',
  },
  playerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  playButton: {
    backgroundColor: '#ff7a45',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 15,
  },
  playButtonDisabled: {
    opacity: 0.65,
  },
  resetButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#122133',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#29425c',
  },
  resetButtonText: {
    color: '#d6e0ea',
    fontSize: 14,
    fontWeight: '800',
  },
  videoActionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff7a45',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  videoActionButtonText: {
    color: '#fff8f2',
    fontSize: 14,
    fontWeight: '800',
  },
  playButtonText: {
    color: '#fff8f2',
    fontSize: 15,
    fontWeight: '800',
  },
  playerMeta: {
    gap: 4,
  },
  playerMetaLabel: {
    color: '#7f91a7',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  playerMetaValue: {
    color: '#f4f7fb',
    fontSize: 15,
    fontWeight: '800',
  },
  statusText: {
    color: '#b8c5d3',
    fontSize: 14,
    lineHeight: 21,
  },
  storyEmbedded: {
    gap: 14,
  },
  storyEmbeddedHeader: {
    gap: 6,
  },
  storyEmbeddedTitle: {
    color: '#f4f7fb',
    fontSize: 21,
    fontWeight: '800',
  },
  storyEmbeddedCopy: {
    color: '#94a8bf',
    fontSize: 14,
    lineHeight: 20,
  },
  videoPreview: {
    alignItems: 'center',
  },
  videoFrame: {
    width: '100%',
    minHeight: 360,
    borderRadius: 30,
    padding: 20,
    backgroundColor: '#09131f',
    borderWidth: 1,
    borderColor: '#23364b',
    gap: 18,
    overflow: 'hidden',
  },
  videoTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoBadge: {
    color: '#fff8f2',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: '#ff7a45',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  videoMeta: {
    color: '#b8c5d3',
    fontSize: 13,
    fontWeight: '700',
  },
  videoHeadlineBlock: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    gap: 6,
  },
  videoKicker: {
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  videoHeadline: {
    color: '#f8fafc',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  videoSubline: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 21,
  },
  videoCards: {
    marginTop: 4,
  },
  storyPreviewScroller: {
    gap: 12,
    paddingRight: 8,
    paddingTop: 6,
  },
  storyPreviewFooter: {
    marginTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  storyPreviewHint: {
    color: '#94a8bf',
    fontSize: 13,
    lineHeight: 18,
  },
  storyPreviewDots: {
    flexDirection: 'row',
    gap: 8,
  },
  storyPreviewDotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(226, 232, 240, 0.35)',
  },
  storyPreviewDotIndicatorActive: {
    backgroundColor: '#8de1e7',
  },
  storyPreviewCard: {
    width: STORY_PREVIEW_CARD_WIDTH,
    minHeight: 212,
    gap: 10,
    backgroundColor: '#0f1c2c',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#22384f',
  },
  storyPreviewTopic: {
    color: '#ff8e64',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  storyPreviewMeta: {
    color: '#8ea3ba',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  storyPreviewText: {
    color: '#f4f7fb',
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '800',
  },
  footerCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#dbeafe',
    gap: 8,
  },
  footerTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  footerCopy: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 22,
  },
});
