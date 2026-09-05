/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE BUILDINGS
 *
 * One record per building BoLaGio owns, and the single place that answers
 * three questions the whole site keeps asking:
 *
 *   • what do we call this building in public?
 *   • which drawing stands for it?
 *   • which street do its lettable units sit on?
 *
 * Before this file, the answers were spread across the portfolio procession,
 * the rented inventory and the group headings, and the three had already
 * drifted apart. They now all read from here.
 *
 * ── House numbers ────────────────────────────────────────────────────────
 * Only the two buildings a visitor is actually sent to carry one — those are
 * the addresses published on the contact page, and a guest needs to find the
 * door. Every other building is named by its street alone: these are
 * portfolio entries, nobody is being directed to them, and a house number on
 * an occupied flat is a tenant's address rather than ours to publish.
 *
 * ── Drawings, not photographs ────────────────────────────────────────────
 * `cover` is the building's architectural elevation — the same drawing the
 * About page's procession uses, from lib/content/portfolio.ts. It shows the
 * OUTSIDE of a building and is never presented as a photograph of a room. A
 * building without one (Tunnelstraße) resolves to `undefined`, and every
 * surface falls back to a neutral ground rather than borrowing a drawing of
 * some other building.
 *
 * NEEDS CONFIRMATION — an elevation for Tunnelstraße.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { portfolioBuildings, type PortfolioBuilding } from '@/lib/content/portfolio';

export interface Building {
  id: string;
  /**
   * The label shown wherever this building is named: /apartments and /mieten
   * group headings, and the About procession. One string, so the three can
   * never disagree again.
   */
  publicName: string;
  /**
   * The street as `BaseUnit.street` spells it, used to match the lettable
   * inventory to its building. Undefined for a building with no lettable
   * unit — nothing to match.
   */
  street?: string;
  /** The building's own elevation, where one exists. */
  cover?: PortfolioBuilding;
}

const drawing = (id: string): PortfolioBuilding | undefined =>
  portfolioBuildings.find((building) => building.id === id);

/**
 * Every building, in the order they appear on /apartments and /mieten:
 * the two a guest can be sent to, then the rest of the portfolio.
 */
export const buildings: Building[] = [
  {
    id: 'schulstrasse',
    publicName: 'Schulstraße 1',
    street: 'Schulstraße',
    cover: drawing('schulstrasse-1'),
  },
  {
    id: 'opernstrasse',
    publicName: 'Opernstraße 1',
    street: 'Opernstraße',
    cover: drawing('opernstrasse-1'),
  },
  { id: 'harburgerstrasse', publicName: 'Harburgerstraße', cover: drawing('harburgerstrasse-5') },
  { id: 'mainstrasse', publicName: 'Mainstraße', cover: drawing('mainstrasse-14') },
  { id: 'am-main', publicName: 'Am Main', cover: drawing('am-main-3') },
  { id: 'riedingerstrasse', publicName: 'Riedingerstraße', cover: drawing('riedingerstrasse-13') },
  // No elevation yet; every surface falls back to the neutral ground.
  { id: 'tunnelstrasse', publicName: 'Tunnelstraße' },
];

export function buildingById(id: string): Building | undefined {
  return buildings.find((building) => building.id === id);
}

/** The building a lettable unit belongs to, matched on its `street` field. */
export function buildingForStreet(street: string): Building | undefined {
  return buildings.find((building) => building.street === street);
}

/** The public label for a street, or the street itself if it is not ours. */
export function publicNameForStreet(street: string): string {
  return buildingForStreet(street)?.publicName ?? street;
}
