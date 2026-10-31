# CGPACalc

A free SGPA and CGPA calculator that runs entirely in your browser. I built it because every semester I found myself doing the same credits-times-points arithmetic in a spreadsheet, and I wanted something that just updates live as I type.

## What it does

- **Dynamic subjects and semesters** — add or remove subject rows and semesters freely. Each subject has an optional name, credits, and a grade.
- **Letter grades and grade points, kept in sync** — pick O, A+, A, B+, B, C, P, or F, or type grade points directly (0–10). Change one and the other follows.
- **Custom grade scale** — if your university scores letters differently, edit the points per letter and every calculation updates.
- **SGPA and CGPA, live** — SGPA is sum(credits × points) / sum(credits) per semester; CGPA is the credit-weighted average across semesters.
- **Percentage conversion** — SGPA × factor, default 9.5, editable. Labelled as an estimate on purpose (see limitations).
- **What-if planner** — enter a target CGPA and your remaining credits and it tells you the average grade points you need, or honestly flags the target as unreachable.
- **Grade distribution** — counted credits grouped by grade.
- **Result card** — a printable, downloadable PNG summary of your CGPA, percentage, and per-semester SGPA, drawn locally on canvas.
- **Save, import, export** — your data saves automatically in your browser (localStorage). Export JSON for a backup, import it on another device. Press Enter inside a subject row to add a new row.

## How to run it

No build step, no server. Open `index.html` in any modern browser, or serve the folder with any static server:

```bash
npx serve .
```

## Honest limitations

- **Grade scales differ by university.** The default 10-point scale (O=10, A+=9, A=8, B+=7, B=6, C=5, P=4, F=0) is common in India but not universal. Use the custom scale editor if yours differs.
- **Percentage formulas differ too.** The 9.5 factor is widely used but many universities publish their own conversion. Treat the percentage as an estimate and verify against your institution's rules.
- **Failed subjects:** an F counts 0 points and its credits still count in the denominator (SGPA over attempted credits), the standard rule most universities follow. Some institutions exclude failed credits instead — if yours does, remove the failed row to model that.
- **Local only:** there is no account and no sync. Clearing browser storage removes saved data, so export JSON if it matters.
- **Rounding:** displayed values are rounded to two decimals; the calculation itself keeps full precision.

## Privacy

Your grades are processed locally in your browser and never uploaded. There is no backend, no analytics, and no tracking.

## Tech

Vanilla JavaScript (ES modules), zero dependencies, zero CDN libraries. The grade math lives in `js/grades.js` with no DOM dependency, so it can be tested directly in Node.

## License

MIT — see [LICENSE](LICENSE).
