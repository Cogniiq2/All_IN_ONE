/**
 * The public label for a portfolio drawing.
 *
 * A separate one-function module rather than a field on `PortfolioBuilding`,
 * because `lib/content/buildings.ts` already imports the portfolio and a label
 * on the record would close that loop into a cycle. The drawing keeps its own
 * full name (`Mainstraße 14`) as the record of which building it is; what the
 * page prints is the building's public name.
 */

import type { Locale, Localized } from '@/lib/content/apartments';
import { buildings } from '@/lib/content/buildings';
import type { PortfolioBuilding } from '@/lib/content/portfolio';

export function publicLabelFor(drawing: PortfolioBuilding): string {
  return buildings.find((building) => building.cover?.id === drawing.id)?.publicName ?? drawing.name;
}

/**
 * The drawing's alt text, using the public label.
 *
 * The record's own alt names the building in full ("Harburgerstraße 5"). A
 * screen-reader user should be told the same thing a sighted user reads, so
 * the published label is substituted here rather than the internal one —
 * otherwise the page would publish a house number in audio that it withholds
 * in print.
 */
export function publicAltFor(drawing: PortfolioBuilding, locale: Locale): string {
  const label = publicLabelFor(drawing);
  const alt: Localized = {
    de: `Architekturzeichnung der Immobilie ${label} in Bayreuth`,
    en: `Architectural sketch of the ${label} property in Bayreuth`,
  };
  return alt[locale];
}
