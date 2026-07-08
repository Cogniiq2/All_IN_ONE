export interface Residence {
  name: string;
  slug: string;
  collection: 'sternplatz' | 'innenstadt';
  collectionLabel: { de: string; en: string };
  guests: number;
  hasGarage: boolean;
  hasBalcony: boolean;
  shortDescription: { de: string; en: string };
  longDescription: { de: string; en: string };
  idealFor: { de: string; en: string }[];
  differentiator: { de: string; en: string };
  highlights: { de: string; en: string; icon: string }[];
  features: { de: string; en: string }[];
  images: string[];
  priceFrom: number;
  size?: string;
}

export const residences: Residence[] = [
  {
    name: 'Maison Sternplatz',
    slug: 'maison-sternplatz',
    collection: 'sternplatz',
    collectionLabel: { de: 'Sternplatz Collection', en: 'Sternplatz Collection' },
    guests: 4,
    hasGarage: true,
    hasBalcony: false,
    size: 'ca. 120 m²',
    differentiator: {
      de: 'Direkt am Sternplatz — beste Adresse Bayreuths',
      en: 'Right at Sternplatz — Bayreuth\'s finest address',
    },
    shortDescription: {
      de: 'Das größte Apartment der Sternplatz Collection — großzügig, elegant, mit direktem Sternplatz-Zugang.',
      en: 'The largest apartment in the Sternplatz Collection — generous, elegant, with direct Sternplatz access.',
    },
    longDescription: {
      de: 'Das Maison Sternplatz vereint die Lebendigkeit des Stadtzentrums mit der Stille einer privaten Residenz. Auf 120 m² bietet es Platz zum Wohnen, Arbeiten und Erholen — mit vollausgestatteter Küche, komfortablen Schlafbereichen und hochwertigen Materialien. Direkt am Sternplatz: Restaurants, Einkauf und das Markgräfliche Opernhaus in wenigen Schritten.',
      en: 'Maison Sternplatz combines the vibrancy of the city center with the quiet of a private residence. At 120 m², it offers space for living, working, and unwinding — with a fully equipped kitchen, comfortable sleeping areas, and quality materials throughout. Right at Sternplatz: restaurants, shopping, and the Margravial Opera House just steps away.',
    },
    idealFor: [
      { de: 'Festivalgäste & Kulturreisende', en: 'Festival guests & culture travelers' },
      { de: 'Paare & Freundesgruppen (bis 4)', en: 'Couples & groups (up to 4)' },
      { de: 'Geschäftsreisende', en: 'Business travelers' },
    ],
    highlights: [
      { de: 'Toplage direkt am Sternplatz', en: 'Prime location at Sternplatz', icon: 'MapPin' },
      { de: 'Garagenparkplatz inklusive', en: 'Garage parking included', icon: 'Car' },
      { de: 'Self Check-in rund um die Uhr', en: '24/7 self check-in', icon: 'Key' },
      { de: 'Vollausgestattete Küche', en: 'Fully equipped kitchen', icon: 'ChefHat' },
      { de: 'Premium-Badezimmer', en: 'Premium bathroom', icon: 'Bath' },
      { de: 'Hochwertiger Schlafkomfort', en: 'Premium sleep comfort', icon: 'Moon' },
      { de: 'Schnelles WLAN & Arbeitsplatz', en: 'Fast Wi-Fi & workspace', icon: 'Wifi' },
      { de: 'Willkommenswein (Direktbuchung)', en: 'Welcome wine (direct booking)', icon: 'Wine' },
    ],
    features: [
      { de: 'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)', en: 'Fully equipped kitchen (induction, oven, dishwasher)' },
      { de: 'Hochwertige Bettwäsche & Handtücher', en: 'Premium bed linens & towels' },
      { de: 'Nespresso-Maschine', en: 'Nespresso machine' },
      { de: 'Smart TV (Netflix, Prime)', en: 'Smart TV (Netflix, Prime)' },
      { de: 'Klimaanlage', en: 'Air conditioning' },
      { de: 'Waschmaschine', en: 'Washing machine' },
      { de: 'Bügelbrett & Bügeleisen', en: 'Iron & ironing board' },
      { de: 'Ergonomischer Arbeitsplatz', en: 'Ergonomic workspace' },
    ],
    images: [
      'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1260',
      'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3688261/pexels-photo-3688261.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2029722/pexels-photo-2029722.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3773575/pexels-photo-3773575.jpeg?auto=compress&cs=tinysrgb&w=800',
    ],
    priceFrom: 129,
  },
  {
    name: 'Loge am Sternplatz',
    slug: 'loge-am-sternplatz',
    collection: 'sternplatz',
    collectionLabel: { de: 'Sternplatz Collection', en: 'Sternplatz Collection' },
    guests: 4,
    hasGarage: true,
    hasBalcony: false,
    size: 'ca. 120 m²',
    differentiator: {
      de: 'Kultureller Charakter — ideal für Festspielgäste',
      en: 'Cultural character — ideal for festival guests',
    },
    shortDescription: {
      de: 'Von Bayreuths Theatertradition inspiriert — warm, kultiviert und direkt am Sternplatz.',
      en: 'Inspired by Bayreuth\'s theatrical tradition — warm, cultured, right at Sternplatz.',
    },
    longDescription: {
      de: 'Inspiriert von Bayreuths einzigartiger Theatertradition verbindet die Loge am Sternplatz kulturellen Charakter mit entspanntem Wohnkomfort. Eine durchdachte Einrichtung, warmes Licht und hochwertige Materialien schaffen eine Atmosphäre, die Erholung und Inspiration gleichermaßen bietet. Für Gäste, die Bayreuth nicht nur besuchen, sondern wirklich fühlen wollen.',
      en: 'Inspired by Bayreuth\'s unique theatrical tradition, the Loge combines cultural character with relaxed living comfort. Thoughtful interiors, warm lighting, and quality materials create an atmosphere of both rest and inspiration. For guests who want to feel Bayreuth, not just visit it.',
    },
    idealFor: [
      { de: 'Festivalgäste & Theaterliebhaber', en: 'Festival guests & theatre lovers' },
      { de: 'Kulturreisende & Paare', en: 'Culture travelers & couples' },
      { de: 'Langzeitaufenthalte', en: 'Long stays' },
    ],
    highlights: [
      { de: 'Direktlage am Sternplatz', en: 'Directly at Sternplatz', icon: 'MapPin' },
      { de: 'Garagenparkplatz inklusive', en: 'Garage parking included', icon: 'Car' },
      { de: 'Self Check-in rund um die Uhr', en: '24/7 self check-in', icon: 'Key' },
      { de: 'Vollausgestattete Küche', en: 'Fully equipped kitchen', icon: 'ChefHat' },
      { de: 'Premium-Badezimmer', en: 'Premium bathroom', icon: 'Bath' },
      { de: 'Hochwertiger Schlafkomfort', en: 'Premium sleep comfort', icon: 'Moon' },
      { de: 'Schnelles WLAN & Arbeitsplatz', en: 'Fast Wi-Fi & workspace', icon: 'Wifi' },
      { de: 'Willkommenswein (Direktbuchung)', en: 'Welcome wine (direct booking)', icon: 'Wine' },
    ],
    features: [
      { de: 'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)', en: 'Fully equipped kitchen (induction, oven, dishwasher)' },
      { de: 'Hochwertige Bettwäsche & Handtücher', en: 'Premium bed linens & towels' },
      { de: 'Nespresso-Maschine', en: 'Nespresso machine' },
      { de: 'Smart TV (Netflix, Prime)', en: 'Smart TV (Netflix, Prime)' },
      { de: 'Klimaanlage', en: 'Air conditioning' },
      { de: 'Waschmaschine', en: 'Washing machine' },
      { de: 'Bügelbrett & Bügeleisen', en: 'Iron & ironing board' },
      { de: 'Dedizierter Arbeitsplatz', en: 'Dedicated workspace' },
    ],
    images: [
      'https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1260',
      'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3773577/pexels-photo-3773577.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2029731/pexels-photo-2029731.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3688263/pexels-photo-3688263.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2724748/pexels-photo-2724748.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1457847/pexels-photo-1457847.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2062431/pexels-photo-2062431.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1080696/pexels-photo-1080696.jpeg?auto=compress&cs=tinysrgb&w=800',
    ],
    priceFrom: 119,
  },
  {
    name: 'Atelier Opernstraße',
    slug: 'atelier-opernstrasse',
    collection: 'sternplatz',
    collectionLabel: { de: 'Sternplatz Collection', en: 'Sternplatz Collection' },
    guests: 4,
    hasGarage: true,
    hasBalcony: false,
    size: 'ca. 120 m²',
    differentiator: {
      de: 'An der kulturellen Achse Bayreuths — zwischen Oper und Hofgarten',
      en: 'On Bayreuth\'s cultural axis — between opera house and Hofgarten',
    },
    shortDescription: {
      de: 'Lichtdurchflutet und kreativ an der Opernstraße — direkt zwischen Markgräflichem Opernhaus und Fußgängerzone.',
      en: 'Light-filled and creative on Opernstraße — directly between the Margravial Opera House and pedestrian zone.',
    },
    longDescription: {
      de: 'Das Atelier Opernstraße liegt direkt an Bayreuths kultureller Achse — zwischen dem Markgräflichen Opernhaus, dem Hofgarten und der pulsierenden Gastronomie der Fußgängerzone. Eine lichtdurchflutete, künstlerisch gestaltete Residenz mit doppeltem Arbeitsplatz — ideal für kreative Köpfe und Geschäftsreisende, die Arbeit und Erholung verbinden möchten.',
      en: 'The Atelier Opernstraße sits directly on Bayreuth\'s cultural axis — between the Margravial Opera House, the Hofgarten, and the vibrant dining scene of the pedestrian zone. A light-filled, artistically appointed residence with dual workspace — ideal for creatives and business travelers who want to combine work with discovery.',
    },
    idealFor: [
      { de: 'Kreative & Kulturreisende', en: 'Creatives & culture travelers' },
      { de: 'Geschäftsreisende', en: 'Business travelers' },
      { de: 'Festivalgäste', en: 'Festival guests' },
    ],
    highlights: [
      { de: 'Lage an der Opernstraße', en: 'Opernstraße address', icon: 'MapPin' },
      { de: 'Doppelter Arbeitsplatz', en: 'Dual workspace', icon: 'Wifi' },
      { de: 'Garagenparkplatz inklusive', en: 'Garage parking included', icon: 'Car' },
      { de: 'Self Check-in rund um die Uhr', en: '24/7 self check-in', icon: 'Key' },
      { de: 'Vollausgestattete Küche', en: 'Fully equipped kitchen', icon: 'ChefHat' },
      { de: 'Premium-Badezimmer', en: 'Premium bathroom', icon: 'Bath' },
      { de: 'Hochwertiger Schlafkomfort', en: 'Premium sleep comfort', icon: 'Moon' },
      { de: 'Willkommenswein (Direktbuchung)', en: 'Welcome wine (direct booking)', icon: 'Wine' },
    ],
    features: [
      { de: 'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)', en: 'Fully equipped kitchen (induction, oven, dishwasher)' },
      { de: 'Hochwertige Bettwäsche & Handtücher', en: 'Premium bed linens & towels' },
      { de: 'Nespresso-Maschine', en: 'Nespresso machine' },
      { de: 'Smart TV (Netflix, Prime)', en: 'Smart TV (Netflix, Prime)' },
      { de: 'Klimaanlage', en: 'Air conditioning' },
      { de: 'Waschmaschine', en: 'Washing machine' },
      { de: 'Doppelter Arbeitsplatz', en: 'Dual workspace' },
      { de: 'Bügelbrett & Bügeleisen', en: 'Iron & ironing board' },
    ],
    images: [
      'https://images.pexels.com/photos/2029694/pexels-photo-2029694.jpeg?auto=compress&cs=tinysrgb&w=1260',
      'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3773575/pexels-photo-3773575.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3688261/pexels-photo-3688261.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=800',
    ],
    priceFrom: 109,
  },
  {
    name: 'Penthouse Belvédère',
    slug: 'belvedere-penthouse',
    collection: 'innenstadt',
    collectionLabel: { de: 'Innenstadt Collection', en: 'City Center Collection' },
    guests: 4,
    hasGarage: true,
    hasBalcony: true,
    size: 'ca. 120 m²',
    differentiator: {
      de: 'Einziger Balkon mit Panoramablick über Bayreuth',
      en: 'The only balcony with panoramic views over Bayreuth',
    },
    shortDescription: {
      de: 'Das einzige Apartment mit privatem Balkon und unverstelltem Panoramablick über die Bayreuther Innenstadt.',
      en: 'The only apartment with a private balcony and unobstructed panoramic view over Bayreuth\'s city center.',
    },
    longDescription: {
      de: 'Das Penthouse Belvédère ist das Besondere im All in One Portfolio — als einzige Residenz bietet es einen privaten Balkon mit unverstelltem Panoramablick über Bayreuth. Auf 120 m² verbindet es großzügige Wohnfläche mit einem offenen Wohnkonzept und historischem Flair. Morgenkaffe mit Stadtblick. Abend auf dem Balkon mit einem Glas Wein. Hier wird aus einem Aufenthalt eine Erinnerung.',
      en: 'The Penthouse Belvédère is the jewel of the All in One portfolio — the only residence with a private balcony offering unobstructed panoramic views over Bayreuth. At 120 m², it combines generous living space with an open-plan concept. Morning coffee with a city view. An evening on the balcony with a glass of wine. Here, a stay becomes a memory.',
    },
    idealFor: [
      { de: 'Paare & besondere Anlässe', en: 'Couples & special occasions' },
      { de: 'Romantische Aufenthalte', en: 'Romantic stays' },
      { de: 'Festivalgäste mit Sinn für das Besondere', en: 'Festival guests seeking something special' },
    ],
    highlights: [
      { de: 'Privater Balkon mit Stadtpanorama', en: 'Private balcony with city panorama', icon: 'Landmark' },
      { de: 'Einzige Residenz mit Balkon', en: 'Only residence with a balcony', icon: 'Star' },
      { de: 'Zentrale Innenstadtlage', en: 'Central city-center location', icon: 'MapPin' },
      { de: 'Garagenparkplatz inklusive', en: 'Garage parking included', icon: 'Car' },
      { de: 'Self Check-in rund um die Uhr', en: '24/7 self check-in', icon: 'Key' },
      { de: 'Vollausgestattete Küche', en: 'Fully equipped kitchen', icon: 'ChefHat' },
      { de: 'Premium-Badezimmer', en: 'Premium bathroom', icon: 'Bath' },
      { de: 'Willkommenswein (Direktbuchung)', en: 'Welcome wine (direct booking)', icon: 'Wine' },
    ],
    features: [
      { de: 'Privater Panorama-Balkon mit Outdoor-Möblierung', en: 'Private panoramic balcony with outdoor furniture' },
      { de: 'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)', en: 'Fully equipped kitchen (induction, oven, dishwasher)' },
      { de: 'Hochwertige Bettwäsche & Handtücher', en: 'Premium bed linens & towels' },
      { de: 'Nespresso-Maschine', en: 'Nespresso machine' },
      { de: 'Smart TV (Netflix, Prime)', en: 'Smart TV (Netflix, Prime)' },
      { de: 'Waschmaschine', en: 'Washing machine' },
      { de: 'Bügelbrett & Bügeleisen', en: 'Iron & ironing board' },
      { de: 'Klimaanlage', en: 'Air conditioning' },
    ],
    images: [
      'https://images.pexels.com/photos/2462015/pexels-photo-2462015.jpeg?auto=compress&cs=tinysrgb&w=1260',
      'https://images.pexels.com/photos/2029722/pexels-photo-2029722.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3773577/pexels-photo-3773577.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3688261/pexels-photo-3688261.jpeg?auto=compress&cs=tinysrgb&w=800',
    ],
    priceFrom: 139,
  },
  {
    name: 'Design Loft Innenstadt',
    slug: 'designloft-innenstadt',
    collection: 'innenstadt',
    collectionLabel: { de: 'Innenstadt Collection', en: 'City Center Collection' },
    guests: 4,
    hasGarage: true,
    hasBalcony: false,
    size: 'ca. 120 m²',
    differentiator: {
      de: 'Ruhige Zentrallage — urban, zeitgenössisch, zurückgezogen',
      en: 'Quiet central location — urban, contemporary, tucked away',
    },
    shortDescription: {
      de: 'Modernes Design-Loft in ruhiger Innenstadtlage — der ideale Rückzugsort im Herzen Bayreuths.',
      en: 'Modern design loft in a quiet city-center location — the ideal retreat in the heart of Bayreuth.',
    },
    longDescription: {
      de: 'Das Design Loft Innenstadt liegt mitten in Bayreuth — ruhig genug für echte Erholung, zentral genug für alles, was die Stadt zu bieten hat. Zeitgenössisch gestaltet, mit hochwertiger Möblierung und durchdachten Details. Ein Loft, das Raum zum Atmen lässt — für Paare, die die Stadt genießen möchten, ohne mitten im Trubel zu schlafen.',
      en: 'The Design Loft Innenstadt sits in the middle of Bayreuth — quiet enough for genuine rest, central enough for everything the city offers. Contemporary in design, with quality furnishings and thoughtful details. A loft that gives you room to breathe — for those who want to enjoy the city without sleeping in the noise of it.',
    },
    idealFor: [
      { de: 'Paare & kleine Familien', en: 'Couples & small families' },
      { de: 'Ruhesuchende Stadtgäste', en: 'Guests seeking quiet city living' },
      { de: 'Langzeitgäste', en: 'Long-stay guests' },
    ],
    highlights: [
      { de: 'Ruhige zentrale Innenstadtlage', en: 'Quiet central city location', icon: 'MapPin' },
      { de: 'Zeitgenössisches Design-Interieur', en: 'Contemporary design interior', icon: 'Sparkles' },
      { de: 'Garagenparkplatz inklusive', en: 'Garage parking included', icon: 'Car' },
      { de: 'Self Check-in rund um die Uhr', en: '24/7 self check-in', icon: 'Key' },
      { de: 'Vollausgestattete Küche', en: 'Fully equipped kitchen', icon: 'ChefHat' },
      { de: 'Premium-Badezimmer', en: 'Premium bathroom', icon: 'Bath' },
      { de: 'Hochwertiger Schlafkomfort', en: 'Premium sleep comfort', icon: 'Moon' },
      { de: 'Willkommenswein (Direktbuchung)', en: 'Welcome wine (direct booking)', icon: 'Wine' },
    ],
    features: [
      { de: 'Vollausgestattete Küche (Induktion, Backofen, Spülmaschine)', en: 'Fully equipped kitchen (induction, oven, dishwasher)' },
      { de: 'Hochwertige Bettwäsche & Handtücher', en: 'Premium bed linens & towels' },
      { de: 'Nespresso-Maschine', en: 'Nespresso machine' },
      { de: 'Smart TV (Netflix, Prime)', en: 'Smart TV (Netflix, Prime)' },
      { de: 'Klimaanlage', en: 'Air conditioning' },
      { de: 'Waschmaschine', en: 'Washing machine' },
      { de: 'Bügelbrett & Bügeleisen', en: 'Iron & ironing board' },
      { de: 'Dedizierter Arbeitsplatz', en: 'Dedicated workspace' },
    ],
    images: [
      'https://images.pexels.com/photos/2029731/pexels-photo-2029731.jpeg?auto=compress&cs=tinysrgb&w=1260',
      'https://images.pexels.com/photos/3773575/pexels-photo-3773575.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2062426/pexels-photo-2062426.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1080696/pexels-photo-1080696.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/2724748/pexels-photo-2724748.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1457847/pexels-photo-1457847.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/3688263/pexels-photo-3688263.jpeg?auto=compress&cs=tinysrgb&w=800',
    ],
    priceFrom: 119,
  },
];

export function getResidenceBySlug(slug: string): Residence | undefined {
  return residences.find((r) => r.slug === slug);
}

export function getResidencesByCollection(collection: 'sternplatz' | 'innenstadt'): Residence[] {
  return residences.filter((r) => r.collection === collection);
}
