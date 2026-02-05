# Block Buster Web (First-Party Only)

This dashboard is a zero-dependency, hand-rolled SPA. No React, no Vite, no npm installs required.

## Run

```bash
cd web
python -m http.server 4173  # or any static file server
# open http://localhost:4173
# landing logic:
#   - redirects to public/dashboard.html when markets are open
#   - redirects to public/network.html when governor gates are closed
```

## Edit

- UI logic: `src/main.js`
- Styles: `src/styles.css`
- HTML shell: `index.html`

## Notes

- Hash routing (`#/theblock` and `#/trading`) uses native DOM APIs.
- Charts are simple CSS bars; replace with canvas/SVG if you need richer visuals—keep it first-party.
- All assets are static; no build step or toolchain needed.
- Monitoring works without a license or wallet; trading flows expect a funded node wallet or a connected funded wallet.
