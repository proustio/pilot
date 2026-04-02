/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,html}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", 'Courier', 'monospace'],
      },
      colors: {
        'theme-bg': 'var(--bg-base)',
        'theme-text': 'var(--text-base)',
        'theme-primary': 'var(--player-primary)',
        'theme-enemy': 'var(--enemy-primary)',
        'theme-secondary': 'var(--color-secondary)',
        'theme-highlight': 'var(--color-highlight)',
        'theme-danger': 'var(--color-danger)',
        'panel-bg': 'var(--panel-bg)',
        'panel-border': 'var(--panel-border)',
        'btn-bg': 'var(--btn-bg)',
        'btn-hover': 'var(--btn-bg-hover)',
        'btn-border': 'var(--btn-border)',
        'btn-text': 'var(--btn-text)',
        'btn-primary-bg': 'rgba(34, 139, 34, 0.3)',
        'btn-primary-hover': 'rgba(34, 139, 34, 0.6)',
        'btn-danger-bg': 'rgba(255, 36, 0, 0.2)',
        'btn-danger-hover': 'rgba(255, 36, 0, 0.4)',
        'geek-title': 'var(--geek-title)',
        'geek-label': 'var(--geek-label)',
        'geek-value': 'var(--geek-value)',
        'geek-online': 'var(--geek-online)',
        'slot-empty': 'var(--slot-empty)',
        'slot-date': 'var(--slot-date)',
        'slot-turns': 'var(--slot-turns)',
      },
      boxShadow: {
        'panel-glow': 'var(--panel-border-glow)',
        'panel-danger': 'var(--panel-danger-glow)',
        'voxel-panel': 'inset 0 0 20px rgba(0, 0, 0, 0.8), 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 5px rgba(255, 215, 0, 0.1)',
        'voxel-btn': 'inset 0px 0px 8px rgba(255, 215, 0, 0.2)',
        'voxel-btn-hover': 'inset 0px 0px 15px rgba(255, 215, 0, 0.6), 0 0 10px rgba(255, 215, 0, 0.4)',
        'voxel-btn-active': 'inset 0px 0px 20px rgba(255, 215, 0, 0.8)',
        'voxel-btn-primary': 'inset 0px 0px 8px rgba(34, 139, 34, 0.3)',
        'voxel-btn-primary-hover': 'inset 0px 0px 15px rgba(34, 139, 34, 0.8), 0 0 10px rgba(34, 139, 34, 0.5)',
        'voxel-btn-danger': 'inset 0px 0px 8px rgba(255, 36, 0, 0.2)',
        'voxel-btn-danger-hover': 'inset 0px 0px 15px rgba(255, 36, 0, 0.6), 0 0 10px rgba(255, 36, 0, 0.4)',
      },
      textShadow: {
        'voxel': '1px 1px 2px rgba(0, 0, 0, 0.8)',
        'voxel-btn': '1px 1px 2px rgba(255, 215, 0, 0.5)',
        'voxel-title': '0 0 10px rgba(255, 215, 0, 0.5), 0 0 20px rgba(255, 215, 0, 0.3)',
      }
    },
  },
  plugins: [
    function ({ addUtilities, theme }) {
      const newUtilities = {
        '.text-shadow-voxel': {
          textShadow: theme('textShadow.voxel'),
        },
        '.text-shadow-voxel-btn': {
          textShadow: theme('textShadow.voxel-btn'),
        },
        '.text-shadow-voxel-title': {
          textShadow: theme('textShadow.voxel-title'),
        },
      };
      addUtilities(newUtilities);
    },
  ],
};
