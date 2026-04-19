export const sampleBrief = {
  dateLabel: '29.03.2026',
  durationLabel: '100 Sek.',
  title: 'Minuto',
  strapline: 'Dein personalisiertes Video-Briefing',
  topics: ['Klima + Politik', 'Politik + Wirtschaft', 'KI + Politik'],
  items: [
    {
      kicker: 'Klima + Politik',
      headline:
        'In Brüssel wird gerade konkreter über schnellere Genehmigungen für Netze und saubere Industrie verhandelt.',
      summary:
        'Für Deutschland ist das relevant, weil genau solche Entscheidungen darüber mitentscheiden, wie schnell neue Energieinfrastruktur wirklich gebaut werden kann.',
      source: 'Europa Briefing',
    },
    {
      kicker: 'Politik + Wirtschaft',
      headline:
        'Die Debatte dreht sich stärker darum, wie Investitionen wieder schneller in Industrie und Standorte gelenkt werden.',
      summary:
        'Spannend ist hier vor allem die Frage, welche Maßnahmen tatsächlich kurzfristig wirken und nicht nur politisch gut klingen.',
      source: 'Wirtschaft vor Acht',
    },
    {
      kicker: 'KI + Politik',
      headline:
        'Bei KI geht es aktuell vor allem darum, wie Regulierung und praktische Nutzung zusammengebracht werden.',
      summary:
        'Besonders relevant ist das für Unternehmen und öffentliche Stellen, die KI produktiv einsetzen wollen, ohne später regulatorisch aufzulaufen.',
      source: 'EU Policy Watch',
    },
  ],
};

export type SampleBrief = typeof sampleBrief;
