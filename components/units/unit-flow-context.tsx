'use client';

/**
 * Which unit is open, and how far into its journey the visitor is.
 *
 * One provider drives both journeys, because the shape is the same and the
 * destination is not:
 *
 *   card → 'detail'                     (large modal, either journey)
 *   detail → 'booking'      short-term  (nights, contact, payment, done)
 *   detail → 'appointment'  long-term   (who, when, contact, done)
 *
 * `journey` is set when a card is opened and never inferred later, so a unit
 * that is offered in both modes — the Schulstraße flats — always continues in
 * the journey the visitor actually entered from. A tenancy can never reach the
 * booking dialog, and a stay can never reach the appointment dialog.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { RentalUnit } from '@/lib/content/apartments';

export type UnitJourney = 'stay' | 'rent';
export type UnitStage = 'closed' | 'detail' | 'booking' | 'appointment';

interface UnitFlowState {
  unit: RentalUnit | null;
  journey: UnitJourney;
  stage: UnitStage;
  /** Opens the large detail view for a unit, in a stated journey. */
  openDetail: (unit: RentalUnit, journey: UnitJourney) => void;
  /** Short-term only. Ignored for a unit opened in the rental journey. */
  openBooking: (unit?: RentalUnit) => void;
  /** Long-term only. Ignored for a unit opened in the stay journey. */
  openAppointment: (unit?: RentalUnit) => void;
  /** Steps back from an action dialog to the detail view behind it. */
  backToDetail: () => void;
  close: () => void;
}

const UnitFlowContext = createContext<UnitFlowState | null>(null);

export function UnitFlowProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<RentalUnit | null>(null);
  const [journey, setJourney] = useState<UnitJourney>('stay');
  const [stage, setStage] = useState<UnitStage>('closed');

  const openDetail = useCallback((next: RentalUnit, nextJourney: UnitJourney) => {
    setUnit(next);
    setJourney(nextJourney);
    setStage('detail');
  }, []);

  const openBooking = useCallback((next?: RentalUnit) => {
    if (next) {
      setUnit(next);
      setJourney('stay');
    }
    setStage('booking');
  }, []);

  const openAppointment = useCallback((next?: RentalUnit) => {
    if (next) {
      setUnit(next);
      setJourney('rent');
    }
    setStage('appointment');
  }, []);

  const backToDetail = useCallback(() => setStage('detail'), []);
  const close = useCallback(() => setStage('closed'), []);

  const value = useMemo(
    () => ({ unit, journey, stage, openDetail, openBooking, openAppointment, backToDetail, close }),
    [unit, journey, stage, openDetail, openBooking, openAppointment, backToDetail, close]
  );

  return <UnitFlowContext.Provider value={value}>{children}</UnitFlowContext.Provider>;
}

export function useUnitFlow() {
  const ctx = useContext(UnitFlowContext);
  if (!ctx) throw new Error('useUnitFlow must be used within UnitFlowProvider');
  return ctx;
}
