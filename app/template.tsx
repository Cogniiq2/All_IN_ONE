'use client';

/**
 * The page transition.
 *
 * Next.js remounts `template.tsx` on every navigation while `layout.tsx`
 * persists, which is exactly the split this needs: the header, footer and any
 * open modal stay put, and only the page content changes. That is what makes
 * a route change read as one continuous surface rather than a document reload.
 *
 * ── Why it is this small ─────────────────────────────────────────────────
 * A page arriving is not an event worth announcing. It rises 10px and resolves
 * in 520ms on the brand curve — enough that the eye registers *something*
 * happened and follows the new content down, not enough to make anyone wait.
 * There is no exit animation: Next renders the next route as soon as it is
 * ready, and holding the old page back to play it out would add real latency
 * to every click. Perceived speed is the premium quality here; a flourish that
 * costs 300ms is a downgrade.
 *
 * Only `opacity` and `transform` are animated — both composited, neither
 * triggering layout — so this cannot shift content or cost CLS.
 */

import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  /*
   * No reduced-motion branch here on purpose. Returning a different tree for
   * those users made the server markup disagree with the client and cost them
   * the entire server-rendered page on hydration. `MotionConfig` in
   * ClientLayout drops the rise for them and keeps the fade.
   */
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
