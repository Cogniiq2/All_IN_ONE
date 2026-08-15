/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#080C14',
        surface: {
          1: '#0D1117',
          2: '#111827',
          3: '#1C2333',
        },
        border: {
          subtle: '#1F2937',
          emphasis: '#374151',
        },
        gold: {
          DEFAULT: '#D4A843',
          dim: '#92701F',
          glow: 'rgba(212,168,67,0.15)',
        },
        text: {
          primary: '#F9FAFB',
          secondary: '#9CA3AF',
          muted: '#4B5563',
        },
        status: {
          green: '#10B981',
          'green-bg': 'rgba(16,185,129,0.1)',
          amber: '#F59E0B',
          'amber-bg': 'rgba(245,158,11,0.1)',
          red: '#EF4444',
          'red-bg': 'rgba(239,68,68,0.1)',
          blue: '#3B82F6',
          'blue-bg': 'rgba(59,130,246,0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        badge: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        elevated: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        'gold-glow': '0 0 0 2px rgba(212,168,67,0.4)',
      },
    },
  },
  plugins: [],
}
