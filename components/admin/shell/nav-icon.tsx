import type { NavIcon } from '@/components/admin/shell/nav-items';

/**
 * Nine line icons on one 24-unit grid, 1.6 stroke, round joins. Drawn here
 * rather than pulled from an icon set so their weight, optical size and
 * alignment are one decision, not seven.
 */
export function Icon({ name, className }: { name: NavIcon; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };
  switch (name) {
    case 'overview':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      );
    case 'bookings':
      return (
        <svg {...common}>
          <path d="M5 4.5h14v15l-3.5-2-3.5 2-3.5-2-3.5 2z" />
          <path d="M8.5 9h7M8.5 12.5h5" />
        </svg>
      );
    case 'operations':
      return (
        <svg {...common}>
          <path d="M12 3.5 21 19H3z" />
          <path d="M12 10v4M12 16.5h.01" />
        </svg>
      );
    case 'cleaning':
      return (
        <svg {...common}>
          <path d="M14.5 3.5 20.5 9.5 9 21H3v-6z" />
          <path d="M12 6l6 6" />
        </svg>
      );
    case 'automations':
      return (
        <svg {...common}>
          <path d="M4 7h6l2 3h8" />
          <path d="M4 17h6l2-3h8" />
          <path d="M17 7l3 3-3 3M17 11l3 3-3 3" />
        </svg>
      );
    case 'properties':
      return (
        <svg {...common}>
          <path d="M4 20V9.5L12 4l8 5.5V20" />
          <path d="M4 20h16M10 20v-5h4v5" />
        </svg>
      );
    case 'payments':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12.5" rx="2" />
          <path d="M3 10.5h18M7 15h3" />
        </svg>
      );
    case 'system':
      return (
        <svg {...common}>
          <path d="M4 12h3l2.5-6 3 12 2.5-6H20" />
        </svg>
      );
  }
}
