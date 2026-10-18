"use client";

import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BOOKED_LABEL,
  STAY_LABEL,
  addDaysIso,
  effectiveShow,
  hasActiveReservationFilter,
  readableDate,
  reservationFilterToParams,
  type ReservationBooked,
  type ReservationFilter,
  type ReservationShow,
  type ReservationWhen,
} from "@/lib/admin/reservation-filters";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The reservations explorer.
 *
 * Built in the order people ask: which apartment (tabs), which period (a
 * rail of periods), and — only when needed — the finer questions behind
 * "Refine": when it was booked, what to show, which channel, which order.
 * Anything set behind Refine is shown as a pill with an ×, so nothing
 * filters the list invisibly. The selection is repeated as a sentence, and
 * a slim bar keeps it (and Save as PDF) in reach while scrolling.
 *
 * Every choice is URL state: a view is a link, the back button works, and
 * the PDF is exactly the view.
 *
 * Motion: the selected tab's underline and the period pill slide to the
 * choice; the Refine drawer opens on its height; results dim while the
 * server answers and settle in after. Transform/opacity only, and none of it
 * under reduced motion.
 * ══════════════════════════════════════════════════════════════════════════
 */

type Unit = { slug: string; name: string; short: string };

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const PERIODS: Array<{ key: ReservationWhen | "dates"; label: string }> = [
  ...(
    [
      "upcoming",
      "current",
      "this_month",
      "next_month",
      "next_30",
      "this_year",
      "past",
      "all",
    ] as const
  ).map((k) => ({ key: k, label: STAY_LABEL[k] })),
  { key: "dates", label: "Dates" },
];
const BOOKED_CHIPS: ReservationBooked[] = [
  "any",
  "today",
  "last_7",
  "last_30",
  "this_month",
  "custom",
];
const SHOW_LABEL: Record<ReservationShow, string> = {
  booked: "Booked",
  cancelled: "Cancelled",
  all: "Everything",
};
const CHANNELS: Array<{ key: string; label: string }> = [
  { key: "", label: "All channels" },
  { key: "booking_com", label: "Booking.com" },
  { key: "airbnb", label: "Airbnb" },
  { key: "direct", label: "Website" },
  { key: "manual", label: "Manual" },
];
const CHANNEL_NAME: Record<string, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  direct: "the website",
  manual: "manual entry",
  unknown: "an unidentified channel",
};
const BOOKED_PHRASE: Record<
  Exclude<ReservationBooked, "any" | "custom">,
  string
> = {
  today: "Booked today",
  last_7: "Booked in the last 7 days",
  last_30: "Booked in the last 30 days",
  this_month: "Booked this month",
};

const EMPTY: Omit<ReservationFilter, never> = {
  q: "",
  unit: null,
  source: null,
  status: null,
  show: null,
  from: null,
  to: null,
  when: "upcoming",
  booked: "any",
  bookedFrom: null,
  bookedTo: null,
  order: "arrival",
};

/** The finer filters, as removable pills. Each knows how to undo itself. */
function refinements(
  f: ReservationFilter,
): Array<{ key: string; label: string; clear: Partial<ReservationFilter> }> {
  const pills: Array<{
    key: string;
    label: string;
    clear: Partial<ReservationFilter>;
  }> = [];
  if (f.booked === "custom" && (f.bookedFrom || f.bookedTo)) {
    const label =
      f.bookedFrom && f.bookedTo
        ? `Booked ${readableDate(f.bookedFrom)} – ${readableDate(f.bookedTo)}`
        : f.bookedFrom
          ? `Booked since ${readableDate(f.bookedFrom)}`
          : `Booked until ${readableDate(f.bookedTo as string)}`;
    pills.push({
      key: "booked",
      label,
      clear: { booked: "any", bookedFrom: null, bookedTo: null },
    });
  } else if (f.booked !== "any" && f.booked !== "custom") {
    pills.push({
      key: "booked",
      label: BOOKED_PHRASE[f.booked],
      clear: { booked: "any" },
    });
  }
  if (f.status) {
    pills.push({
      key: "status",
      label: `Only ${f.status === "active" ? "booked" : f.status === "provisional" ? "requested" : f.status}`,
      clear: { status: null },
    });
  } else if (f.show && f.show !== effectiveShow({ show: null, when: f.when })) {
    pills.push({
      key: "show",
      label:
        f.show === "cancelled"
          ? "Cancelled only"
          : f.show === "all"
            ? "Cancelled included"
            : "Booked only",
      clear: { show: null },
    });
  }
  if (f.source)
    pills.push({
      key: "source",
      label: `Via ${CHANNEL_NAME[f.source] ?? f.source}`,
      clear: { source: null },
    });
  if (f.order === "booked")
    pills.push({
      key: "order",
      label: "Newest bookings first",
      clear: { order: "arrival" },
    });
  return pills;
}

export function ReservationExplorer({
  filter,
  units,
  description,
  count,
  children,
}: {
  filter: ReservationFilter;
  units: Unit[];
  description: string;
  count: number | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // What the controls show: the server's filter, overlaid by the tap still travelling.
  const [view, setView] = useState(filter);
  const [q, setQ] = useState(filter.q);
  const [stayDates, setStayDates] = useState(Boolean(filter.from || filter.to));
  const [bookedDates, setBookedDates] = useState(filter.booked === "custom");
  const [refineOpen, setRefineOpen] = useState(false);
  const firstSearch = useRef(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const serverKey = reservationFilterToParams(filter).toString();
  useEffect(() => {
    setView(filter);
    setQ(filter.q);
    setStayDates(Boolean(filter.from || filter.to));
    setBookedDates(filter.booked === "custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the serialised filter is the identity.
  }, [serverKey]);

  // The latest choice, so two quick taps build on each other rather than on a stale render.
  const viewRef = useRef(view);
  viewRef.current = view;
  const navigate = useCallback(
    (next: ReservationFilter) => {
      viewRef.current = next;
      setView(next);
      const params = reservationFilterToParams(next);
      startTransition(() =>
        router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
          scroll: false,
        }),
      );
    },
    [pathname, router],
  );
  const apply = useCallback(
    (patch: Partial<ReservationFilter>) =>
      navigate({ ...viewRef.current, ...patch }),
    [navigate],
  );

  // Search: debounced while typing.
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    if (q.trim() === viewRef.current.q) return;
    const t = setTimeout(() => apply({ q: q.trim() }), 280);
    return () => clearTimeout(t);
  }, [q, apply]);

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      )
        return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const period: string = stayDates
    ? "dates"
    : view.when === "cancelled"
      ? "all"
      : view.when;
  const show =
    view.status === "active"
      ? "booked"
      : view.status === "cancelled"
        ? "cancelled"
        : effectiveShow(view);
  const pills = refinements(view);
  const exportQuery = reservationFilterToParams(filter).toString();
  const startOver = () => {
    setQ("");
    setStayDates(false);
    setBookedDates(false);
    navigate({ ...EMPTY });
  };

  return (
    <div className="bx" data-pending={pending ? "true" : undefined}>
      <Floating>
        <div
          className="bx-progress"
          data-active={pending ? "true" : undefined}
          aria-hidden="true"
        />
      </Floating>

      <div ref={topRef} className="bx-controls">
        <div className="bx-top">
          <label className="bx-search">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              placeholder="Guest name or booking number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  setQ("");
                }
              }}
              aria-label="Search reservations"
              autoComplete="off"
              spellCheck={false}
            />
            {q ? (
              <button
                type="button"
                className="bx-search-clear"
                onClick={() => setQ("")}
                aria-label="Clear search"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : (
              <kbd className="bx-kbd" aria-hidden="true">
                /
              </kbd>
            )}
          </label>
          <PdfSaveButton query={exportQuery} />
        </div>

        <ApartmentTabs
          units={units}
          value={view.unit ?? ""}
          onSelect={(slug) => apply({ unit: slug || null })}
        />

        <PeriodRail
          value={period}
          onSelect={(key) => {
            if (key === "dates") {
              setStayDates(true);
              return;
            }
            setStayDates(false);
            apply({ when: key as ReservationWhen, from: null, to: null });
          }}
        />

        <Collapse open={stayDates}>
          <DateRange
            fromLabel="Staying from"
            toLabel="until"
            from={view.from}
            // `to` is the exclusive end in the URL; people think in the last day.
            to={view.to ? addDaysIso(view.to, -1) : null}
            onChange={(from, until) =>
              apply({ from, to: until ? addDaysIso(until, 1) : null })
            }
          />
        </Collapse>

        <div className="bx-refine-bar">
          <button
            type="button"
            className="bx-refine-toggle"
            aria-expanded={refineOpen}
            aria-controls="bx-refine"
            onClick={() => setRefineOpen((o) => !o)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            Refine
            {pills.length > 0 && (
              <span className="bx-count">{pills.length}</span>
            )}
            <svg
              className="bx-caret"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <ul className="bx-pills" aria-label="Active refinements">
            {pills.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  className="bx-pill"
                  onClick={() => apply(p.clear)}
                  aria-label={`Remove: ${p.label}`}
                >
                  {p.label}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M7 7l10 10M17 7 7 17" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          {hasActiveReservationFilter(view) && (
            <button type="button" className="bx-startover" onClick={startOver}>
              Start over
            </button>
          )}
        </div>

        <Collapse open={refineOpen} id="bx-refine">
          <div className="bx-refine">
            <Field label="Booked" hint="When the guest made the booking">
              <Chips
                label="Booked"
                value={bookedDates ? "custom" : view.booked}
                options={BOOKED_CHIPS.map((k) => ({
                  key: k,
                  label: BOOKED_LABEL[k],
                }))}
                onSelect={(key) => {
                  if (key === "custom") {
                    setBookedDates(true);
                    return;
                  }
                  setBookedDates(false);
                  apply({
                    booked: key as ReservationBooked,
                    bookedFrom: null,
                    bookedTo: null,
                  });
                }}
              />
              <Collapse open={bookedDates}>
                <DateRange
                  fromLabel="Booked from"
                  toLabel="until"
                  from={view.bookedFrom}
                  to={view.bookedTo}
                  onChange={(from, until) =>
                    apply({
                      booked: from || until ? "custom" : "any",
                      bookedFrom: from,
                      bookedTo: until,
                    })
                  }
                />
              </Collapse>
            </Field>
            <Field label="Show">
              <Chips
                label="Show"
                value={show}
                options={(Object.keys(SHOW_LABEL) as ReservationShow[]).map(
                  (k) => ({ key: k, label: SHOW_LABEL[k] }),
                )}
                onSelect={(key) =>
                  apply({
                    show: key as ReservationShow,
                    status: null,
                    when: view.when === "cancelled" ? "all" : view.when,
                  })
                }
              />
            </Field>
            <Field label="Channel">
              <Chips
                label="Channel"
                value={view.source ?? ""}
                options={CHANNELS}
                onSelect={(key) =>
                  apply({
                    source: (key || null) as ReservationFilter["source"],
                  })
                }
              />
            </Field>
            <Field label="Sort by">
              <Chips
                label="Sort by"
                value={view.order}
                options={[
                  { key: "arrival", label: "Arrival date" },
                  { key: "booked", label: "Newest bookings" },
                ]}
                onSelect={(key) =>
                  apply({ order: key as ReservationFilter["order"] })
                }
              />
            </Field>
          </div>
        </Collapse>
      </div>

      <StickyContext
        watch={topRef}
        description={description}
        count={count}
        pending={pending}
        exportQuery={exportQuery}
      />

      <div key={serverKey} className="bx-results">
        {children}
      </div>
    </div>
  );
}

/* ── Sliding indicator ────────────────────────────────────────────────── */

/**
 * Where the selected option sits inside a container, kept in sync with
 * resizes. Until it is measured the option paints its own fill (`data-ready`
 * absent), so the first paint is never without a selection; the first
 * placement does not animate.
 */
function useIndicator(ref: RefObject<HTMLElement>, value: string) {
  const [box, setBox] = useState<{
    x: number;
    w: number;
    animate: boolean;
  } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!active) return setBox(null);
      setBox((prev) => ({
        x: active.offsetLeft,
        w: active.offsetWidth,
        animate: animate && prev !== null,
      }));
      // Keep the choice in view on a narrow rail, without moving the page.
      const left =
        active.offsetLeft - root.clientWidth / 2 + active.offsetWidth / 2;
      if (root.scrollWidth > root.clientWidth)
        root.scrollTo({ left, behavior: animate ? "smooth" : "auto" });
    };
    place(true);
    const ro = new ResizeObserver(() => place(false));
    ro.observe(root);
    return () => ro.disconnect();
  }, [value]);
  return box;
}

function ApartmentTabs({
  units,
  value,
  onSelect,
}: {
  units: Unit[];
  value: string;
  onSelect: (slug: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, value);
  const options = [{ slug: "", short: "All apartments" }, ...units];
  return (
    <div
      ref={ref}
      className="bx-tabs"
      role="radiogroup"
      aria-label="Apartment"
      data-ready={box ? "true" : undefined}
    >
      {options.map((u) => (
        <button
          key={u.slug || "all"}
          type="button"
          role="radio"
          aria-checked={value === u.slug}
          className="bx-tab"
          onClick={() => value !== u.slug && onSelect(u.slug)}
        >
          {u.short}
        </button>
      ))}
      {box && (
        <span
          className="bx-tab-line"
          data-animate={box.animate ? "true" : undefined}
          style={{ transform: `translateX(${box.x}px)`, width: box.w }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function PeriodRail({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, value);
  return (
    <div className="bx-rail-wrap">
      <span className="bx-rail-label">Staying</span>
      <div
        ref={ref}
        className="bx-rail"
        role="radiogroup"
        aria-label="Stay period"
        data-ready={box ? "true" : undefined}
      >
        {box && (
          <span
            className="bx-rail-thumb"
            data-animate={box.animate ? "true" : undefined}
            style={{ transform: `translateX(${box.x}px)`, width: box.w }}
            aria-hidden="true"
          />
        )}
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value === p.key}
            className="bx-rail-option"
            onClick={() => value !== p.key && onSelect(p.key)}
          >
            {p.key === "dates" && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M4 10h16M9 3v4M15 3v4" />
              </svg>
            )}
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** `inert` on a hidden region, so its controls cannot be tabbed into (React 18 knows no `inert` prop). */
function inertUnless(shown: boolean): Record<string, string> {
  return shown ? {} : { inert: "" };
}

/* ── Building blocks ──────────────────────────────────────────────────── */

/** Opens and closes on its height (CSS grid 0fr → 1fr), so nothing below jumps. */
function Collapse({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="bx-collapse"
      data-open={open ? "true" : undefined}
      {...inertUnless(open)}
    >
      <div className="bx-collapse-inner">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="bx-field">
      <p className="bx-field-label">
        {label}
        {hint && <small>{hint}</small>}
      </p>
      {children}
    </div>
  );
}

function Chips({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="bx-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key || "none"}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          className="bx-chip"
          onClick={() => o.key !== value && onSelect(o.key)}
        >
          <svg
            className="bx-tick"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DateRange({
  fromLabel,
  toLabel,
  from,
  to,
  onChange,
}: {
  fromLabel: string;
  toLabel: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  return (
    <div className="bx-dates">
      <label>
        <span>{fromLabel}</span>
        <input
          type="date"
          className="bc-input"
          value={from ?? ""}
          max={to ?? undefined}
          onChange={(e) => onChange(e.target.value || null, to)}
        />
      </label>
      <span className="bx-dates-dash" aria-hidden="true">
        –
      </span>
      <label>
        <span>{toLabel}</span>
        <input
          type="date"
          className="bc-input"
          value={to ?? ""}
          min={from ?? undefined}
          onChange={(e) => onChange(from, e.target.value || null)}
        />
      </label>
    </div>
  );
}

/**
 * Fixed-position layers (progress line, sticky bar, toast) are rendered on
 * <body>: the page container keeps a transform from its entrance animation,
 * and a transformed ancestor would pin `position: fixed` to itself instead
 * of the screen. `.bc-layer` carries the same design tokens out there.
 */
function Floating({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host
    ? createPortal(<div className="bc-layer bx-portal">{children}</div>, host)
    : null;
}

/* ── Sticky context ───────────────────────────────────────────────────── */

/**
 * Once the controls have scrolled away, a slim bar keeps the answer in view
 * — what is listed, how many — with a way back to the filters and the PDF.
 */
function StickyContext({
  watch,
  description,
  count,
  pending,
  exportQuery,
}: {
  watch: RefObject<HTMLElement>;
  description: string;
  count: number | null;
  pending: boolean;
  exportQuery: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) =>
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);

  return (
    <Floating>
      <div
        className="bx-sticky"
        data-visible={visible ? "true" : undefined}
        data-pending={pending ? "true" : undefined}
        aria-hidden={!visible}
        {...inertUnless(visible)}
      >
        <div className="bx-sticky-inner">
          <p className="bx-sticky-text">
            {count !== null && (
              <strong>
                {count} {count === 1 ? "booking" : "bookings"}
              </strong>
            )}
            <span>{description}</span>
          </p>
          <button
            type="button"
            className="bc-btn sm bx-sticky-filters"
            onClick={() =>
              watch.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 15 6-6 6 6" />
            </svg>
            Filters
          </button>
          <PdfSaveButton query={exportQuery} compact />
        </div>
      </div>
    </Floating>
  );
}

/* ── Save as PDF ──────────────────────────────────────────────────────── */

type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "done"; name: string }
  | { phase: "error"; message: string };

/**
 * Downloads the PDF of exactly this view. It fetches the file first, so the
 * button can show progress and then confirm by name — a plain link would
 * leave the owner wondering whether anything happened.
 */
function PdfSaveButton({
  query,
  compact,
}: {
  query: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<SaveState>({ phase: "idle" });

  useEffect(() => {
    if (state.phase !== "done" && state.phase !== "error") return;
    const t = setTimeout(
      () => setState({ phase: "idle" }),
      state.phase === "done" ? 4200 : 6500,
    );
    return () => clearTimeout(t);
  }, [state]);

  const save = async () => {
    if (state.phase === "saving") return;
    setState({ phase: "saving" });
    try {
      const response = await fetch(
        `/admin/reservations/export${query ? `?${query}` : ""}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const type = response.headers.get("Content-Type") ?? "";
      if (!response.ok || !type.includes("application/pdf")) {
        let message =
          response.status === 401 || response.redirected
            ? "Your session has ended. Sign in again, then save."
            : "The PDF could not be made. Try again in a moment.";
        if (type.includes("application/json"))
          message =
            (
              (await response.json().catch(() => null)) as {
                error?: string;
              } | null
            )?.error ?? message;
        setState({ phase: "error", message });
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          response.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "bolagio-reservations.pdf";
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ phase: "done", name });
    } catch {
      setState({
        phase: "error",
        message: "No connection. Check the network and try again.",
      });
    }
  };

  const label =
    state.phase === "saving"
      ? "Preparing PDF…"
      : state.phase === "done"
        ? "Saved"
        : compact
          ? "PDF"
          : "Save as PDF";
  return (
    <>
      <button
        type="button"
        className={`bc-btn primary bx-pdf${compact ? " sm bx-pdf-compact" : ""}`}
        data-state={state.phase}
        onClick={save}
        aria-busy={state.phase === "saving"}
        aria-label={compact ? "Save as PDF" : undefined}
      >
        <span className="bx-pdf-icon" aria-hidden="true">
          {state.phase === "done" ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="bx-draw" d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          ) : state.phase === "saving" ? (
            <span className="bx-spinner" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            </svg>
          )}
        </span>
        <span className="bx-pdf-label">{label}</span>
      </button>
      <Floating>
        <div className="bx-toast-host" role="status" aria-live="polite">
          {state.phase === "done" && (
            <div className="bx-toast" data-tone="positive">
              <strong>PDF saved</strong>
              <span>{state.name} is in your downloads.</span>
            </div>
          )}
          {state.phase === "error" && (
            <div className="bx-toast" data-tone="critical">
              <strong>Not saved</strong>
              <span>{state.message}</span>
            </div>
          )}
        </div>
      </Floating>
    </>
  );
}
