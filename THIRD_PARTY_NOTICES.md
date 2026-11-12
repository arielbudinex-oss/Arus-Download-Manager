# Third-party notices

Arus memakai komponen berikut. Masing-masing tetap milik pemegang haknya.

## Aplikasi

- **Tauri** - MIT atau Apache-2.0 - https://github.com/tauri-apps/tauri
- **tokio** - MIT - https://github.com/tokio-rs/tokio
- **axum** - MIT - https://github.com/tokio-rs/axum
- **reqwest** - MIT atau Apache-2.0 - https://github.com/seanmonstar/reqwest
- **serde / serde_json** - MIT atau Apache-2.0 - https://github.com/serde-rs/serde
- **sha2** - MIT atau Apache-2.0 - https://github.com/RustCrypto/hashes
- **quick-xml** - MIT - https://github.com/tafia/quick-xml
- **rfd** - MIT - https://github.com/PolyMeilex/rfd
- **windows-sys** - MIT atau Apache-2.0 - https://github.com/microsoft/windows-rs

Daftar dependensi Rust lengkap, termasuk versi yang dipakai saat rilis, ada di `rust-native/Cargo.lock`.

## Website

- **qrcode-generator** oleh Kazuhiko Arase - MIT - https://github.com/kazuhikoarase/qrcode-generator
  Salinan ada di `site/vendor/qrcode.js` dan `public/vendor/qrcode.js` untuk QRIS di aplikasi.

### React Bits — site-specific motion adaptations

Copyright (c) 2026 David Haz. Source: https://github.com/DavidHDev/react-bits

Pinned revision: `9d9c687dc4f55b23539aa5417b703078047efa74`.

The screenshot-frame pointer presence and inner download-button spring in
`site/app.js` and `site/styles.css` adapt these exact source files:

- [`src/content/Components/SpotlightCard/SpotlightCard.jsx`](https://github.com/DavidHDev/react-bits/blob/9d9c687dc4f55b23539aa5417b703078047efa74/src/content/Components/SpotlightCard/SpotlightCard.jsx)
- [`src/content/Components/SpotlightCard/SpotlightCard.css`](https://github.com/DavidHDev/react-bits/blob/9d9c687dc4f55b23539aa5417b703078047efa74/src/content/Components/SpotlightCard/SpotlightCard.css)
- [`src/content/Animations/Magnet/Magnet.jsx`](https://github.com/DavidHDev/react-bits/blob/9d9c687dc4f55b23539aa5417b703078047efa74/src/content/Animations/Magnet/Magnet.jsx)

These are minimal vanilla-JavaScript adaptations incorporated into the Arus
website, not a standalone component distribution. React, GSAP, ambient effects,
noise, proximity fields and continuous gradient loops are not included. The
parallel-download explanation is original site code.

The upstream license is **MIT + Commons Clause License Condition v1.0**, not
unmodified MIT. It permits incorporation into an application, website or product,
including commercial use, but restricts sale, sublicensing and redistribution of
the components themselves, including ports. This notice applies to the adapted
React Bits portions only; it does **not** relicense Arus as a whole.

Exact text of [`LICENSE.md` at the pinned revision](https://github.com/DavidHDev/react-bits/blob/9d9c687dc4f55b23539aa5417b703078047efa74/LICENSE.md):

> MIT + Commons Clause License Condition v1.0
>
> Copyright (c) 2026 David Haz
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> ## Commons Clause Restriction
>
> You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**
>
> The same restriction covers the React Bits tools (Background Studio, Texture Lab, Shape Magic, Center Stage, Sound Lab and any tools added later) and the sounds in the sound library. **You may not sell, sublicense, or redistribute the tools or the sounds themselves, or offer the tools or a substantially similar copy of them as a hosted service-whether alone, in a bundle, or as a ported version.**
>
> What you make with the tools is yours to use. You can use exported code, images, videos, and audio files in any personal or commercial application, website, or product, including paid ones. **You may not sell or redistribute the exports on their own, either individually or as the product itself, such as a sound, texture, background, or template pack.**
>
> ## No Warranty
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Design research (guidance only; no bundled source):

- [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop/tree/502a0b0647448677391af3a94874de3e3d7d9c85), `antislop.md` and `skills/antislop-ui/SKILL.md`: intentional small palette, content-led composition, non-sterile restraint.
- [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy/tree/1482e8469b0a9e0d8cc18ea2740a01423d29ae80), `references/motion.md` and `references/craft.md`: time-based motion, one RAF per figure, stopping offscreen/settled, faithful explanation. The verified owner is `wheresryan22`, not `heresryan22`.

## Aset

Ikon Arus dibuat untuk proyek ini. Tangkapan layar di `site/assets/` berasal dari aplikasi Arus.
