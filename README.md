# Shiftwell swap-rules prototype (synthetic data; not a production compliance system)

## Folder
- `prototype/dist/index.html`: the finished, self-contained page (no server needed)
- `prototype/src/`: `engine.js` (rules), `scenarios.js` (policies + 25 fixed scenarios), `app.js`, `index.template.html`
- `prototype/test/`: engine tests and UI smoke tests (jsdom)
- `audit/`: `audit_numbers.py` recomputes every number from the brief
- `pdf/build_pdf.py`: builds the submission PDF (needs `pip install reportlab pypdf` and DejaVu fonts)

## Run locally
    cd prototype && npm install && npm test      # builds dist/index.html, then runs 53 tests
Open `prototype/dist/index.html` by double-clicking it.

## Publish (GitHub Pages)
1. github.com > New repository > name `shiftwell-rules-prototype` > Public > Create.
2. Add file > Upload files > upload `prototype/dist/index.html` (keep the name `index.html`, at the repository root) > Commit.
3. Settings > Pages > Source: Deploy from a branch > Branch `main`, folder `/ (root)` > Save.
4. Wait 1-3 minutes. The URL will be `https://<your-github-username>.github.io/shiftwell-rules-prototype/` (check the exact URL shown on the Pages screen).
Alternative: drag the `dist` folder onto app.netlify.com/drop.

## Test access before you submit
1. Open the URL in a private/incognito window while signed out of GitHub.
2. Open it on your phone using mobile data (not your home Wi-Fi).
3. Check the yellow "Synthetic data" banner appears, click **CP3** (should say BLOCKED), then **Run all scenarios** (should say 25 of 25 match).
4. Check light and dark mode, and a narrow window.
5. Send the working URL to me and I will rebuild the PDF with it; or paste it into the blank on page 4 yourself.
