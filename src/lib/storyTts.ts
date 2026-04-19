export type StoryTtsProvider = 'premium';

export type StoryTtsResult = {
  provider: StoryTtsProvider;
  uri: string;
};

export const synthesizeStoryNarration = async (
  _text?: string
): Promise<StoryTtsResult | null> => null;
