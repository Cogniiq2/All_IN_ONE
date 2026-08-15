/**
 * Journal.
 *
 * ── Restoration note ──────────────────────────────────────────────────────
 * The five original articles were restored from commit 1eb937d at their
 * original slugs, so no URL or search value was lost. Each was then edited to
 * remove only the false or unsupported passages — the fabricated five-apartment
 * inventory and its invented names, guaranteed garage parking, the 9.4/10
 * rating, welcome wine, "no service fees", fixed check-in times, dedicated
 * fibre, VAT-invoice promises, a made-up guest testimonial, unverified
 * distances and durations, and third-party claims we cannot check (specific
 * company site presence, competitor pricing, exact festival dates).
 *
 * What survived is the part that was always true and useful: Bayreuth, Wagner,
 * the Festival, and honest criteria for choosing somewhere to stay. Passages
 * that made a promise about our apartments were rewritten as criteria for the
 * reader instead — which keeps them useful without asserting anything we have
 * not confirmed.
 *
 * Rule for anything added later: if a sentence states a fact about our
 * apartments, our prices, our amenities or our availability, it does not go in
 * an article until the owners have confirmed it.
 */

export type Localized = { de: string; en: string };

export type ArticleBlock =
  /** Opening paragraph, set larger. */
  | { type: 'lead'; text: Localized }
  | { type: 'paragraph'; text: Localized }
  | { type: 'heading'; text: Localized }
  /** Pull quote with optional attribution. */
  | { type: 'quote'; text: Localized; attribution?: Localized }
  /** Highlighted aside. */
  | { type: 'note'; title: Localized; text: Localized }
  /** Numbered criteria list. */
  | { type: 'list'; items: { title: Localized; text: Localized }[] }
  /** Inline link to another page on this site. */
  | { type: 'link'; href: string; label: Localized };

export interface Article {
  slug: string;
  title: Localized;
  excerpt: Localized;
  category: Localized;
  /** ISO date — used for the article schema and the visible date. */
  publishedDate: string;
  readTime: Localized;
  body: ArticleBlock[];
  /** Slugs of related articles, rendered at the foot of the piece. */
  related: string[];
  featured?: boolean;
}

export const articles: Article[] = [
  // ══════════════════════════════════════════════════════════════════════
  {
    slug: 'bayreuth-festspiele-unterkunft-guide',
    title: {
      de: 'Festspiele in Bayreuth: Warum Unterkunft anders gedacht werden muss',
      en: 'The Bayreuth Festival: why accommodation needs to be thought about differently',
    },
    excerpt: {
      de: 'Die Warteliste ist lang, der Abend ist lang, und danach möchte niemand mehr weit fahren. Worauf es bei einer Unterkunft zur Festspielzeit wirklich ankommt.',
      en: 'The waiting list is long, the evening is long, and afterwards nobody wants a long journey. What actually matters in accommodation during festival season.',
    },
    category: { de: 'Festspiele', en: 'The Festival' },
    publishedDate: '2025-01-12',
    readTime: { de: '6 Min. Lesezeit', en: '6 min read' },
    related: ['richard-wagner-bayreuth-mythos', 'wo-in-bayreuth-ubernachten'],
    featured: true,
    body: [
      {
        type: 'lead',
        text: {
          de: 'Es gibt Abende, die man nicht zweimal erlebt. Ein Abend im Bayreuther Festspielhaus gehört dazu — stundenlang Wagner in einem Haus, das der Komponist selbst für seine Werke entworfen hat, umgeben von Menschen aus aller Welt, die alle wegen derselben Sache angereist sind.',
          en: 'There are evenings you do not experience twice. An evening at the Bayreuth Festspielhaus is one of them — hours of Wagner in a house the composer designed for his own works, surrounded by people from all over the world who have all travelled for the same thing.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Wer danach — nach dem letzten Akt, dem langen Applaus und der Stille, die sich anschließend über das Haus legt — noch eine weite Fahrt vor sich hat, verpasst einen Teil dieses Abends. Vielleicht den besten.',
          en: 'Anyone who then faces a long journey — after the final act, the long applause, and the silence that settles over the house afterwards — misses part of that evening. Perhaps the best part.',
        },
      },
      {
        type: 'note',
        title: {
          de: 'Früh suchen, nicht spät',
          en: 'Search early, not late',
        },
        text: {
          de: 'Die Festspiele finden traditionell im Hochsommer statt; Spielplan und genaue Termine veröffentlicht die Bayreuther Festspiele GmbH selbst. Unterkunft in Bayreuth ist in diesen Wochen knapp — wer Karten hat, klärt die Übernachtung am besten direkt danach und nicht im Frühjahr davor.',
          en: 'The Festival traditionally takes place in high summer; the programme and exact dates are published by the Bayreuth Festival itself. Accommodation in Bayreuth is scarce during those weeks — if you have tickets, settle where you will sleep straight afterwards, not in the spring before.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Was die Festspiele von anderen Kulturreisen unterscheidet',
          en: 'What sets the Festival apart from other cultural trips',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Die Bayreuther Festspiele sind kein gewöhnlicher Konzertbesuch. Wer einen Platz bekommen hat, hat darauf oft jahrelang gewartet — und bereitet sich entsprechend vor. Abendgarderobe ist üblich. Die Pausen sind lang genug, um in Ruhe zu essen und zu diskutieren. Eine Aufführung kann einen kompletten Nachmittag und Abend füllen.',
          en: 'The Bayreuth Festival is not an ordinary night out. Anyone who has obtained a seat has often waited years for it — and prepares accordingly. Evening dress is customary. The intervals are long enough to eat and talk properly. A performance can fill an entire afternoon and evening.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'In diesem Zusammenhang bekommt das Wort „Unterkunft" eine andere Bedeutung. Es geht nicht nur um einen Ort zum Schlafen, sondern um den Rahmen: den Abend davor, die Stunden danach, den Vormittag, an dem man nichts vorhat.',
          en: 'In that context the word "accommodation" means something different. It is not only about a place to sleep, but about the setting: the evening before, the hours after, the morning with nothing planned.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Das Grundproblem: alle wollen dasselbe, gleichzeitig',
          en: 'The underlying problem: everyone wants the same thing, at the same time',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Zur Festspielzeit reisen sehr viele Menschen gleichzeitig nach Bayreuth — aus Europa, aus Japan, aus den USA. Die meisten bleiben mehrere Tage, und die meisten suchen dasselbe: zentral, ruhig, genug Platz. Bayreuth ist eine kleine Stadt. Die Kapazität ist endlich, und sie ist in diesen Wochen früher vergeben als sonst im Jahr.',
          en: 'During festival season a great many people travel to Bayreuth at once — from Europe, from Japan, from the United States. Most stay several days, and most are looking for the same thing: central, quiet, enough space. Bayreuth is a small town. Capacity is finite, and in those weeks it is taken earlier than at any other time of year.',
        },
      },
      {
        type: 'heading',
        text: {
          de: 'Fünf Dinge, auf die es zur Festspielzeit wirklich ankommt',
          en: 'Five things that genuinely matter during festival season',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Es sind selten die Dinge, die auf Fotos gut aussehen. Prüfen Sie bei jeder Unterkunft, die Sie in die engere Wahl nehmen, diese fünf Punkte — unabhängig davon, bei wem Sie am Ende buchen.',
          en: 'It is rarely the things that photograph well. Whatever you shortlist, check these five points — regardless of who you end up booking with.',
        },
      },
      {
        type: 'list',
        items: [
          {
            title: { de: 'Wie Sie zum Festspielhaus kommen', en: 'How you will get to the Festspielhaus' },
            text: {
              de: 'Das Festspielhaus steht auf dem Grünen Hügel, etwas außerhalb des Stadtkerns. Klären Sie vor der Buchung konkret, wie Sie hin- und vor allem spätabends wieder zurückkommen — zu Fuß, mit dem Bus, mit dem Auto oder per Taxi. Verlassen Sie sich nicht auf eine Kilometerangabe.',
              en: 'The Festspielhaus stands on the Grüner Hügel, a little outside the town centre. Before booking, establish concretely how you will get there and — more importantly — back late at night: on foot, by bus, by car or by taxi. Do not rely on a distance in kilometres.',
            },
          },
          {
            title: { de: 'Ruhe nach Mitternacht', en: 'Quiet after midnight' },
            text: {
              de: 'Festspielabende enden spät. Eine Unterkunft direkt über einer Bar ist an einem normalen Wochenende ein Kompromiss — nach einer langen Aufführung ist sie ein Problem. Fragen Sie konkret nach der Lage des Schlafzimmers.',
              en: 'Festival evenings end late. Accommodation directly above a bar is a compromise on a normal weekend — after a long performance it is a problem. Ask specifically where the bedroom faces.',
            },
          },
          {
            title: { de: 'Wo das Auto steht', en: 'Where the car goes' },
            text: {
              de: 'Wenn Sie mit dem Auto anreisen, klären Sie das Parken vor der Buchung und lassen Sie sich die Antwort schriftlich geben. In einer vollen Innenstadt ist täglich neu zu suchen der schnellste Weg, sich den Aufenthalt zu verderben.',
              en: 'If you are arriving by car, settle parking before booking and get the answer in writing. In a busy town centre, hunting for a space every day is the quickest way to spoil a stay.',
            },
          },
          {
            title: { de: 'Platz zum Ankommen', en: 'Room to arrive' },
            text: {
              de: 'Nach einem langen Abend möchte man nicht direkt ins Bett fallen müssen, weil es keinen anderen Platz gibt. Ein Sessel, ein Tisch, ein Fenster — das klingt banal und entscheidet über den Rest des Abends.',
              en: 'After a long evening you do not want to fall straight into bed because there is nowhere else to be. A chair, a table, a window — it sounds trivial and it decides how the rest of the evening goes.',
            },
          },
          {
            title: { de: 'Ein Mensch, den Sie erreichen', en: 'A person you can reach' },
            text: {
              de: 'Fragen Sie, wen Sie anrufen, wenn abends etwas nicht funktioniert. Eine Nummer, an der jemand rangeht, ist zur Festspielzeit mehr wert als jede Ausstattungsliste.',
              en: 'Ask who you call if something does not work in the evening. A number where somebody answers is worth more during festival season than any list of amenities.',
            },
          },
        ],
      },
      {
        type: 'heading',
        text: { de: 'Und wenn Sie ohne Karten kommen', en: 'And if you come without tickets' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Bayreuth ist auch außerhalb der Festspielwochen eine Reise wert — ruhiger, günstiger und in vieler Hinsicht angenehmer. Das Markgräfliche Opernhaus, der Hofgarten und die Innenstadt sind das ganze Jahr über da.',
          en: 'Bayreuth is worth a trip outside the festival weeks too — quieter, cheaper and in many ways more pleasant. The Margravial Opera House, the Hofgarten and the town centre are there all year.',
        },
      },
      {
        type: 'link',
        href: '/bayreuth-2026',
        label: { de: 'Mehr über Bayreuth und die Festspielzeit', en: 'More about Bayreuth and festival season' },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════
  {
    slug: 'richard-wagner-bayreuth-mythos',
    title: {
      de: 'Richard Wagner und Bayreuth: Wie eine Stadt zur Wallfahrtsstätte wurde',
      en: 'Richard Wagner and Bayreuth: how a town became a place of pilgrimage',
    },
    excerpt: {
      de: 'Wagner wählte Bayreuth nicht zufällig. Er baute ein Theater nach seinen eigenen Regeln — und schuf ein kulturelles Gravitationszentrum, das bis heute wirkt.',
      en: 'Wagner did not choose Bayreuth by chance. He built a theatre by his own rules — and created a centre of cultural gravity that still pulls today.',
    },
    category: { de: 'Kultur & Geschichte', en: 'Culture & history' },
    publishedDate: '2025-02-28',
    readTime: { de: '6 Min. Lesezeit', en: '6 min read' },
    related: ['bayreuth-festspiele-unterkunft-guide', 'wo-in-bayreuth-ubernachten'],
    body: [
      {
        type: 'lead',
        text: {
          de: 'Es gibt Orte, deren Bedeutung weit über ihre Größe hinausgeht. Bayreuth ist einer davon: eine überschaubare oberfränkische Stadt, die jedes Jahr Menschen anzieht, die lange auf einen einzigen Abend gewartet haben. Der Grund ist ein Komponist, der im 19. Jahrhundert beschloss, die Regeln der Opernwelt neu zu schreiben.',
          en: 'Some places matter far beyond their size. Bayreuth is one of them: a modest Upper Franconian town that every year draws people who have waited a long time for a single evening. The reason is a composer who, in the nineteenth century, decided to rewrite the rules of opera.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Richard Wagner war ein Mensch der totalen Vision. Er schrieb nicht nur Musik — er wollte Gesamtkunstwerke, in denen Text, Bühne, Licht, Orchester und Gesang ein untrennbares Ganzes bilden. Und er erkannte früh, dass das in einem gewöhnlichen Opernhaus seiner Zeit nicht möglich war.',
          en: 'Richard Wagner was a man of total vision. He did not merely write music — he wanted complete works of art in which text, stage, light, orchestra and voice formed an inseparable whole. And he recognised early that this was not possible in an ordinary opera house of his day.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Die Häuser seiner Zeit waren prunkvoll und sozial gestaffelt: sichtbarer Orchestergraben, Logen, Ränge, ein Publikum, das sich auch selbst betrachtete. Wagner wollte das Gegenteil — Konzentration, Dunkelheit, Versenkung.',
          en: 'The houses of his time were ornate and socially tiered: a visible orchestra pit, boxes, galleries, an audience partly there to look at itself. Wagner wanted the opposite — concentration, darkness, absorption.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Das Festspielhaus: ein Theater nach eigenen Regeln', en: 'The Festspielhaus: a theatre by its own rules' },
      },
      {
        type: 'paragraph',
        text: {
          de: '1876 wurde das Bayreuther Festspielhaus auf dem Grünen Hügel eröffnet. Was dort entstand, hatte kein Vorbild: ein amphitheatralisch ansteigender Zuschauerraum ohne Ränge und Logen, in dem die soziale Staffelung der damaligen Opernhäuser schlicht fehlt. Das Orchester sitzt verdeckt unter der Bühne.',
          en: 'The Bayreuth Festspielhaus opened on the Grüner Hügel in 1876. What was built there had no precedent: an amphitheatre-like auditorium rising without boxes or galleries, in which the social tiering of contemporary opera houses is simply absent. The orchestra sits concealed beneath the stage.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Dieser verdeckte Graben ist so tief und so geformt, dass das Orchester kaum als eigenständige Klangquelle wahrgenommen wird, sondern als Teil des Raums. Wagner nannte ihn den „mystischen Abgrund". Der Name ist geblieben.',
          en: 'That covered pit is so deep and so shaped that the orchestra is barely perceived as a separate source of sound, but as part of the room itself. Wagner called it the "mystic abyss". The name has stuck.',
        },
      },
      {
        type: 'quote',
        text: {
          de: 'Wagners Werke werden weltweit gespielt. Aber ein Abend auf dem Grünen Hügel ist etwas, das sich anderswo schwer nachbauen lässt — weil das Haus selbst Teil des Stücks ist.',
          en: 'Wagner is performed all over the world. But an evening on the Grüner Hügel is hard to reproduce elsewhere — because the building itself is part of the piece.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Die Festspiele heute', en: 'The Festival today' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Die Warteliste für Karten ist legendär; es kann Jahre dauern, bis man einen Platz bekommt. Wer einmal dort war, kommt häufig wieder — die Treue des Publikums ist ein Phänomen für sich. Jedes Jahr gibt es neue Inszenierungen, mal traditionell, mal radikal modern, und praktisch immer diskutiert.',
          en: 'The waiting list for tickets is legendary; it can take years to get a seat. Those who have been once often come back — the loyalty of the audience is a phenomenon in itself. Each year brings new productions, sometimes traditional, sometimes radically modern, and almost always argued about.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Auch die Pausen gehören dazu: Man spaziert in Abendgarderobe über den Hügel, isst, redet, kehrt zurück. Wer das einmal erlebt hat, versteht, warum viele Besucher von einer Reise sprechen und nicht von einem Konzertbesuch.',
          en: 'The intervals are part of it too: you walk the hill in evening dress, eat, talk, return. Once you have experienced it, you understand why many visitors speak of a journey rather than a night at the opera.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Eine Stadt und ihr Komponist', en: 'A town and its composer' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Wagner starb 1883, aber das Haus auf dem Hügel steht weiter. Seine Nachkommen führten die Festspiele fort — mal glanzvoll, mal umstritten; die Geschichte des 20. Jahrhunderts hat auch hier ihre Spuren hinterlassen, und Bayreuth geht damit heute offener um als lange Zeit zuvor.',
          en: 'Wagner died in 1883, but the house on the hill remains. His descendants continued the Festival — sometimes brilliantly, sometimes controversially; the history of the twentieth century left its marks here too, and Bayreuth deals with that more openly today than it did for a long time.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Und die Stadt selbst? Sie hat sich mit dieser Geschichte arrangiert — stolz, gelegentlich ambivalent, immer bewusst. Wahnfried, Wagners Haus, das Museum, das Markgräfliche Opernhaus und natürlich das Festspielhaus: Wer Bayreuth kennenlernen will, kommt an dieser Geschichte nicht vorbei.',
          en: 'And the town itself? It has come to terms with that history — proud, occasionally ambivalent, always conscious of it. Wahnfried, Wagner\'s house, the museum, the Margravial Opera House and of course the Festspielhaus: anyone getting to know Bayreuth cannot go around this history.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Vielleicht ist das der Grund, warum ein Aufenthalt hier anders wirkt als in einer vergleichbar großen Stadt. Man übernachtet nicht einfach irgendwo. Man übernachtet in einem Kapitel Kulturgeschichte.',
          en: 'Perhaps that is why staying here feels different from staying in a town of comparable size. You are not simply sleeping somewhere. You are sleeping inside a chapter of cultural history.',
        },
      },
      {
        type: 'link',
        href: '/journal/bayreuth-festspiele-unterkunft-guide',
        label: { de: 'Weiterlesen: Unterkunft zur Festspielzeit', en: 'Read on: accommodation during festival season' },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════
  {
    slug: 'wo-in-bayreuth-ubernachten',
    title: {
      de: 'Wo in Bayreuth übernachten: ein ehrlicher Guide',
      en: 'Where to stay in Bayreuth: an honest guide',
    },
    excerpt: {
      de: 'Die Innenstadt ist kompakt — aber „zentral" bedeutet nicht überall dasselbe. Worauf es bei der Wahl der Unterkunft in Bayreuth ankommt, ohne Werbesprache.',
      en: 'The centre is compact — but "central" does not mean the same thing everywhere. What actually matters when choosing where to stay in Bayreuth, without the marketing language.',
    },
    category: { de: 'Reiseplanung', en: 'Travel planning' },
    publishedDate: '2025-03-18',
    readTime: { de: '5 Min. Lesezeit', en: '5 min read' },
    related: ['bayreuth-festspiele-unterkunft-guide', 'serviced-apartments-bayreuth-geschaftsreisen'],
    body: [
      {
        type: 'lead',
        text: {
          de: 'Bayreuth ist keine Großstadt. Die Innenstadt ist kompakt und überschaubar, und wenn man richtig wohnt, erledigt man das meiste zu Fuß. „Richtig wohnen" ist dabei das entscheidende Wort.',
          en: 'Bayreuth is not a big city. The centre is compact and manageable, and if you are in the right place you do most things on foot. "The right place" is the operative phrase.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Dieser Guide ist kein Werbetext. Er ist ein nüchterner Blick auf die Unterkunftsfrage in Bayreuth — was gut funktioniert, was weniger, und was man wissen sollte, bevor man bucht. Auch dann, wenn man am Ende woanders bucht als bei uns.',
          en: 'This guide is not an advertisement. It is a sober look at the accommodation question in Bayreuth — what works, what works less well, and what to know before booking. Including if you end up booking somewhere other than with us.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Die Geografie in einem Absatz', en: 'The geography in one paragraph' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Bayreuth hat einen kompakten Kern, darum herum ruhige Wohngebiete und schließlich Stadtränder mit Gewerbe. Entfernungen klingen in Kilometern klein und fühlen sich zu Fuß, mit Gepäck oder spätabends deutlich anders an. Prüfen Sie eine Adresse deshalb immer auf der Karte statt nur die Beschreibung zu lesen.',
          en: 'Bayreuth has a compact core, quiet residential areas around it, and eventually edges given over to business parks. Distances sound small in kilometres and feel very different on foot, with luggage, or late at night. So always check an address on a map rather than trusting the description.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Hotel, Ferienwohnung oder Apartment?', en: 'Hotel, holiday flat or apartment?' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Ehrlich gesagt ist keine dieser Formen grundsätzlich besser. Es kommt auf die Reise an. Für eine Nacht auf der Durchreise reicht ein Hotel meistens völlig. Für eine Festspielwoche, einen Projektmonat oder eine Familienreise mit Kindern beginnt der Unterschied dort, wo man mehr braucht als ein Bett: eine Küche, einen Tisch, zwei getrennte Räume, eine Waschmaschine.',
          en: 'Honestly, none of these is inherently better. It depends on the trip. For one night in transit a hotel is usually entirely sufficient. For a festival week, a month-long project or a family trip with children, the difference starts where you need more than a bed: a kitchen, a table, two separate rooms, a washing machine.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Fünf Fragen, die Sie vor jeder Buchung stellen sollten', en: 'Five questions to ask before any booking' },
      },
      {
        type: 'list',
        items: [
          {
            title: { de: '„Zentral" — gemessen woran?', en: '"Central" — measured against what?' },
            text: {
              de: 'Lassen Sie sich die Straße nennen und sehen Sie selbst nach. „In der Nähe des Zentrums" ist keine Angabe, sondern eine Formulierung.',
              en: 'Ask for the street and look it up yourself. "Near the centre" is not information, it is phrasing.',
            },
          },
          {
            title: { de: 'Wo parke ich, verbindlich?', en: 'Where exactly do I park?' },
            text: {
              de: 'Lassen Sie sich vor der Buchung schriftlich bestätigen, ob ein Stellplatz zur Verfügung steht — und ob er reserviert ist oder nur „meistens frei".',
              en: 'Get written confirmation before booking whether a space is available — and whether it is reserved or merely "usually free".',
            },
          },
          {
            title: { de: 'Wer ist im Notfall erreichbar?', en: 'Who is reachable if something goes wrong?' },
            text: {
              de: 'Ein Name und eine Nummer, an der abends jemand rangeht, ist mehr wert als eine Ausstattungsliste.',
              en: 'A name and a number where somebody actually answers in the evening is worth more than a list of amenities.',
            },
          },
          {
            title: { de: 'Wie laut ist es nachts wirklich?', en: 'How loud is it really at night?' },
            text: {
              de: 'Fragen Sie konkret, wohin das Schlafzimmer zeigt. Innenstadtlagen sind lebendig — das ist tagsüber ein Vorteil und nachts manchmal keiner.',
              en: 'Ask specifically which way the bedroom faces. Central locations are lively — an advantage by day and sometimes not by night.',
            },
          },
          {
            title: { de: 'Bekomme ich eine ordentliche Rechnung?', en: 'Will I get a proper invoice?' },
            text: {
              de: 'Für Geschäftsreisen und für Gruppen, die untereinander abrechnen, ist das im Nachhinein wichtiger, als es bei der Buchung wirkt.',
              en: 'For business trips, and for groups splitting costs between themselves, this matters more afterwards than it seems at the time of booking.',
            },
          },
        ],
      },
      {
        type: 'heading',
        text: { de: 'Wann Sie buchen sollten', en: 'When to book' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Für die Festspielwochen: so früh wie möglich. Für den Rest des Jahres ist Bayreuth entspannt — dann finden Sie auch kurzfristig etwas, und Sie haben die Ruhe, sich die Lage in Ruhe anzusehen.',
          en: 'For the festival weeks: as early as you can. For the rest of the year Bayreuth is relaxed — you will find something at short notice, and you have the calm to look properly at the location.',
        },
      },
      {
        type: 'link',
        href: '/apartments',
        label: { de: 'Unsere beiden Apartments ansehen', en: 'See our two apartments' },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════
  {
    slug: 'serviced-apartments-bayreuth-geschaftsreisen',
    title: {
      de: 'Bayreuth für Geschäftsreisende: was ein Hotelzimmer strukturell nicht kann',
      en: 'Bayreuth for business travellers: what a hotel room structurally cannot do',
    },
    excerpt: {
      de: 'Universität, Klinikum und Industrie bringen das ganze Jahr über Dienstreisende nach Oberfranken. Ab etwa der dritten Nacht ändern sich die Anforderungen an die Unterkunft.',
      en: 'The university, the hospital and regional industry bring business travellers to Upper Franconia all year. From roughly the third night, what you need from accommodation changes.',
    },
    category: { de: 'Geschäftsreisen', en: 'Business travel' },
    publishedDate: '2025-03-22',
    readTime: { de: '5 Min. Lesezeit', en: '5 min read' },
    related: ['wo-in-bayreuth-ubernachten', 'wie-wir-arbeiten'],
    body: [
      {
        type: 'lead',
        text: {
          de: 'Bayreuth steht auf der mentalen Landkarte der meisten Geschäftsreisenden nicht weit oben. Zu Unrecht: Die Universität, das Klinikum und die Industrie in der Region bringen das ganze Jahr über Menschen für mehrere Tage oder Wochen hierher.',
          en: 'Bayreuth does not sit high on most business travellers\' mental map. Unfairly so: the university, the hospital and regional industry bring people here for several days or weeks all year round.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Für eine Nacht ist das kein Thema. Ab der dritten Nacht schon. Denn wer mehrere Tage bleibt, wohnt — und Wohnen ist etwas anderes als Übernachten.',
          en: 'For one night that is not an issue. From the third night it is. Because anyone staying several days is living somewhere — and living is not the same as sleeping over.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Wo das Hotelzimmer an Grenzen stößt', en: 'Where the hotel room reaches its limits' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Es geht nicht um schlechte Hotels. Es geht um strukturelle Grenzen. Ein Hotelzimmer ist darauf ausgelegt, dass man dort schläft und morgens wieder geht. Wer eine Woche bleibt, braucht mehr: einen Tisch, an dem man arbeiten kann, ohne das Bett als Schreibtisch zu benutzen. Die Möglichkeit, abends etwas zu kochen, statt zum vierten Mal dieselbe Karte zu lesen. Einen Raum, in dem man nach Feierabend nicht sofort wieder im Arbeitszimmer sitzt.',
          en: 'This is not about bad hotels. It is about structural limits. A hotel room is designed for sleeping in and leaving in the morning. Anyone staying a week needs more: a table you can work at without using the bed as a desk. The option of cooking something in the evening instead of reading the same menu a fourth time. A room where, after work, you are not immediately back in the office again.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Was Sie für längere Dienstreisen konkret prüfen sollten', en: 'What to check specifically for longer trips' },
      },
      {
        type: 'list',
        items: [
          {
            title: { de: 'Internet — und zwar konkret', en: 'Internet — specifically' },
            text: {
              de: 'Fragen Sie nach der tatsächlichen Verbindung und ob sie für Videokonferenzen und VPN reicht. „Schnelles WLAN" steht in jedem Inserat und bedeutet nichts.',
              en: 'Ask about the actual connection and whether it holds up for video calls and VPN. "Fast Wi-Fi" appears in every listing and means nothing.',
            },
          },
          {
            title: { de: 'Ein echter Arbeitsplatz', en: 'A real place to work' },
            text: {
              de: 'Tisch, Stuhl, Licht, Steckdose in Reichweite. Lassen Sie sich ein Foto davon schicken, wenn keines dabei ist.',
              en: 'Table, chair, light, a socket within reach. Ask for a photograph of it if none is shown.',
            },
          },
          {
            title: { de: 'Küche, die man tatsächlich benutzen kann', en: 'A kitchen you can actually use' },
            text: {
              de: 'Zwei Platten und ein Wasserkocher sind keine Küche, wenn Sie drei Wochen bleiben. Fragen Sie nach Backofen, Kühlschrankgröße und Geschirr.',
              en: 'Two hobs and a kettle are not a kitchen if you are staying three weeks. Ask about the oven, the size of the fridge, and whether there is proper crockery.',
            },
          },
          {
            title: { de: 'Wäsche', en: 'Laundry' },
            text: {
              de: 'Ab etwa einer Woche wird die Waschmaschine zum wichtigsten Gerät der Wohnung. Klären Sie, ob eine vorhanden ist.',
              en: 'From about a week in, the washing machine becomes the most important appliance in the flat. Establish whether there is one.',
            },
          },
          {
            title: { de: 'Rechnung und Abrechnung', en: 'Invoicing' },
            text: {
              de: 'Klären Sie vor der Buchung, welche Art von Beleg Sie bekommen und ob Ihre Buchhaltung damit arbeiten kann. Das nachträglich zu reparieren ist mühsam.',
              en: 'Before booking, establish what kind of document you will receive and whether your finance department can work with it. Fixing that afterwards is tedious.',
            },
          },
        ],
      },
      {
        type: 'heading',
        text: { de: 'Wenn ein Projekt Wochen dauert', en: 'When a project runs for weeks' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Bei Aufenthalten ab einer Woche verschieben sich die Maßstäbe grundlegend. Wochenlang aus dem Koffer zu leben, jeden Abend auswärts zu essen und keinen eigenen Rückzugsort zu haben, kostet Energie, die für die Arbeit gebraucht wird. Wer sich stattdessen einrichten kann — einkaufen, eine Routine finden, abends wirklich abschalten — kommt anders durch ein Projekt.',
          en: 'For stays of a week or more the criteria shift completely. Living out of a suitcase for weeks, eating out every evening and having nowhere of your own costs energy that the work needs. Being able to settle in instead — shopping, finding a routine, actually switching off in the evening — carries you through a project differently.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Für längere Aufenthalte lohnt es sich fast immer, direkt zu fragen statt über eine Plattform zu buchen: Zeitraum, Konditionen und Besonderheiten lassen sich in einem Gespräch klären, das eine Buchungsmaske nicht führen kann.',
          en: 'For longer stays it is almost always worth asking directly rather than booking through a platform: dates, terms and particulars can be settled in a conversation that a booking form cannot have.',
        },
      },
      {
        type: 'link',
        href: '/book-direct',
        label: { de: 'Wie eine direkte Anfrage abläuft', en: 'How a direct enquiry works' },
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════
  {
    slug: 'wie-wir-arbeiten',
    title: {
      de: 'Wie wir arbeiten — und warum diese Website manches noch offen lässt',
      en: 'How we work — and why this website still leaves some things open',
    },
    excerpt: {
      de: 'Kein Callcenter, keine Verwaltung, keine Sofortbuchung. Warum wir Anfragen persönlich beantworten und lieber „wissen wir noch nicht" schreiben als eine Zahl zu erfinden.',
      en: 'No call centre, no property manager, no instant booking. Why we answer enquiries personally and would rather write "we do not know yet" than invent a number.',
    },
    category: { de: 'Über uns', en: 'About us' },
    publishedDate: '2025-03-05',
    readTime: { de: '3 Min. Lesezeit', en: '3 min read' },
    related: ['serviced-apartments-bayreuth-geschaftsreisen', 'wo-in-bayreuth-ubernachten'],
    body: [
      {
        type: 'lead',
        text: {
          de: 'Kein Rezeptionist. Kein Callcenter. Keine Hausverwaltung, die zwischen uns und Ihnen steht. Wir sind eine Familie in Bayreuth, der ein paar Wohnungen in der eigenen Stadt gehören — und die sie selbst vermietet.',
          en: 'No receptionist. No call centre. No property manager standing between us and you. We are a family in Bayreuth who own a few apartments in our own town — and who let them ourselves.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Das hat Folgen, angenehme und unbequeme. Die angenehme: Wenn Sie schreiben, antwortet ein Mensch, der die Wohnung kennt und entscheiden darf. Die unbequeme: Wir sind keine Maschine, die rund um die Uhr sofort bestätigt.',
          en: 'That has consequences, some pleasant and some inconvenient. The pleasant one: when you write, a person answers who knows the apartment and is allowed to decide. The inconvenient one: we are not a machine that confirms instantly around the clock.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Warum Sie hier nicht sofort buchen können', en: 'Why you cannot book instantly here' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Eine Sofortbuchung ist nur dann ehrlich, wenn im Hintergrund ein Kalender steht, der wirklich weiß, welche Nächte frei sind. Solange das nicht sauber gelöst ist, wäre ein „Jetzt buchen"-Knopf ein Versprechen, das wir im Zweifel nicht halten könnten — und niemand möchte nach der Zahlung erfahren, dass die Woche längst vergeben war.',
          en: 'Instant booking is only honest when there is a calendar behind it that genuinely knows which nights are free. Until that is properly solved, a "book now" button would be a promise we might not be able to keep — and nobody wants to learn after paying that the week was long since taken.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Deshalb fragen Sie hier an, statt zu buchen. Wir prüfen den Zeitraum, antworten mit Verfügbarkeit und Preis, und erst wenn Sie zusagen, ist etwas verbindlich.',
          en: 'So here you enquire rather than book. We check the dates, reply with availability and price, and only once you agree is anything binding.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Warum manche Angaben noch fehlen', en: 'Why some details are still missing' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Auf dieser Website stehen an einigen Stellen keine Quadratmeterzahlen, keine Ausstattungslisten und keine Preise. Das ist kein Versehen. Wir stellen diese Angaben gerade zusammen und veröffentlichen sie, sobald wir sie geprüft haben.',
          en: 'In several places this website gives no floor areas, no amenity lists and no prices. That is not an oversight. We are compiling those details and will publish them once we have checked them.',
        },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Die Alternative wäre gewesen, Zahlen zu schreiben, die ungefähr stimmen. Wir halten das für den schlechteren Weg: Eine Angabe, die bei der Ankunft nicht stimmt, ärgert mehr als eine Angabe, die zunächst fehlt. Fragen Sie uns danach — Sie bekommen eine konkrete Antwort, nur eben von einem Menschen und nicht von einer Tabelle.',
          en: 'The alternative would have been to write numbers that are roughly right. We think that is the worse path: a detail that turns out to be wrong on arrival is more annoying than a detail that is missing at first. Ask us — you will get a specific answer, just from a person rather than from a table.',
        },
      },
      {
        type: 'quote',
        text: {
          de: 'Lieber eine Lücke, die wir schließen, als eine Zahl, die wir erfinden.',
          en: 'Better a gap we will close than a number we invent.',
        },
      },
      {
        type: 'heading',
        text: { de: 'Was wir zusagen können', en: 'What we can commit to' },
      },
      {
        type: 'paragraph',
        text: {
          de: 'Dass Sie mit uns sprechen und nicht mit einem Ticketsystem. Dass wir die Wohnung vor Ihrer Ankunft selbst vorbereiten. Dass wir sagen, wenn etwas nicht passt oder nicht geht — auch dann, wenn eine Zusage bequemer wäre.',
          en: 'That you speak to us and not to a ticket system. That we prepare the apartment ourselves before you arrive. That we say so when something does not fit or is not possible — including when saying yes would be easier.',
        },
      },
      {
        type: 'link',
        href: '/about',
        label: { de: 'Mehr über die Familie hinter BoLaGio', en: 'More about the family behind BoLaGio' },
      },
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getRelatedArticles(slug: string): Article[] {
  const article = getArticleBySlug(slug);
  if (!article) return [];
  return article.related
    .map((relatedSlug) => getArticleBySlug(relatedSlug))
    .filter((a): a is Article => Boolean(a));
}
