# Typefaces

Two families, self-hosted. Nothing here is loaded from Google Fonts or any other
origin at runtime — the site's `Content-Security-Policy` is `default-src 'self'`
with no exceptions, and a webfont from a CDN would need one.

| File | Family | Axes | Used for |
|---|---|---|---|
| `newsreader-latin-var.woff2` | Newsreader | weight 300–700 | Titles, recipe names, every number that matters |
| `newsreader-latin-italic-var.woff2` | Newsreader Italic | weight 300–600 | The emphasised word inside a title |
| `karla-latin-var.woff2` | Karla | weight 300–700 | Interface text, labels, body copy |

Both are variable fonts carrying their whole weight range in one file, subset to
`latin`. Together they are about 310 KB, cached for a year and precached by the
service worker so the app still has its typography offline.

## Licence

Both families are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org), which permits bundling
and redistribution with a project of any licence, including this one's MIT.

- **Newsreader** — Production Type. <https://fonts.google.com/specimen/Newsreader>
- **Karla** — Jonny Pinhorn. <https://fonts.google.com/specimen/Karla>

The OFL requires that the fonts not be sold on their own and that any *modified*
version be renamed. These files are unmodified subsets, so neither applies here.

## Replacing them

Drop a new `.woff2` in, point the `@font-face` blocks at the top of
`css/app.css` at it, and update the `PRECACHE` list in `sw.js`. There is no build
step and no manifest to regenerate.
