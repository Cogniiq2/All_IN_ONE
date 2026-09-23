'use client';

import { useI18n } from '@/lib/i18n';
import { COMPANY, companyIdentityGaps } from '@/lib/legal/company';
import { LegalPage, LegalSection, Pending } from '@/components/legal/legal-page';

/**
 * Impressum (§ 5 DDG).
 *
 * Every fact is read from lib/legal/company.ts. A fact that is not verified
 * renders as a visible gap (`Pending`), never as a guess — the previous
 * version published "Musterstraße 1" and "DE XXX XXX XXX" as if they were
 * real, and a fabricated fact is worse than an acknowledged gap.
 *
 * Removed on 2026-09-23: the reference to the EU online dispute resolution
 * platform. Regulation (EU) 2024/3228 repealed the ODR Regulation and the
 * platform closed on 20 July 2025; the obligation to link it ended with it.
 * The § 36 VSBG statement is separate and still owed where it applies — it
 * comes from `COMPANY.consumerDisputeStatement` once the owners decide it.
 */
export default function ImpressumClient() {
  const { locale } = useI18n();
  const de = locale === 'de';
  const c = COMPANY;
  const pending = <Pending locale={locale} />;

  return (
    <LegalPage
      title={de ? 'Impressum' : 'Legal notice'}
      intro={
        de
          ? 'Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG).'
          : 'Information pursuant to § 5 of the German Digital Services Act (DDG).'
      }
      reviewed={companyIdentityGaps().length === 0 && c.consumerDisputeStatement !== null}
    >
      <LegalSection heading={de ? 'Anbieter' : 'Provider'}>
        <p>{c.legalName ?? pending}</p>
        <p>{c.street ?? pending}</p>
        <p>
          {c.postalCode && c.city ? `${c.postalCode} ${c.city}` : pending}
        </p>
        <p>{c.country}</p>
      </LegalSection>

      <LegalSection heading={de ? 'Vertreten durch die Geschäftsführung' : 'Represented by the managing director(s)'}>
        <p>{c.managingDirectors && c.managingDirectors.length > 0 ? c.managingDirectors.join(', ') : pending}</p>
      </LegalSection>

      <LegalSection heading={de ? 'Kontakt' : 'Contact'}>
        <p>
          {de ? 'Telefon' : 'Phone'}: {c.phone ?? pending}
        </p>
        <p>
          {de ? 'E-Mail' : 'Email'}: {c.email ? <a href={`mailto:${c.email}`} className="underline underline-offset-2">{c.email}</a> : pending}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Registereintrag' : 'Commercial register'}>
        <p>
          {de ? 'Registergericht' : 'Register court'}: {c.registerCourt ?? pending}
        </p>
        <p>
          {de ? 'Registernummer' : 'Register number'}: {c.registerNumber ?? pending}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Umsatzsteuer' : 'VAT'}>
        <p>
          {de
            ? 'Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: '
            : 'VAT identification number pursuant to § 27a UStG: '}
          {c.vatId ?? pending}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Verantwortlich für redaktionelle Inhalte' : 'Responsible for editorial content'}>
        <p>
          {de ? 'Verantwortlich nach § 18 Abs. 2 MStV: ' : 'Responsible pursuant to § 18(2) MStV: '}
          {c.editorialResponsible ?? pending}
        </p>
      </LegalSection>

      <LegalSection heading={de ? 'Verbraucherstreitbeilegung' : 'Consumer dispute resolution'}>
        <p>{c.consumerDisputeStatement ? c.consumerDisputeStatement[locale] : pending}</p>
      </LegalSection>
    </LegalPage>
  );
}
