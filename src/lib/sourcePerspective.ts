import { type NewsItem } from '../data/mockNews';

export type SourcePerspective = 'left' | 'center' | 'right' | 'mixed' | 'unknown';
export type RatedPerspective = Exclude<SourcePerspective, 'mixed' | 'unknown'>;
export type FactualityRating = 'high' | 'mixed' | 'unrated';
export type OwnershipType =
  | 'private'
  | 'public'
  | 'state'
  | 'independent'
  | 'unknown';

export type SourceProfile = {
  sourceId: string;
  biasRating: SourcePerspective;
  factualityRating: FactualityRating;
  ownershipType: OwnershipType;
  geography: 'Germany' | 'Europe' | 'US' | 'Global' | 'Unknown';
};

export type PerspectiveBucket = {
  perspective: Exclude<SourcePerspective, 'mixed' | 'unknown'>;
  label: string;
  count: number;
  items: NewsItem[];
};

const SOURCE_PROFILE_MAP: Record<string, SourceProfile> = {
  'associated press': {
    sourceId: 'associated-press',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'independent',
    geography: 'US',
  },
  ap: {
    sourceId: 'associated-press',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'independent',
    geography: 'US',
  },
  reuters: {
    sourceId: 'reuters',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Global',
  },
  bbc: {
    sourceId: 'bbc',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Europe',
  },
  bloomberg: {
    sourceId: 'bloomberg',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'US',
  },
  politico: {
    sourceId: 'politico',
    biasRating: 'center',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  axios: {
    sourceId: 'axios',
    biasRating: 'center',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  'frankfurter allgemeine': {
    sourceId: 'faz',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  faz: {
    sourceId: 'faz',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  handelsblatt: {
    sourceId: 'handelsblatt',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  zdf: {
    sourceId: 'zdf',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Germany',
  },
  ard: {
    sourceId: 'ard',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Germany',
  },
  tagesschau: {
    sourceId: 'tagesschau',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Germany',
  },
  nzz: {
    sourceId: 'nzz',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Europe',
  },
  economist: {
    sourceId: 'economist',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Global',
  },
  cnn: {
    sourceId: 'cnn',
    biasRating: 'left',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  guardian: {
    sourceId: 'guardian',
    biasRating: 'left',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Europe',
  },
  'new york times': {
    sourceId: 'new-york-times',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'US',
  },
  msnbc: {
    sourceId: 'msnbc',
    biasRating: 'left',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  spiegel: {
    sourceId: 'spiegel',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  taz: {
    sourceId: 'taz',
    biasRating: 'left',
    factualityRating: 'mixed',
    ownershipType: 'independent',
    geography: 'Germany',
  },
  zeit: {
    sourceId: 'zeit',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  'zeit online': {
    sourceId: 'zeit',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  'deutsche welle': {
    sourceId: 'deutsche-welle',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Germany',
  },
  dw: {
    sourceId: 'deutsche-welle',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'public',
    geography: 'Germany',
  },
  'el pais': {
    sourceId: 'el-pais',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Europe',
  },
  repubblica: {
    sourceId: 'la-repubblica',
    biasRating: 'center',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Europe',
  },
  larepublica: {
    sourceId: 'la-republica',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Global',
  },
  'larepublica co': {
    sourceId: 'la-republica',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Global',
  },
  'washington post': {
    sourceId: 'washington-post',
    biasRating: 'left',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'US',
  },
  fox: {
    sourceId: 'fox-news',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  'fox news': {
    sourceId: 'fox-news',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  welt: {
    sourceId: 'welt',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Germany',
  },
  'wall street journal': {
    sourceId: 'wall-street-journal',
    biasRating: 'right',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'US',
  },
  telegraph: {
    sourceId: 'telegraph',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Europe',
  },
  'new york post': {
    sourceId: 'new-york-post',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'US',
  },
  'junge freiheit': {
    sourceId: 'junge-freiheit',
    biasRating: 'right',
    factualityRating: 'mixed',
    ownershipType: 'private',
    geography: 'Germany',
  },
  'judische allgemeine': {
    sourceId: 'juedische-allgemeine',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  'juedische allgemeine': {
    sourceId: 'juedische-allgemeine',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  judischeallgemeine: {
    sourceId: 'juedische-allgemeine',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
  juedischeallgemeine: {
    sourceId: 'juedische-allgemeine',
    biasRating: 'center',
    factualityRating: 'high',
    ownershipType: 'private',
    geography: 'Germany',
  },
};

const normalizeSource = (source: string) =>
  source
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const inferSourceGeography = (source: string, normalizedSource: string): SourceProfile['geography'] => {
  const lowerSource = source.toLowerCase();

  if (
    /\.de\b/.test(lowerSource) ||
    /\b(germany|deutsch|berlin|hamburg|munich|muenchen)\b/.test(normalizedSource)
  ) {
    return 'Germany';
  }

  if (
    /\.fr\b|\.it\b|\.es\b|\.eu\b|\.at\b|\.ch\b|\.co\.uk\b|\.uk\b/.test(lowerSource) ||
    /\b(europe|europa|brussels|bruessel)\b/.test(normalizedSource)
  ) {
    return 'Europe';
  }

  if (
    /\.us\b/.test(lowerSource) ||
    /\b(usa|united states|washington|new york|america)\b/.test(normalizedSource)
  ) {
    return 'US';
  }

  if (/\.(com|org|net|io|co)\b/.test(lowerSource)) {
    return 'Global';
  }

  return 'Unknown';
};

const inferSourceOwnership = (
  source: string,
  normalizedSource: string
): OwnershipType => {
  if (
    /\b(tagesschau|ard|zdf|bbc|deutsche welle|dw)\b/.test(normalizedSource)
  ) {
    return 'public';
  }

  if (source.includes('.')) {
    return 'private';
  }

  return 'unknown';
};

export const getSourcePerspective = (source: string): SourcePerspective => {
  return getSourceProfile(source).biasRating;
};

export const getRatedSourcePerspective = (
  source: string
): RatedPerspective | 'unknown' => {
  const biasRating = getSourceProfile(source).biasRating;

  if (biasRating === 'left' || biasRating === 'center' || biasRating === 'right') {
    return biasRating;
  }

  return 'unknown';
};

export const getSourceProfile = (source: string): SourceProfile => {
  const normalizedSource = normalizeSource(source);

  for (const [key, profile] of Object.entries(SOURCE_PROFILE_MAP)) {
    if (normalizedSource.includes(key)) {
      return profile;
    }
  }

  return {
    sourceId: normalizedSource || 'unknown-source',
    biasRating: 'unknown',
    factualityRating: 'unrated',
    ownershipType: inferSourceOwnership(source, normalizedSource),
    geography: inferSourceGeography(source, normalizedSource),
  };
};

export const buildPerspectiveBuckets = (items: NewsItem[]) => {
  const buckets: PerspectiveBucket[] = [
    { perspective: 'left', label: 'Links', count: 0, items: [] },
    { perspective: 'center', label: 'Mitte', count: 0, items: [] },
    { perspective: 'right', label: 'Rechts', count: 0, items: [] },
  ];
  const seenSourceIds = new Set<string>();

  items.forEach((item) => {
    const profile = getSourceProfile(item.source);
    const perspective = profile.biasRating;

    if (
      seenSourceIds.has(profile.sourceId) ||
      (perspective !== 'left' && perspective !== 'center' && perspective !== 'right')
    ) {
      return;
    }

    seenSourceIds.add(profile.sourceId);
    const bucket = buckets.find((entry) => entry.perspective === perspective);

    if (bucket) {
      bucket.count += 1;
      if (bucket.items.length < 3) {
        bucket.items.push(item);
      }
    }
  });

  return buckets;
};
