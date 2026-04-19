import { type NewsItem } from '../data/mockNews';

const topicIntroMap: Record<string, string> = {
  KI: 'Schauen wir zuerst mal auf KI.',
  Startups: 'Dann kurz zu den Start-ups.',
  Politik: 'Dann schauen wir auf Politik.',
  Wirtschaft: 'Danach geht es um Wirtschaft.',
  Klima: 'Jetzt zum Thema Klima.',
  Wissenschaft: 'Und dann noch ein Blick auf Wissenschaft.',
  'Klima + Politik':
    'Spannend ist heute vor allem, was bei Klima und Politik konkret passiert.',
  'Klima + Wissenschaft':
    'Besonders interessant ist heute die Verbindung aus Klima und Wissenschaft.',
  'Politik + Wirtschaft':
    'Heute ist vor allem relevant, was Politik gerade direkt für die Wirtschaft bedeutet.',
  'KI + Politik':
    'Interessant ist heute vor allem, wie KI gerade politisch eingehegt wird.',
};

const getUniqueTopics = (items: NewsItem[]) => {
  const topics = new Set(items.map((item) => item.topic));
  return Array.from(topics);
};

const formatDate = (date?: string) => {
  if (!date) {
    return 'heute';
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
};

const shortenSummary = (summary: string) => {
  if (summary.length <= 280) {
    return summary;
  }

  return `${summary.slice(0, 277).trim()}...`;
};

const buildLine = (item: NewsItem) => {
  const date = formatDate(item.publishedAt);

  return `Da geht es um Folgendes: ${item.title}. ${shortenSummary(item.summary)} Die Quelle ist ${item.source} vom ${date}.`;
};

const getItemsPerTopic = (durationInSeconds: number) => {
  if (durationInSeconds <= 60) {
    return 1;
  }

  if (durationInSeconds <= 150) {
    return 2;
  }

  return 3;
};

const getIntro = (orderedTopics: string[], durationInSeconds: number) => {
  const durationText =
    durationInSeconds < 60
      ? 'sehr kurzes'
      : durationInSeconds < 180
        ? 'kompaktes'
        : 'etwas ausführlicheres';

  if (orderedTopics.length === 1) {
    return `Guten Morgen. Ich habe dir heute ein ${durationText} Briefing zum Thema ${orderedTopics[0]} rausgesucht. Ich erzähle es dir so, als würden wir gerade kurz zusammen einen Kaffee trinken.`;
  }

  return `Guten Morgen. Ich habe dir heute ein ${durationText} Briefing zusammengestellt, mit den wichtigsten und frischesten Meldungen zu ${orderedTopics.join(', ')}.`;
};

export const buildPodcastScript = (
  items: NewsItem[],
  topics: string[],
  durationInSeconds: number
) => {
  if (items.length === 0) {
    return '';
  }

  const availableTopics = getUniqueTopics(items);
  const orderedTopics = availableTopics.length > 0 ? availableTopics : topics;
  const itemsPerTopic = getItemsPerTopic(durationInSeconds);
  const intro = getIntro(orderedTopics, durationInSeconds);

  const topicSections = orderedTopics
    .map((topic) => {
      const topicItems = items
        .filter((item) => item.topic === topic)
        .slice(0, itemsPerTopic);

      if (topicItems.length === 0) {
        return '';
      }

      const lines = topicItems.map(buildLine);

      return [topicIntroMap[topic] ?? `Jetzt noch kurz zu ${topic}.`, ...lines].join(
        ' '
      );
    })
    .filter(Boolean);

  const outro =
    durationInSeconds <= 60
      ? 'Das war dein kurzes Minuto-Briefing für heute.'
      : 'Das war dein Minuto-Briefing für heute. Wenn du willst, machen wir als Nächstes die Auswahl noch schlauer und bauen danach eine deutlich bessere Stimme ein.';

  return [intro, ...topicSections, outro].join('\n\n');
};
