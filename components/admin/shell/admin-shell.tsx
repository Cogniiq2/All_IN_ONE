import type { ReactNode } from 'react';
import type { AdminPosture } from '@/lib/admin/config';
import type { Operator } from '@/lib/admin/auth';
import { SidebarNav } from '@/components/admin/shell/sidebar-nav';
import { MobileBar } from '@/components/admin/shell/mobile-bar';
import { OperatorCard } from '@/components/admin/shell/operator-card';
import { CommandPalette } from '@/components/admin/shell/command-palette';
import { BrandArtMask } from '@/components/brand/logo';
import { brandArt } from '@/lib/content/media';

/**
 * The application shell: a graphite rail on the left of a bone working
 * surface. On desktop the rail is always there; below 1024px it becomes a
 * compact top bar with a slide-over. Both hold the same navigation and the
 * same operator card, so nothing is learned twice.
 */
export function AdminShell({
  operator,
  posture,
  attentionCount,
  properties,
  children,
}: {
  operator: Operator;
  posture: AdminPosture;
  attentionCount: number;
  properties: { slug: string; name: string }[];
  children: ReactNode;
}) {
  const footer = <OperatorCard operator={operator} posture={posture} />;

  return (
    <div className="bc-shell">
      <aside className="bc-sidebar" aria-label="BoLaGio Control">
        <div className="bc-sidebar-brand">
          <div className="bc-brand-word">
            <span className="sr-only">BoLaGio</span>
            <BrandArtMask art={brandArt.wordmark} height="1.36em" />
          </div>
          <div className="bc-brand-control">Control</div>
          <div className="bc-brand-sub">Residence Operations</div>
        </div>
        <SidebarNav attentionCount={attentionCount} />
        <div className="bc-sidebar-foot">{footer}</div>
      </aside>

      <div className="min-w-0">
        <MobileBar attentionCount={attentionCount} footer={footer} preview={posture.previewDemo} />
        <main id="control-main" className="bc-main">
          <div className="bc-page">{children}</div>
        </main>
      </div>

      <CommandPalette properties={properties} />
    </div>
  );
}
