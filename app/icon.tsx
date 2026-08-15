import { ImageResponse } from 'next/server';

/**
 * Favicon: the B · L · G monogram, rendered at build time.
 * Replaces the previous state of affairs — no favicon at all, and a
 * zero-byte logo-allinone.png referenced from the structured data.
 */
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#12160F',
          color: '#D9BE8A',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        B
      </div>
    ),
    size
  );
}
