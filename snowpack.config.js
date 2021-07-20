module.exports = {
  mount: {
    _site: { url: '/', static: true },
    '_site/data': { url: '/data', static: true },
    'src/js': { url: '/js' },
    'src/css': { url: '/css' },
    'src/img': { url: '/img' },
  },
  plugins: [
    '@snowpack/plugin-postcss',
    [
      '@snowpack/plugin-run-script',
      {
        cmd: 'eleventy',
        watch: '$1 --watch',
      },
    ],
  ],
  packageOptions: {
    NODE_ENV: true,
  },
  buildOptions: {
    clean: false,
    out: 'dist',
  },
  devOptions: {
    open: 'none',
  },
  optimize: {
    bundle: true,
    minify: true,
    target: 'es2020',
  },
}
