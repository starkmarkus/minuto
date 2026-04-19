import { type NewsItem } from '../data/mockNews';
import {
  getSourceProfile,
  type FactualityRating,
  type OwnershipType,
  type RatedPerspective,
  type SourceProfile,
} from './sourcePerspective';

const STORY_STOPWORDS = new Set([
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
  'ohne',
  'von',
  'vor',
  'nach',
  'zu',
  'zum',
  'zur',
  'im',
  'in',
  'am',
  'an',
  'auf',
  'aus',
  'bei',
  'durch',
  'fuer',
  'für',
  'ueber',
  'über',
  'unter',
  'zwischen',
  'mehr',
  'neue',
  'neuen',
  'neuer',
  'neues',
  'erneut',
  'aktuell',
  'wieder',
  'weiter',
  'deutschland',
  'germany',
  'deutsche',
  'deutscher',
  'deutschen',
  'eu',
  'europe',
  'europa',
  'brussels',
  'bruessel',
  'berlin',
  'iran',
  'war',
  'krieg',
  'article',
  'news',
  'story',
  'full',
  'coverage',
  'politik',
  'wirtschaft',
  'klima',
  'wissenschaft',
  'energie',
  'finanzen',
  'geopolitik',
  'china',
  'chinese',
  'russland',
  'russian',
  'ukraine',
  'ukrainian',
  'israel',
  'israeli',
  'gaza',
  'hamburg',
]);

const IMPORTANT_SHORT_TERMS = new Set([
  'eu',
  'ki',
  'ai',
  'us',
  'usa',
  'ets',
  'dax',
  'nato',
  'iran',
  'israel',
  'gaza',
]);

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeStoryText = (text: string) =>
  normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .filter((token) => {
      if (IMPORTANT_SHORT_TERMS.has(token)) {
        return true;
      }

      return token.length >= 4 && !STORY_STOPWORDS.has(token);
    });

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const buildBigrams = (tokens: string[]) => {
  const bigrams: string[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return bigrams;
};

type StoryFingerprint = {
  titleTokens: string[];
  detailTokens: string[];
  allTokens: string[];
  coreTokens: string[];
  titleBigrams: string[];
  allBigrams: string[];
};

const buildFingerprint = (item: NewsItem, topicTokens: string[] = []): StoryFingerprint => {
  const titleTokens = unique(tokenizeStoryText(item.title));
  const detailTokens = unique(tokenizeStoryText(item.summary));
  const allTokens = unique([...titleTokens, ...detailTokens]);
  const genericTokens = new Set([...topicTokens, ...tokenizeStoryText(item.topic)]);
  const coreTokens = allTokens.filter((token) => !genericTokens.has(token));

  return {
    titleTokens,
    detailTokens,
    allTokens,
    coreTokens,
    titleBigrams: unique(buildBigrams(titleTokens)),
    allBigrams: unique(buildBigrams(allTokens)),
  };
};

const countOverlap = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
};

const getHoursApart = (left?: string, right?: string) => {
  if (!left || !right) {
    return 24;
  }

  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / (1000 * 60 * 60);
};

const scoreStoryMatch = (
  anchor: NewsItem,
  candidate: NewsItem,
  anchorFingerprint: StoryFingerprint,
  candidateFingerprint: StoryFingerprint
) => {
  if (anchor.id === candidate.id) {
    return 999;
  }

  const sharedTitleTerms = countOverlap(
    anchorFingerprint.titleTokens,
    candidateFingerprint.titleTokens
  );
  const sharedAllTerms = countOverlap(anchorFingerprint.allTokens, candidateFingerprint.allTokens);
  const sharedTitleBigrams = countOverlap(
    anchorFingerprint.titleBigrams,
    candidateFingerprint.titleBigrams
  );
  const sharedAllBigrams = countOverlap(
    anchorFingerprint.allBigrams,
    candidateFingerprint.allBigrams
  );
  const hoursApart = getHoursApart(anchor.publishedAt, candidate.publishedAt);
  const recencyBonus = hoursApart <= 6 ? 2 : hoursApart <= 18 ? 1 : 0;

  const score =
    sharedTitleTerms * 5 +
    sharedAllTerms * 2 +
    sharedTitleBigrams * 9 +
    sharedAllBigrams * 5 +
    recencyBonus;

  return score;
};

const buildTitleKey = (title: string) =>
  normalizeText(title)
    .split(' ')
    .slice(0, 10)
    .join(' ');

export type StoryCoverageItem = NewsItem & {
  sourceProfile: SourceProfile;
  matchScore: number;
};

export type StoryCoverageBucket = {
  perspective: RatedPerspective;
  label: string;
  count: number;
  percentage: number;
  items: StoryCoverageItem[];
  sourceIds: string[];
};

export type StoryBlindspot = {
  score: number;
  label: string;
  explanation: string;
};

export type StoryCoverageResult = {
  storyId: string;
  items: StoryCoverageItem[];
  buckets: StoryCoverageBucket[];
  blindspot: StoryBlindspot | null;
  ratedSourceCount: number;
  unknownSourceCount: number;
  totalSourceCount: number;
};

type RankedCandidate = StoryCoverageItem & {
  sharedTitleTerms: number;
  sharedAllTerms: number;
  sharedBigrams: number;
  sharedCoreTerms: number;
};

const getPerspectiveAdjective = (perspective: RatedPerspective) => {
  if (perspective === 'left') {
    return 'linke';
  }

  if (perspective === 'right') {
    return 'rechte';
  }

  return 'zentristische';
};

const buildBlindspot = (buckets: StoryCoverageBucket[], unknownSourceCount: number) => {
  const ratedSourceCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (ratedSourceCount < 2) {
    return null;
  }

  const sorted = [...buckets].sort((left, right) => right.count - left.count);
  const dominant = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const dominantShare = dominant.count / ratedSourceCount;
  const missingBuckets = buckets.filter((bucket) => bucket.count === 0).length;
  const rawScore = Math.round(
    dominantShare * 65 + missingBuckets * 14 + Math.min(unknownSourceCount * 4, 12)
  );

  if (rawScore < 42) {
    return null;
  }

  const label =
    rawScore >= 72 ? 'Starker Blindspot' : rawScore >= 58 ? 'Möglicher Blindspot' : 'Leichte Schieflage';

  const missingLabels = buckets
    .filter((bucket) => bucket.count === 0)
    .map((bucket) => getPerspectiveAdjective(bucket.perspective));

  const explanation =
    missingLabels.length > 0
      ? `Bisher kommt ein großer Teil der Coverage aus ${getPerspectiveAdjective(dominant.perspective)}n Quellen; ${missingLabels.join(' und ')} Stimmen fehlen in dieser Auswahl noch.`
      : `Die Coverage wird gerade vor allem von ${getPerspectiveAdjective(dominant.perspective)}n Quellen geprägt, während ${getPerspectiveAdjective(weakest.perspective)} Quellen deutlich seltener vertreten sind.`;

  return {
    score: Math.min(rawScore, 100),
    label,
    explanation,
  };
};

const buildBucketLabel = (perspective: RatedPerspective) => {
  if (perspective === 'left') {
    return 'Links';
  }

  if (perspective === 'right') {
    return 'Rechts';
  }

  return 'Mitte';
};

export const buildStoryCoverage = (
  anchor: NewsItem,
  candidates: NewsItem[]
): StoryCoverageResult => {
  const anchorTopicTokens = unique(tokenizeStoryText(anchor.topic));
  const anchorFingerprint = buildFingerprint(anchor, anchorTopicTokens);
  const seenSourceIds = new Set<string>();
  const seenTitles = new Set<string>();

  const rankedItems = unique([anchor, ...candidates])
    .map((candidate) => {
      const fingerprint = buildFingerprint(candidate, anchorTopicTokens);
      const sourceProfile = getSourceProfile(candidate.source);
      const sharedTitleTerms = countOverlap(anchorFingerprint.titleTokens, fingerprint.titleTokens);
      const sharedAllTerms = countOverlap(anchorFingerprint.allTokens, fingerprint.allTokens);
      const sharedBigrams = countOverlap(anchorFingerprint.allBigrams, fingerprint.allBigrams);
      const sharedCoreTerms = countOverlap(anchorFingerprint.coreTokens, fingerprint.coreTokens);

      return {
        ...candidate,
        sourceProfile,
        matchScore: scoreStoryMatch(anchor, candidate, anchorFingerprint, fingerprint),
        sharedTitleTerms,
        sharedAllTerms,
        sharedBigrams,
        sharedCoreTerms,
      } satisfies RankedCandidate;
    })
    .filter(
      (candidate) =>
        candidate.matchScore >= 8 &&
        (candidate.id === anchor.id ||
          candidate.sharedBigrams >= 1 ||
          candidate.sharedCoreTerms >= 2 ||
          (candidate.sharedTitleTerms >= 2 && candidate.sharedAllTerms >= 4))
    )
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime();
    })
    .filter((candidate) => {
      const titleKey = buildTitleKey(candidate.title);

      if (seenTitles.has(titleKey)) {
        return false;
      }

      if (seenSourceIds.has(candidate.sourceProfile.sourceId)) {
        return false;
      }

      seenTitles.add(titleKey);
      seenSourceIds.add(candidate.sourceProfile.sourceId);
      return true;
    })
    .map(
      ({ sharedTitleTerms, sharedAllTerms, sharedBigrams, sharedCoreTerms, ...candidate }) =>
        candidate
    )
    .slice(0, 8);

  const buckets: StoryCoverageBucket[] = (['left', 'center', 'right'] as RatedPerspective[]).map(
    (perspective) => {
      const items = rankedItems.filter(
        (item) => item.sourceProfile.biasRating === perspective
      );
      return {
        perspective,
        label: buildBucketLabel(perspective),
        count: items.length,
        percentage: 0,
        items: items.slice(0, 3),
        sourceIds: unique(items.map((item) => item.sourceProfile.sourceId)),
      };
    }
  );

  const ratedSourceCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const unknownSourceCount = rankedItems.filter(
    (item) =>
      item.sourceProfile.biasRating === 'unknown' ||
      item.sourceProfile.biasRating === 'mixed'
  ).length;
  const totalSourceCount = ratedSourceCount + unknownSourceCount;

  buckets.forEach((bucket) => {
    bucket.percentage =
      ratedSourceCount > 0 ? Math.round((bucket.count / ratedSourceCount) * 100) : 0;
  });

  return {
    storyId: `${normalizeText(anchor.title).slice(0, 80)}-${anchor.topic.toLowerCase()}`,
    items: rankedItems,
    buckets,
    blindspot: buildBlindspot(buckets, unknownSourceCount),
    ratedSourceCount,
    unknownSourceCount,
    totalSourceCount,
  };
};

export const formatFactualityLabel = (rating: FactualityRating) => {
  if (rating === 'high') {
    return 'Factuality High';
  }

  if (rating === 'mixed') {
    return 'Factuality Mixed';
  }

  return 'Factuality Unrated';
};

export const formatOwnershipLabel = (ownership: OwnershipType) => {
  if (ownership === 'public') {
    return 'Public';
  }

  if (ownership === 'state') {
    return 'State';
  }

  if (ownership === 'independent') {
    return 'Independent';
  }

  if (ownership === 'private') {
    return 'Private';
  }

  return 'Ownership Unknown';
};
