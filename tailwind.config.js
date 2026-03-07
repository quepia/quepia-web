/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './lib/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                'quepia-purple': 'var(--quepia-purple)',
                'quepia-cyan': 'var(--quepia-cyan)',
                'quepia-dark': 'var(--quepia-dark)',
                'quepia-gray': 'var(--quepia-gray)',
                'quepia-magenta': 'var(--quepia-magenta)',
            },
            fontFamily: {
                sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                display: ['var(--font-display)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
