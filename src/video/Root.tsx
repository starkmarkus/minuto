import React from 'react';
import { Composition } from 'remotion';
import { MinutoVideo } from './DailyBriefVideo';
import { sampleBrief } from './sampleBrief';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MinutoVideo"
        component={MinutoVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          brief: sampleBrief,
        }}
      />
    </>
  );
};
