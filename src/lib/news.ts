import { getMockNews, type NewsItem } from '../data/mockNews';
import { hydrateNewsImages } from './media';

const normalizeTopicLabel = (topic: string) => topic.replace(/\s+/g, ' ').trim();

const normalizeLookupKey = (topic: string) =>
  normalizeTopicLabel(topic)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildCoverageByTopic = (items: NewsItem[]) => {
  const coverageByTopic: Record<string, NewsItem[]> = {};

  items.forEach((item) => {
    const topicKey = normalizeLookupKey(item.topic);

    if (!coverageByTopic[topicKey]) {
      coverageByTopic[topicKey] = [];
    }

    if (coverageByTopic[topicKey].length < 8) {
      coverageByTopic[topicKey].push(item);
    }
  });

  return coverageByTopic;
};

export const fetchNewsForTopics = async (
  topics: string[],
  targetSlides = topics.length
): Promise<{
  items: NewsItem[];
  mode: 'live' | 'mock';
  coverageByTopic: Record<string, NewsItem[]>;
}> => {
  const normalizedTopics = topics.map(normalizeTopicLabel);
  const mockItems = getMockNews(normalizedTopics, targetSlides);
  const items = await hydrateNewsImages(mockItems);

  return {
    items,
    mode: 'mock',
    coverageByTopic: buildCoverageByTopic(items),
  };
};
