export type ArticleContent = {
  url: string;
  text: string;
  excerpt: string;
  paragraphs: string[];
  source: 'article';
};

export const fetchArticleContent = async (_url?: string) => null;

export const selectRelevantArticleContent = (
  content: ArticleContent | null,
  _context?: string
) => content;
