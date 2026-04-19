import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { sampleBrief, type SampleBrief } from './sampleBrief';

type VideoProps = {
  brief?: SampleBrief;
};

const palette = {
  bgTop: '#06101c',
  bgBottom: '#10233b',
  panel: 'rgba(7, 17, 31, 0.72)',
  border: 'rgba(148, 163, 184, 0.18)',
  white: '#f8fafc',
  muted: '#cbd5e1',
  soft: '#94a3b8',
  accent: '#f97316',
  cyan: '#7dd3fc',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: 34,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 20px 60px rgba(2, 6, 23, 0.35)',
};

export const MinutoVideo: React.FC<VideoProps> = ({ brief = sampleBrief }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const introProgress = spring({
    frame,
    fps,
    config: {
      damping: 200,
      stiffness: 120,
      mass: 0.8,
    },
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${palette.bgTop} 0%, ${palette.bgBottom} 100%)`,
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: palette.white,
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(249, 115, 22, 0.22), transparent 28%), radial-gradient(circle at 80% 18%, rgba(125, 211, 252, 0.18), transparent 26%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: 64,
          height: '100%',
          gap: 28,
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transform: `translateY(${interpolate(introProgress, [0, 1], [30, 0])}px)`,
            opacity: introProgress,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                color: palette.cyan,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              {brief.title}
            </div>
            <div style={{ color: palette.soft, fontSize: 22 }}>{brief.strapline}</div>
          </div>

          <div
            style={{
              backgroundColor: palette.accent,
              color: palette.white,
              borderRadius: 999,
              padding: '12px 18px',
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            {brief.durationLabel}
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            padding: 34,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            transform: `translateY(${interpolate(introProgress, [0, 1], [50, 0])}px)`,
            opacity: introProgress,
          }}
        >
          <div
            style={{
              color: palette.cyan,
              fontSize: 24,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
            }}
          >
            Heute wichtig
          </div>
          <div style={{ fontSize: 64, lineHeight: 1.02, fontWeight: 850 }}>
            {brief.topics.join(' • ')}
          </div>
          <div style={{ color: palette.muted, fontSize: 28, lineHeight: 1.4 }}>
            {brief.dateLabel} • Personalisierte Auswahl • Vertikales Video-Briefing
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          {brief.items.map((item, index) => {
            const start = index * 45;
            const itemProgress = spring({
              frame: Math.max(0, frame - start),
              fps,
              config: {
                damping: 180,
                stiffness: 110,
                mass: 0.9,
              },
            });

            return (
              <Sequence key={item.headline} from={index * 20}>
                <div
                  style={{
                    ...cardStyle,
                    padding: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    transform: `translateY(${interpolate(itemProgress, [0, 1], [60, 0])}px)`,
                    opacity: itemProgress,
                  }}
                >
                  <div
                    style={{
                      color: palette.accent,
                      fontSize: 22,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {item.kicker}
                  </div>
                  <div style={{ fontSize: 38, lineHeight: 1.15, fontWeight: 800 }}>
                    {item.headline}
                  </div>
                  <div style={{ color: palette.muted, fontSize: 26, lineHeight: 1.35 }}>
                    {item.summary}
                  </div>
                  <div style={{ color: palette.soft, fontSize: 20, fontWeight: 700 }}>
                    Quelle: {item.source}
                  </div>
                </div>
              </Sequence>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            left: 54,
            right: 54,
            bottom: 44,
            ...cardStyle,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transform: `translateY(${interpolate(frame, [0, 20], [40, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}px)`,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: palette.accent,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              color: palette.white,
              fontSize: 24,
              lineHeight: 1.35,
            }}
          >
            Untertitel-Look für das spätere Voiceover. Nächster Schritt:
            automatische Befüllung aus deinem echten Briefing.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
