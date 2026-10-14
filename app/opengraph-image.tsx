import { ImageResponse } from 'next/og';
import { OG_MONOGRAM, OG_WORDMARK } from '@/lib/content/brand-art.generated';

/**
 * Share image, built from the brand system.
 *
 * Previously every share of this site — WhatsApp being the most likely
 * referral channel — showed a Pexels stock photograph of someone else's flat,
 * because the Open Graph image pointed at a pexels.com URL.
 */
export const alt = 'BoLaGio — Familiengeführte Apartments in Bayreuth';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#12160F',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
          <img src={OG_MONOGRAM.src} width={OG_MONOGRAM.width * 0.75} height={OG_MONOGRAM.height * 0.75} alt="" />
          <div style={{ display: 'flex', width: 56, height: 1, background: '#C9A76A' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              letterSpacing: '0.2em',
              color: '#A8A599',
            }}
          >
            BAYREUTH
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
          <img src={OG_WORDMARK.src} width={OG_WORDMARK.width * 0.8} height={OG_WORDMARK.height * 0.8} alt="BoLaGio" />
          <div
            style={{
              display: 'flex',
              fontSize: 32,
              color: '#C9A76A',
              letterSpacing: '-0.01em',
            }}
          >
            Familiengeführte Apartments in Bayreuth
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: '#A8A599', maxWidth: 820 }}>
            Zwei eigene Wohnungen in der Innenstadt — persönlich betreut, direkt angefragt.
          </div>
        </div>
      </div>
    ),
    size
  );
}
