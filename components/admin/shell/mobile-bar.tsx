'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { SidebarNav } from '@/components/admin/shell/sidebar-nav';

/**
 * The compact top bar for phones and tablets, with a slide-over navigation.
 *
 * Radix Dialog supplies the parts that are easy to get wrong: focus moves
 * into the drawer on open and back to the button on close, Escape and an
 * outside tap close it, and the page behind is inert. The drawer contains the
 * same `SidebarNav` the desktop rail uses, so there is one navigation.
 */
export function MobileBar({ attentionCount, footer }: { attentionCount: number; footer: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="bc-topbar">
      <div className="flex items-baseline">
        <span className="bc-brand-word">
          B<span>o</span>L<span>a</span>G<span>io</span>
        </span>
        <span className="bc-topbar-control">Control</span>
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className="bc-icon-btn on-light" aria-label="Open navigation" style={{ width: 44, height: 44 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="bc-overlay" />
          <Dialog.Content className="bc-drawer" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="bc-sidebar-brand flex items-start justify-between">
              <div>
                <div className="bc-brand-word">
                  B<span>o</span>L<span>a</span>G<span>io</span>
                </div>
                <div className="bc-brand-control">Control</div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="bc-icon-btn" aria-label="Close navigation" style={{ width: 40, height: 40, marginTop: -4, marginRight: -8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <SidebarNav attentionCount={attentionCount} onNavigate={() => setOpen(false)} />
            <div className="bc-sidebar-foot">{footer}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}
