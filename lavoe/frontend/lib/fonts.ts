import localFont from 'next/font/local'

export const ppEditorialNew = localFont({
  src: [
    {
      path: '../public/fonts/PPEditorialNew-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/PPEditorialNew-Ultralight.otf',
      weight: '200',
      style: 'normal',
    },
  ],
  variable: '--font-pp-editorial'
})
