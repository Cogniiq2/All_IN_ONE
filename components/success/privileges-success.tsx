'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { SUCCESS_SCENES } from '@/lib/content/success';
import { readReceipt } from '@/lib/success/receipt';
import { SuccessExperience, SuccessStage } from '@/components/success/success-experience';
import { CtaLink, label } from '@/components/ui-kit/cta';

type PrivilegesScene = 'privileges-check-inbox' | 'privileges-welcome' | 'privileges-unsubscribed';

/** The three Residence Privileges confirmations. Nothing personal is shown. */
export function PrivilegesSuccess({ scene }: { scene: PrivilegesScene }) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const router = useRouter();
  const gated = scene === 'privileges-unsubscribed';
  const [allowed, setAllowed] = useState(!gated);

  useEffect(() => {
    if (!gated) return;
    if (readReceipt('privileges-unsubscribed')) setAllowed(true);
    else router.replace('/guest/privileges');
  }, [gated, router]);

  const data = SUCCESS_SCENES[scene];
  if (!allowed) return <SuccessStage tone={data.tone} />;

  const actions =
    scene === 'privileges-welcome' ? (
      <>
        <CtaLink href="/apartments" invert withArrow>{label('bookNow', locale)}</CtaLink>
        <CtaLink href="/bayreuth-2026" variant="secondary" invert>{label('discoverBayreuth', locale)}</CtaLink>
      </>
    ) : scene === 'privileges-check-inbox' ? (
      <CtaLink href="/guest/privileges" variant="secondary">
        {de ? 'Andere Adresse eintragen' : 'Use a different address'}
      </CtaLink>
    ) : (
      <CtaLink href="/" variant="secondary">{label('toHomepage', locale)}</CtaLink>
    );

  return <SuccessExperience scene={data} locale={locale} actions={actions} />;
}
