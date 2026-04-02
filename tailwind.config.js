/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      keyframes: {
        'in-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'in-slide-bottom': {
          from: { opacity: '0', transform: 'translateY(1rem)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'in-slide-right': {
          from: { opacity: '0', transform: 'translateX(-1rem)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        'in-slide-left': {
          from: { opacity: '0', transform: 'translateX(1rem)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        'in-slide-modal': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' }
        },
        'in-toast': {
          from: { opacity: '0', transform: 'translate(-50%, 0.625rem)' },
          to: { opacity: '1', transform: 'translate(-50%, 0)' }
        }
      },
      animation: {
        'in-fade': 'in-fade 0.5s ease-out forwards',
        'in-slide-bottom': 'in-slide-bottom 0.5s ease-out forwards',
        'in-slide-right': 'in-slide-right 0.5s ease-out forwards',
        'in-slide-left': 'in-slide-left 0.5s ease-out forwards',
        'in-slide-modal': 'in-slide-modal 0.3s ease-out forwards',
        'in-toast': 'in-toast 0.3s ease-out forwards'
      }
    }
  },
  plugins: []
};
