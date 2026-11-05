# VexFlow 5.0.0

The unmodified `build/cjs/vexflow-bravura.js` bundle from the published
[`vexflow@5.0.0` package](https://registry.npmjs.org/vexflow/-/vexflow-5.0.0.tgz).
Upstream: <https://github.com/vexflow/vexflow>.

This browser bundle contains VexFlow and embedded Bravura, Academico regular,
and Academico bold fonts. It does not require a CDN or separate font download.
`LICENSE.txt` and `AUTHORS.md` are from the same package. The two font license
notices are from `vexflow/vexflow-fonts` revision
`b2bc3a6070225e4d395966b36de76c36a9429b1c`:

- [Bravura license](https://github.com/vexflow/vexflow-fonts/blob/b2bc3a6070225e4d395966b36de76c36a9429b1c/bravura/LICENSE.txt)
- [Academico license](https://github.com/vexflow/vexflow-fonts/blob/b2bc3a6070225e4d395966b36de76c36a9429b1c/academico/LICENSE.txt)

Bundle size: **728,171 bytes (711.1 KiB)** uncompressed, including embedded fonts.
The app loads it locally when Notation is first selected. Site packaging places
it under the same versioned runtime path as the app; no runtime CDN is used.
Source maps and the unused alternate bundles are not included.

SHA-256:

- Package: `fc37a629e3f9f19a6bb750e6d0f63fd671d82a2affd3cfbef9f65090de96fc14`
- Bundle: `2d4451bf31c877cf289cf173452b77a6b08e362e3cdf75a1136e485eed3c0f89`

To reproduce, run `npm pack vexflow@5.0.0 --pack-destination /tmp`, extract the
package in a temporary folder, and copy `build/cjs/vexflow-bravura.js`, `LICENSE`,
and `AUTHORS.md` into this folder. Retrieve the two font notices from the pinned
revision above. Verify these hashes before replacing the existing assets.
