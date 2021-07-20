const fs = require('fs')

module.exports = function (config) {
  // Static assets to pass through
  // config.addPassthroughCopy('./src/fonts')
  config.addPassthroughCopy('./src/img')
  // config.addPassthroughCopy('./src/android-chrome-192x192.png')
  // config.addPassthroughCopy('./src/android-chrome-512x512.png')
  // config.addPassthroughCopy('./src/apple-touch-icon.png')
  // config.addPassthroughCopy('./src/favicon-16x16.png')
  // config.addPassthroughCopy('./src/favicon-32x32.png')
  config.addPassthroughCopy('./src/manifest.json')
  config.addPassthroughCopy('./src/robots.txt')
  config.addPassthroughCopy('./src/site.webmanifest')

  // 404
  config.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync('_site/404.html')

        browserSync.addMiddleware('*', (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404)
          res.end()
        })
      },
    },
  })

  return {
    dir: {
      input: 'src',
      data: `./_data/`,
      includes: `./_includes/`,
      layouts: `./_layouts/`,
    },
    passthroughFileCopy: true,
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  }
}
