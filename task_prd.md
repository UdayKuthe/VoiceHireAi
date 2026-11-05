# VoiceHire AI: Task PRD, Experience Extraction Bug Fixes

## 1. Problems (from screenshots)
- **P1, no experience, but a fake row:** The resume has no work experience, yet the UI shows one company named "Professional Experience" (a section heading). Total is 0 and a warning asks the recruiter to set the level. Expected: no rows, total 0 yrs, level Fresher automatically.
- **P2, one job split into two rows:** The resume has one job: "Cohyve", role "Frontend Developer Intern", "May 2025 – June 2025". The UI shows two rows. Row 1 is "• Cohyve May 2025 - June 2025" (bullet and dates inside the company name). Row 2 is "Frontend Developer Intern" (the role read as a company).
- **P3, years not calculated:** Both rows show 0 yrs and "Unparseable duration", because the dates were never separated into start/end and the date parser did not handle this format. Expected: about 0.17 yrs.
- **P4, total and level:** The summary stays at 0 and gives no derived level. Expected: the sum of all entries and an auto level badge.

## 2. Fixes: Extraction (Gemini, direct PDF)
- Update the experience schema and prompt:
  - `company`: employer name only. No bullets, dates, roles or section headings.
  - `role`: job title (extraction helper only. Stored, but not shown in the UI and not used downstream).
  - `startDate`, `endDate`, `isCurrent`, `durationText`: the date range printed next to or under the company goes here, never into `company`.
- Prompt rules:
  - One entry per employer or job position block.
  - A line in italics or under a company name is usually the role. It is not a company.
  - A section heading ("Experience", "Professional Experience", "Work Experience", "Employment") is never a company.
  - If the section has no entries, return `experience: []`.
  - Projects, education and certifications are never experience.
  - Use the examples as schema descriptions only. Do not put real sample content in the prompt.
- Server-side sanitization, applied after extraction and before saving:
  - Strip leading bullets/symbols and surrounding whitespace from `company`.
  - Remove any date range or duration text found inside `company`. If `startDate`/`endDate` are empty, move the removed text there.
  - Drop any entry whose company equals a section-heading phrase (case-insensitive list: experience, work experience, professional experience, employment, internship experience, work history).
  - Drop any entry with no company name, or an entry equal to another entry's `role` (a role read as a company). If its dates are empty, merge them into the matching entry.
  - Merge duplicate entries with the same company and the same dates.
  - Log removed or merged entries in `warnings`, server-side only.
- Retry once with the same prompt if validation fails (existing rule).

## 3. Fixes: Years Calculation (server-side)
- Parse dates case-insensitively, and accept:
  - Full and short month names: "May 2025", "June 2025", "Sept 2025"
  - Numeric forms: "05/2025", "2025-05"
  - Year only: "2025"
  - Separators: "-", "–", "—", "to"
  - Present markers: "Present", "Current", "Till date", "Ongoing", "Now"
- Month-based ranges: months = (end year − start year) × 12 + (end month − start month) + 1. Both end months count. A current job ends at today's month.
  - Example: May 2025 – June 2025 = 2 months = 0.17 yrs
- Year-only ranges: years = end − start. Add warning "Approximate: dates have no months". If both years are equal, leave the years empty with a warning.
- If dates are absent, parse `durationText` ("2 yrs 3 mos", "6 months").
- `years` = months / 12, rounded to 2 decimals.
- If nothing is parseable: years empty (not 0), and a warning on that row only.
- `totalYears` = sum of the entries' years, rounded to 2 decimals. Overlapping dates add a warning and do not change the sum.
- `experienceLevel`, derived from `totalYears` (thresholds unchanged): fresher under 1, junior 1 to under 3, mid 3 to under 6, senior 6+.
- No entries: `totalYears = 0`, `experienceLevel = fresher`, and no warning.
- Entries exist but none parseable: total 0, level fresher, with the row warnings only.
- The "set the experience level" banner appears only when the recruiter's manual action is truly needed (entries exist but none are parseable). Otherwise the level is derived automatically.
- Recompute on every extraction, edit, add or delete.

## 4. Fixes: UI (Resume Data tab, Experience section)
- Summary card:
  - Total years (2 decimals trimmed, e.g. "0.17 yrs", "2.5 yrs") and a level badge, always visible. With no experience: "Total: 0 yrs", badge "Fresher".
  - Level override dropdown: the "Auto (Derived)" option shows the derived level, e.g. "Auto (Derived): Fresher". An override persists and re-extraction clears it.
- Empty state: no rows, only "No work experience found in this resume." Never create a placeholder or heading-based row.
- Rows: company (editable text) and years (editable number, step 0.01). Add below each row a muted read-only caption with the parsed range and duration, e.g. "May 2025 – Jun 2025 · 2 months". Do not show role.
- Row warning badge only on rows that need attention.
- The recruiter can edit, add and delete rows. After any change the total and level refresh. Editing years sets `yearsEditedByRecruiter`.
- Show a "Re-extract" hint if old data looks wrong. Existing stored resumes need re-extraction (replace, not merge) to pick up these fixes.

## 5. Data Model Deltas
- Resume.data.experience[]: + role (hidden), durationMonths; `years` stored as a number or null
- Resume.data.experienceSummary: totalYears (2 decimals), experienceLevel (always set unless overridden), warnings[]
- Mapping, Interview and InterviewPlan copies of `experienceLevel` and `totalYears` are updated after recompute.

## 6. Acceptance Criteria
- Resume with no Experience section/entries: 0 rows, "Total: 0 yrs", level badge Fresher, no warning, no "Professional Experience" row.
- The Cohyve resume: exactly 1 row, company "Cohyve", years 0.17, caption "May 2025 – Jun 2025 · 2 months", total 0.17 yrs, level Fresher. No bullet, date or role text appears in the company name.
- Resume with 2+ jobs: one row each, and total equals their sum (e.g. 1.5 + 2 = 3.5 yrs, level Mid).
- A current job ends today's month and updates the total.
- Date formats from section 3 all parse (test each).
- An unparseable entry shows a row warning, with years empty, not 0.
- Editing years or deleting a row updates the total and level at once.
- Re-extraction fully replaces the experience data.
- Tested with at least 6 resumes: none, one job, 3+ jobs, a current job, year-only dates, and a role listed under the company in italics.

## 7. Constraints
- LLM-first with direct PDF input. No OCR, spaCy, SkillNER or keyword extraction. Sanitization and date parsing are plain code on the extracted JSON, not extraction.
- Do not change auth, scheduling, upload, project extraction, mapping logic or the Plan tab UI beyond consuming the corrected level.
- Edit existing code with minimal diffs; do not read unrelated files.