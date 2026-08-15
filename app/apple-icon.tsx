import { ImageResponse } from 'next/server';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#12160F',
          color: '#D9BE8A',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 12, fontSize: 54, fontWeight: 600 }}>
          <span>B</span>
          <span>L</span>
          <span>G</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 15,
            letterSpacing: '0.24em',
            color: '#8E8C82',
          }}
        >
          BAYREUTH
        </div>
      </div>
    ),
    size
  );
}
