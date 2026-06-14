# Build-time fonts

These fonts are used **only at build time** by the per-article OG-image renderer
(`src/lib/og-image.ts`, via satori). They are NOT shipped to the browser and are
not referenced by any page CSS.

## NotoSansSC-Regular.ttf

- **Family:** Noto Sans SC (Simplified Chinese), Regular / weight 400
- **License:** SIL Open Font License 1.1 (OFL)
- **Upstream:** `https://github.com/google/fonts` → `ofl/notosanssc/NotoSansSC[wght].ttf`
  (the upstream is a 17.7 MB variable font covering all weights).
- **What's committed here is a derived, slimmed build** (~2.5 MB), produced so the
  repo doesn't carry the full 17.7 MB variable font:
  1. Instanced to a single static Regular weight:
     `fonttools varLib.instancer "NotoSansSC[wght].ttf" wght=400 -o NotoSansSC-Regular.full.ttf`
  2. Subset to GB2312 (7 445 common simplified hanzi + symbols) plus Latin,
     punctuation, currency, letterlike, enclosed-alphanumerics, CJK symbols &
     punctuation, enclosed-CJK, and half/fullwidth ranges:
     ```
     pyftsubset NotoSansSC-Regular.full.ttf \
       --text-file=gb2312.txt \
       --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2460-24FF,U+3000-303F,U+3200-32FF,U+FF00-FFEF" \
       --layout-features='*' --output-file=NotoSansSC-Regular.ttf
     ```

GB2312 covers essentially all modern Chinese prose, so post titles render fully.
**If a future title shows tofu (□) for a rare character outside GB2312**, regenerate
with a wider hanzi set (e.g. add `U+4E00-9FFF` to `--unicodes` for the full CJK
Unified Ideographs block — larger output) and re-commit.
