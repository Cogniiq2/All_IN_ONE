/**
 * Journal.
 *
 * ── What happened to the previous five articles ───────────────────────────
 * All five were deleted. Their prose carried the fabricated brand claims that
 * this pass exists to remove: a guaranteed garage space at every apartment,
 * the invented 9.4/10 rating, five named apartments at a Sternplatz address
 * the company does not hold, and a whole essay describing how "All in One
 * Residences" runs its five units. Two of them were also illustrated with an
 * unlicensed Alamy comp and a Bayerischer Rundfunk press photograph.
 *
 * What remains is one piece written only from general, checkable knowledge
 * about Bayreuth and the Festival — it makes no claim about our apartments —
 * plus the article structure itself, ready for the family's own writing.
 *
 * To add an article: append an entry here. The overview and the article shell
 * pick it up automatically. Keep `body` free of anything unverified.
 */

export type Localized = { de: string; en: string };

export interface ArticleBlock {
  type: 'heading' | 'paragraph';
  text: Localized;
}

export interface Article {
  slug: string;
  title: Localized;
  excerpt: Localized;
  category: Localized;
  /** ISO date — used for the article schema and the visible date. */
  publishedDate: string;
  readTime: Localized;
  body: ArticleBlock[];
  featured?: boolean;
}

export const articles: Article[] = [
  {
    slug: 'bayreuth-und-die-festspiele',
    title: {
      de: 'Bayreuth und die Festspiele: Warum diese Stadt im Sommer eine andere ist',
      en: 'Bayreuth and the Festival: why this town is different in summer',
    },
    excerpt: {
      de: 'Eine kleine oberfränkische Stadt, ein Theater auf einem Hügel und ein Publikum, das jahrelang auf seine Karten wartet. Was das für alle bedeutet, die im Sommer hier übernachten möchten.',
      en: 'A small Upper Franconian town, a theatre on a hill, and an audience that waits years for its tickets. What that means for anyone looking for somewhere to stay in summer.',
    },
    category: { de: 'Bayreuth', en: 'Bayreuth' },
    publishedDate: '2026-08-01',
    readTime: { de: '4 Min. Lesezeit', en: '4 min read' },
    featured: true,
    body: [
      {
        type: 'paragraph',
        text: {
          de: 'Bayreuth ist die meiste Zeit des Jahres genau das, wonach es aussieht: eine oberfränkische Universitätsstadt mit einer barocken Innenstadt, einem Hofgarten und einer überschaubaren Zahl von Straßen, in denen sich das Leben abspielt. Man geht zu Fuß. Man kennt die Wege.',
          en: 'For most of the year Bayreuth is exactly what it looks like: an Upper Franconian university town with a baroque centre, a Hofgarten, and a manageable number of streets where life happens. You walk. You learn the way.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Und dann kommt der Sommer. Richard Wagner hat sich diese Stadt Ende des 19. Jahrhunderts ausgesucht, weil er ein Theater bauen wollte, das seinen eigenen Regeln folgt — kein Hoftheater, kein Repertoirebetrieb, sondern ein Haus für ein einziges Werk und ein Publikum, das dafür anreist. Genau das ist bis heute so geblieben.',
          en: 'And then summer arrives. Richard Wagner chose this town in the late nineteenth century because he wanted a theatre that followed his own rules — not a court theatre, not a repertory house, but a building for a single body of work and an audience that travels for it. That is still exactly what it is.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Ein Publikum, das lange gewartet hat',
          en: 'An audience that has waited a long time',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Die Bayreuther Festspiele sind berühmt dafür, dass Karten schwer zu bekommen sind. Wer im Sommer hier ist, hat den Termin meist lange im Voraus geplant — und entsprechend früh auch die Frage geklärt, wo er schläft. Das ist der eigentliche Unterschied zu anderen Reisezielen: Die Nachfrage nach Unterkunft konzentriert sich auf wenige Wochen im Jahr, und sie ist verabredet, nicht spontan.',
          en: 'The Bayreuth Festival is famous for how hard its tickets are to come by. Anyone here in summer has usually planned the date long in advance — and settled the question of where to sleep just as early. That is the real difference from other destinations: demand for accommodation concentrates into a few weeks a year, and it is arranged rather than spontaneous.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Für Gäste heißt das vor allem eines: früh fragen. Wer erst im Frühjahr sucht, findet in Bayreuth deutlich weniger als in einer Stadt, die das ganze Jahr über Besucher hat.',
          en: 'For guests that means one thing above all: ask early. Anyone who starts looking in spring will find considerably less in Bayreuth than in a town with visitors all year round.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Warum Nähe im Sommer zählt',
          en: 'Why proximity matters in summer',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Ein Wagner-Abend ist kein normaler Theaterabend. Er beginnt am Nachmittag, hat lange Pausen und endet spät. Danach noch eine weite Fahrt vor sich zu haben, verändert den ganzen Abend — man schaut auf die Uhr, statt zuzuhören. Wer in der Stadt selbst übernachtet, muss das nicht.',
          en: 'A Wagner evening is not a normal night at the theatre. It begins in the afternoon, has long intervals, and ends late. Having a long drive ahead afterwards changes the whole evening — you watch the clock instead of listening. Staying in town itself removes that.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Und den Rest des Jahres',
          en: 'And the rest of the year',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Außerhalb der Festspielwochen ist Bayreuth ruhiger und, ehrlich gesagt, angenehmer zu besuchen. Das Markgräfliche Opernhaus, der Hofgarten, die Universität, die Cafés in der Innenstadt — all das ist auch im Oktober da, nur ohne die Anspannung des Sommers. Wer die Stadt kennenlernen möchte, statt ein Festival zu besuchen, kommt vielleicht besser dann.',
          en: 'Outside the festival weeks Bayreuth is quieter and, honestly, more pleasant to visit. The Margravial Opera House, the Hofgarten, the university, the cafés in the centre — all of it is there in October too, just without the tension of summer. If you want to get to know the town rather than attend a festival, that may be the better time.',
        },
      },
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
