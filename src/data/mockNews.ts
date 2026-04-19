export type NewsItem = {
  id: string;
  topic: string;
  title: string;
  source: string;
  summary: string;
  publishedAt?: string;
  language?: string;
  imageUrl?: string;
  articleUrl?: string;
  imageCredit?: string;
};

export const mockNewsByTopic: Record<string, NewsItem[]> = {
  KI: [
    {
      id: 'ki-1',
      topic: 'KI',
      title: 'EU prüft strengere Transparenzpflichten für generative KI in sensiblen Anwendungsfeldern',
      source: 'EU Policy Watch',
      summary:
        'Diskutiert werden konkretere Vorgaben für Kennzeichnung, Risikobewertung und Nachvollziehbarkeit, besonders bei Systemen für Behörden, Bildung und Plattformen.',
    },
    {
      id: 'ki-2',
      topic: 'KI',
      title: 'Deutsche Unternehmen testen kleinere KI-Modelle für interne Recherche und Automatisierung',
      source: 'HandelsTech',
      summary:
        'Im Fokus stehen konkrete Einsätze in Kundenservice, Wissensmanagement und Prozessautomatisierung statt reiner Experimentierprojekte.',
    },
  ],
  Startups: [
    {
      id: 'startups-1',
      topic: 'Startups',
      title: 'Deutsche B2B-Start-ups sammeln frisches Kapital für Automatisierung und Energie-Software ein',
      source: 'Startup Insider',
      summary:
        'Investoren bevorzugen aktuell Geschäftsmodelle mit klarem Umsatzpfad, industriellen Kunden und messbarer Effizienzsteigerung.',
    },
    {
      id: 'startups-2',
      topic: 'Startups',
      title: 'Frühphasen-Fonds setzen wieder stärker auf Klima- und Industrie-Start-ups',
      source: 'VC Briefing',
      summary:
        'Besonders gefragt sind junge Firmen, die an Speichern, Netzen, Materialeffizienz oder industrieller Software arbeiten.',
    },
  ],
  Politik: [
    {
      id: 'politik-1',
      topic: 'Politik',
      title: 'In Brüssel laufen neue Verhandlungen über Industriepolitik, Wettbewerbsfähigkeit und schnellere Genehmigungen',
      source: 'Europa Briefing',
      summary:
        'Konkret geht es um Investitionsanreize, Entbürokratisierung und darum, wie Europa bei Energie, Tech und Produktion unabhängiger werden kann.',
    },
    {
      id: 'politik-2',
      topic: 'Politik',
      title: 'Die Bundesregierung ringt bei mehreren Dossiers zwischen Haushaltsdruck und Investitionsbedarf',
      source: 'Berlin Lage',
      summary:
        'Besonders relevant sind Entscheidungen, bei denen gleichzeitig Klimaziele, Wirtschaftswachstum und soziale Entlastung finanziert werden sollen.',
    },
  ],
  Wirtschaft: [
    {
      id: 'wirtschaft-1',
      topic: 'Wirtschaft',
      title: 'Die deutsche Industrie fordert schnellere Strompreis- und Netzentlastungen',
      source: 'Wirtschaft vor Acht',
      summary:
        'Im Mittelpunkt stehen konkrete Maßnahmen, die Produktion im Land halten und Investitionen in energieintensive Standorte wieder attraktiver machen sollen.',
    },
    {
      id: 'wirtschaft-2',
      topic: 'Wirtschaft',
      title: 'Neue Konjunktursignale werden vor allem danach bewertet, ob sie Investitionen wirklich wieder anschieben',
      source: 'Business Today',
      summary:
        'Analysten schauen besonders auf Bau, Industrie und Export, weil dort politische Entscheidungen kurzfristig den größten Unterschied machen können.',
    },
  ],
  Klima: [
    {
      id: 'klima-1',
      topic: 'Klima',
      title: 'In der EU wird über schnellere Genehmigungen für Netze, Speicher und saubere Industrieprojekte diskutiert',
      source: 'Climate Wire',
      summary:
        'Relevant ist dabei vor allem, welche Projekte künftig priorisiert werden und wie schnell neue Energie- und Industrieinfrastruktur tatsächlich gebaut werden kann.',
    },
    {
      id: 'klima-2',
      topic: 'Klima',
      title: 'Neue Investitionen fließen verstärkt in Batteriespeicher, Wärmepumpen und Netzausbau',
      source: 'Energy Transition Daily',
      summary:
        'Für Verbraucher und Unternehmen ist entscheidend, welche Technologien jetzt günstiger werden und wo politische Förderung den Markthochlauf beschleunigt.',
    },
  ],
  Wissenschaft: [
    {
      id: 'wissenschaft-1',
      topic: 'Wissenschaft',
      title: 'Forschungsteams melden Fortschritte bei Batteriematerialien und effizienteren Speichersystemen',
      source: 'Science Weekly',
      summary:
        'Das ist vor allem deshalb relevant, weil günstigere und langlebigere Speicher direkte Auswirkungen auf Stromnetze, Elektromobilität und Industrie haben können.',
    },
    {
      id: 'wissenschaft-2',
      topic: 'Wissenschaft',
      title: 'Neue Studien zeigen, welche Klimamodelle regionale Extremwetterrisiken präziser vorhersagen können',
      source: 'Research Update',
      summary:
        'Für Europa wird genauer untersucht, wie Dürre, Hitze und Starkregen in Infrastruktur, Landwirtschaft und Städteplanung einfließen sollten.',
    },
  ],
};

const buildCustomMockNews = (topic: string, count: number) => {
  const now = new Date().toISOString();

  return Array.from({ length: count }, (_, index) => ({
    id: `custom-${topic.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    topic,
    title: `Zu ${topic} gab es in den letzten 24 Stunden keine eindeutig passende Schlagzeile in den Standardquellen`,
    source: 'Minuto',
    summary:
      `Wir behalten ${topic} weiter im Blick und weiten die Suche automatisch auf verwandte Begriffe aus, ` +
      `damit das Thema stabiler im Briefing landet, sobald neue Meldungen auftauchen.`,
    publishedAt: now,
    language: 'de',
  }));
};

export const getMockNews = (topics: string[], targetSlides = topics.length) => {
  const perTopicCount = Math.max(1, Math.ceil(targetSlides / Math.max(1, topics.length)));

  return topics
    .flatMap((topic) => mockNewsByTopic[topic] ?? buildCustomMockNews(topic, perTopicCount))
    .slice(0, Math.max(targetSlides, topics.length));
};
