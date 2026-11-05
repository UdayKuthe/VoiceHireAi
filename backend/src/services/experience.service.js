/**
 * Experience Calculation Service
 * Simplified: Extracts company and calculates years of experience.
 * Server-side sanitization, robust date parsing, inclusive end-month duration,
 * and 2-decimal precision.
 */

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const SHORT_MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const SECTION_HEADINGS = [
  'experience',
  'work experience',
  'professional experience',
  'employment',
  'employment history',
  'internship experience',
  'work history',
  'relevant experience',
  'career history',
  'previous experience',
  'internships',
  'industry experience'
];

const COMMON_ROLE_PATTERNS = [
  /\bdeveloper\b/i,
  /\bengineer\b/i,
  /\bintern\b/i,
  /\binternship\b/i,
  /\bmanager\b/i,
  /\banalyst\b/i,
  /\bdesigner\b/i,
  /\bconsultant\b/i,
  /\bspecialist\b/i,
  /\barchitect\b/i,
  /\blead\b/i,
  /\bdirector\b/i,
  /\bassociate\b/i,
  /\bresearcher\b/i,
  /\badministrator\b/i,
  /\bprogrammer\b/i,
  /\btrainee\b/i,
  /\bfellow\b/i,
  /\bassistant\b/i,
  /\bofficer\b/i,
  /\bcoordinator\b/i,
  /\bqa\b/i,
  /\bsde\b/i,
  /\bswe\b/i
];

export class ExperienceService {
  /**
   * Split a combined date range string into { startDate, endDate }
   */
  static splitDateRange(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    const match = trimmed.match(/^(.*?)(?:\s*(?:–|—|-|\bto\b|\buntil\b)\s*)(.+)$/i);
    if (match) {
      return {
        startDate: match[1].trim(),
        endDate: match[2].trim()
      };
    }
    return null;
  }

  /**
   * Parse a date string into { year, month, isYearOnly } (1-indexed month)
   */
  static parseDate(dateStr, isEndDate = false, isCurrent = false) {
    if (isCurrent) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() + 1, isYearOnly: false };
    }

    if (!dateStr || typeof dateStr !== 'string') {
      return null;
    }

    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    if (/^(present|current|now|till\s*date|ongoing)$/i.test(trimmed)) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() + 1, isYearOnly: false };
    }

    // Pattern 1: Month Name Year, e.g. "May 2025", "June 2025", "Sept 2025", "Sep 2025"
    const monthNameMatch = trimmed.match(/^([a-zA-Z]+)[,\s.-]+(\d{4})$/);
    if (monthNameMatch) {
      const mKey = monthNameMatch[1].toLowerCase();
      const month = MONTH_NAMES[mKey];
      const year = parseInt(monthNameMatch[2], 10);
      if (month && year > 1950 && year < 2100) {
        return { year, month, isYearOnly: false };
      }
    }

    // Pattern 2: Year Month Name, e.g. "2025 May", "2025-June"
    const yearMonthNameMatch = trimmed.match(/^(\d{4})[,\s.-]+([a-zA-Z]+)$/);
    if (yearMonthNameMatch) {
      const year = parseInt(yearMonthNameMatch[1], 10);
      const mKey = yearMonthNameMatch[2].toLowerCase();
      const month = MONTH_NAMES[mKey];
      if (month && year > 1950 && year < 2100) {
        return { year, month, isYearOnly: false };
      }
    }

    // Pattern 3: MM/YYYY or M/YYYY or MM-YYYY or M-YYYY, e.g. "05/2025", "5/2025"
    const mmYyyyMatch = trimmed.match(/^(\d{1,2})[/-](\d{4})$/);
    if (mmYyyyMatch) {
      const month = parseInt(mmYyyyMatch[1], 10);
      const year = parseInt(mmYyyyMatch[2], 10);
      if (month >= 1 && month <= 12 && year > 1950 && year < 2100) {
        return { year, month, isYearOnly: false };
      }
    }

    // Pattern 4: YYYY-MM or YYYY/MM, e.g. "2025-05", "2025/05"
    const yyyyMmMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})$/);
    if (yyyyMmMatch) {
      const year = parseInt(yyyyMmMatch[1], 10);
      const month = parseInt(yyyyMmMatch[2], 10);
      if (month >= 1 && month <= 12 && year > 1950 && year < 2100) {
        return { year, month, isYearOnly: false };
      }
    }

    // Pattern 5: Bare Year "2025"
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      if (year > 1950 && year < 2100) {
        return { year, month: isEndDate ? 12 : 1, isYearOnly: true };
      }
    }

    return null;
  }

  /**
   * Parse explicit duration text such as "2 yrs 3 mos", "1.5 years", "6 months"
   */
  static parseDurationText(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return null;

    let totalMonths = 0;
    let matched = false;

    const yrMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:yrs?|years?)/i);
    if (yrMatch) {
      const yrs = parseFloat(yrMatch[1]);
      if (!isNaN(yrs)) {
        totalMonths += Math.round(yrs * 12);
        matched = true;
      }
    }

    const moMatch = trimmed.match(/(\d+)\s*(?:mos?|months?)/i);
    if (moMatch) {
      const mos = parseInt(moMatch[1], 10);
      if (!isNaN(mos)) {
        totalMonths += mos;
        matched = true;
      }
    }

    if (!matched) {
      const bareMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
      if (bareMatch) {
        const yrs = parseFloat(bareMatch[1]);
        if (!isNaN(yrs)) {
          totalMonths = Math.round(yrs * 12);
          matched = true;
        }
      }
    }

    return matched ? totalMonths : null;
  }

  /**
   * Calculate duration from start and end dates with inclusive end-month count:
   * months = (end year - start year) * 12 + (end month - start month) + 1.
   * Both end months count. A current job ends at today's month.
   */
  static calculateDurationFromDates(startDateStr, endDateStr, isCurrent = false) {
    const isRoleCurrent = Boolean(
      isCurrent || /^(present|current|now|till\s*date|ongoing)$/i.test(endDateStr || '')
    );

    const start = this.parseDate(startDateStr, false, false);
    const end = this.parseDate(endDateStr, true, isRoleCurrent);

    if (!start || !end) {
      return {
        valid: false,
        months: 0,
        years: null,
        isYearOnly: false,
        warning: 'Unparseable dates',
        start,
        end
      };
    }

    // Year-only ranges
    if (start.isYearOnly || end.isYearOnly) {
      const diffYears = end.year - start.year;
      if (diffYears === 0) {
        return {
          valid: false,
          months: 0,
          years: null,
          isYearOnly: true,
          warning: 'Same year without months; duration indeterminate',
          start,
          end
        };
      }
      return {
        valid: true,
        months: diffYears * 12,
        years: diffYears,
        isYearOnly: true,
        warning: 'Approximate: dates have no months',
        start,
        end
      };
    }

    // Month-based ranges: both end months count
    let months = (end.year - start.year) * 12 + (end.month - start.month) + 1;
    if (months < 1) months = 1;
    const years = Math.round((months / 12) * 100) / 100;

    return {
      valid: true,
      months,
      years,
      isYearOnly: false,
      warning: '',
      start,
      end
    };
  }

  /**
   * Format a clean caption e.g. "May 2025 – Jun 2025 · 2 months"
   */
  static formatDurationCaption(startStr, endStr, isCurrent, months, isYearOnly, durationText) {
    const cleanStart = (startStr || '').trim();
    const cleanEnd = isCurrent ? 'Present' : (endStr || '').trim();

    if (cleanStart && cleanEnd) {
      if (isYearOnly) {
        const yrs = months ? Math.round(months / 12) : 0;
        return yrs > 0
          ? `${cleanStart} – ${cleanEnd} · ${yrs} year${yrs === 1 ? '' : 's'}`
          : `${cleanStart} – ${cleanEnd}`;
      }
      if (months > 0) {
        return `${cleanStart} – ${cleanEnd} · ${months} month${months === 1 ? '' : 's'}`;
      }
      return `${cleanStart} – ${cleanEnd}`;
    }

    if (durationText) {
      return durationText;
    }

    return '';
  }

  /**
   * Server-side Sanitization:
   * Cleans extracted experience entries before calculation and storage.
   * - Strips leading bullets/symbols from company name
   * - Extracts and strips dates/durations embedded inside company name
   * - Drops section headings read as companies
   * - Drops/merges orphan roles read as companies
   * - Merges duplicate entries
   */
  static sanitizeExtractedExperience(rawEntries = []) {
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const sanitizationWarnings = [];

    // Date range detector inside company string: matches "May 2025 - June 2025", "2021 - 2023", "05/2025 - Present", etc.
    const dateRangeRegex = /[\(\[]?\s*((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{2,4}|\d{1,2}[/-]\d{2,4}|[a-z]+\s+\d{4}|\d{4})\s*(?:–|—|-|\bto\b|\buntil\b)\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{2,4}|\d{1,2}[/-]\d{2,4}|[a-z]+\s+\d{4}|\d{4}|present|current|now|ongoing|till\s*date))\s*[\)\]]?/i;

    // Single duration text inside company string
    const durationRegex = /[\(\[]?\s*(\d+(?:\.\d+)?\s*(?:yrs?|years?|mos?|months?)(?:\s*(?:and\s*)?\d+\s*(?:mos?|months?))?)\s*[\)\]]?/i;

    const cleanedItems = [];

    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;

      let company = (item.company || '').trim();
      let role = (item.role || '').trim();
      let startDate = (item.startDate || '').trim();
      let endDate = (item.endDate || '').trim();
      let isCurrent = Boolean(item.isCurrent);
      let durationText = (item.durationText || '').trim();
      let yearsEditedByRecruiter = Boolean(item.yearsEditedByRecruiter);
      let years = typeof item.years === 'number' ? item.years : null;
      let sourceText = (item.sourceText || '').trim();
      let page = item.page || 0;

      // 1. Strip leading bullets, symbols, colons, or punctuation from company name
      company = company.replace(/^[\s•*\-–—·\u2022\u25cf\u25aa\u25e6\u2023\u2043\u2219\u25b8|:]+/, '').trim();

      // 2. Extract and remove date ranges found inside company name
      const dateRangeMatch = company.match(dateRangeRegex);
      if (dateRangeMatch) {
        const extractedRange = dateRangeMatch[1];
        company = company.replace(dateRangeMatch[0], '').trim();

        if (!startDate && !endDate) {
          const split = this.splitDateRange(extractedRange);
          if (split) {
            startDate = split.startDate;
            endDate = split.endDate;
            if (/^(present|current|now|till\s*date|ongoing)$/i.test(endDate)) {
              isCurrent = true;
            }
          } else {
            startDate = extractedRange;
          }
        }
      }

      // 3. Extract and remove duration text found inside company name
      const durationMatch = company.match(durationRegex);
      if (durationMatch) {
        if (!durationText) {
          durationText = durationMatch[1];
        }
        company = company.replace(durationMatch[0], '').trim();
      }

      // Strip dangling delimiters after removing dates
      company = company.replace(/^[()\[\],\-–—|:]+|[()\[\],\-–—|:]+$/g, '').trim();

      // If startDate contains a range and endDate is empty, split it
      if (startDate && !endDate) {
        const split = this.splitDateRange(startDate);
        if (split) {
          startDate = split.startDate;
          endDate = split.endDate;
          if (/^(present|current|now|till\s*date|ongoing)$/i.test(endDate)) {
            isCurrent = true;
          }
        }
      }

      // Check if role is combined in company (e.g. "Cohyve - Frontend Developer Intern")
      if (!role) {
        const roleSepMatch = company.match(/^(.*?)\s*[-–—,|]\s*(.+Developer.+|.+Engineer.+|.+Intern.+|.+Manager.+|.+Lead.+|.+Designer.+|.+Analyst.+)$/i);
        if (roleSepMatch) {
          company = roleSepMatch[1].trim();
          role = roleSepMatch[2].trim();
        }
      }

      cleanedItems.push({
        company,
        role,
        startDate,
        endDate,
        isCurrent,
        durationText,
        yearsEditedByRecruiter,
        years,
        sourceText,
        page
      });
    }

    // Filter section headings and orphan roles
    const sanitized = [];

    for (let i = 0; i < cleanedItems.length; i++) {
      const item = cleanedItems[i];
      const lowerComp = item.company.toLowerCase().replace(/^section:\s*/i, '').trim();

      // Drop section headings
      if (SECTION_HEADINGS.includes(lowerComp)) {
        sanitizationWarnings.push(`Dropped section heading read as company: "${item.company}"`);
        continue;
      }

      // Drop entries with empty company name
      if (!item.company) {
        sanitizationWarnings.push('Dropped entry with empty company name');
        continue;
      }

      // Check if this entry is an orphan role read as a company (e.g. "Frontend Developer Intern")
      const matchesAnyRole = sanitized.some(
        (prev) => prev.role && prev.role.toLowerCase() === lowerComp
      );
      const isRoleTitle = COMMON_ROLE_PATTERNS.some((pattern) => pattern.test(item.company));

      if (matchesAnyRole || (isRoleTitle && sanitized.length > 0 && !SECTION_HEADINGS.includes(sanitized[sanitized.length - 1].company.toLowerCase()))) {
        const prev = sanitized[sanitized.length - 1];
        if (!prev.role) {
          prev.role = item.company;
        }
        if (!prev.startDate && item.startDate) {
          prev.startDate = item.startDate;
        }
        if (!prev.endDate && item.endDate) {
          prev.endDate = item.endDate;
        }
        if (!prev.durationText && item.durationText) {
          prev.durationText = item.durationText;
        }
        sanitizationWarnings.push(`Merged role line "${item.company}" into employer "${prev.company}"`);
        continue;
      }

      // Check for duplicate company and dates
      const duplicateIdx = sanitized.findIndex(
        (prev) =>
          prev.company.toLowerCase() === lowerComp &&
          prev.startDate.toLowerCase() === item.startDate.toLowerCase() &&
          prev.endDate.toLowerCase() === item.endDate.toLowerCase()
      );

      if (duplicateIdx !== -1) {
        sanitizationWarnings.push(`Merged duplicate entry for company "${item.company}"`);
        continue;
      }

      sanitized.push(item);
    }

    return {
      sanitizedEntries: sanitized,
      sanitizationWarnings
    };
  }

  /**
   * Derive experience level from totalYears:
   * fresher: under 1
   * junior: 1 to under 3
   * mid: 3 to under 6
   * senior: 6 or more
   */
  static deriveExperienceLevel(totalYears) {
    if (typeof totalYears !== 'number' || isNaN(totalYears) || totalYears < 1.0) {
      return 'fresher';
    }
    if (totalYears < 3.0) {
      return 'junior';
    }
    if (totalYears < 6.0) {
      return 'mid';
    }
    return 'senior';
  }

  /**
   * Extracts required years of experience from JD
   */
  static extractJdRequiredYears(jdData) {
    if (!jdData) return null;

    const sources = [
      jdData.experience_requirements,
      ...(Array.isArray(jdData.qualifications) ? jdData.qualifications : []),
      ...(Array.isArray(jdData.responsibilities) ? jdData.responsibilities : [])
    ];

    for (const text of sources) {
      if (typeof text !== 'string') continue;
      const match = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:to\s*\d+\s*|-\s*\d+\s*)?years?/i);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val >= 0 && val <= 30) {
          return val;
        }
      }
    }

    return null;
  }

  /**
   * Computes JD experience gap: JD required years vs totalYears
   */
  static computeJdExperienceGap(totalYears, jdRequiredYears) {
    if (jdRequiredYears === null || jdRequiredYears === undefined) {
      return '';
    }

    const diff = Math.round((totalYears - jdRequiredYears) * 100) / 100;
    const sign = diff >= 0 ? `+${diff}` : `${diff}`;
    return `${sign} years (${totalYears} total vs ${jdRequiredYears} required)`;
  }

  /**
   * Computes complete experience summary and company years
   *
   * Rules:
   * 1. Per company, in order of preference:
   *    - startDate and endDate present: compute months with inclusive end month. Current role ends today.
   *    - durationText present: parse years and months.
   *    - else: years empty (null), warning on that row only.
   * 2. years = months / 12, rounded to 2 decimals.
   * 3. totalYears = sum of entries' years, rounded to 2 decimals.
   * 4. Overlapping dates produce warning and do not alter sum.
   * 5. No entries: totalYears = 0, level = fresher, no warnings.
   * 6. All entries unparseable: total = 0, level = fresher, warning for recruiter to set level.
   */
  static computeExperienceSummary({
    roles = [],
    jdData = null,
    existingSummary = null,
    skipSanitization = false
  }) {
    // Apply server-side sanitization unless explicitly skipped
    let cleanRoles = roles;
    let sanitizationWarnings = [];

    if (!skipSanitization) {
      const sanitized = this.sanitizeExtractedExperience(roles);
      cleanRoles = sanitized.sanitizedEntries;
      sanitizationWarnings = sanitized.sanitizationWarnings;
    }

    const warnings = [...sanitizationWarnings];
    const dateRanges = [];

    const enrichedEntries = cleanRoles.map((entry, idx) => {
      let years = typeof entry.years === 'number' ? entry.years : null;
      let durationMonths = typeof entry.durationMonths === 'number' ? entry.durationMonths : null;
      let warning = entry.warning || '';
      let isUnparseable = false;
      let caption = '';

      const isCurrent = Boolean(
        entry.isCurrent || /^(present|current|now|till\s*date|ongoing)$/i.test(entry.endDate || '')
      );

      // If recruiter previously edited years manually, keep it
      if (entry.yearsEditedByRecruiter && typeof entry.years === 'number') {
        years = Math.round(entry.years * 100) / 100;
        durationMonths = Math.round(years * 12);
        caption = this.formatDurationCaption(
          entry.startDate,
          entry.endDate,
          isCurrent,
          durationMonths,
          false,
          entry.durationText
        );
      } else {
        // Preference 1: compute from startDate and endDate
        if (entry.startDate && (entry.endDate || isCurrent)) {
          const dateResult = this.calculateDurationFromDates(entry.startDate, entry.endDate, isCurrent);
          if (dateResult.valid) {
            years = dateResult.years;
            durationMonths = dateResult.months;
            if (dateResult.warning) {
              warning = dateResult.warning;
            }
            caption = this.formatDurationCaption(
              entry.startDate,
              entry.endDate,
              isCurrent,
              durationMonths,
              dateResult.isYearOnly,
              entry.durationText
            );

            if (!dateResult.isYearOnly && dateResult.start && dateResult.end) {
              dateRanges.push({
                index: idx,
                company: entry.company,
                startIdx: dateResult.start.year * 12 + dateResult.start.month,
                endIdx: dateResult.end.year * 12 + dateResult.end.month
              });
            }
          } else {
            // Check Preference 2: durationText fallback
            const parsedMonths = this.parseDurationText(entry.durationText);
            if (parsedMonths !== null) {
              durationMonths = parsedMonths;
              years = Math.round((parsedMonths / 12) * 100) / 100;
              caption = this.formatDurationCaption('', '', false, durationMonths, false, entry.durationText);
            } else {
              years = null;
              durationMonths = null;
              warning = dateResult.warning || 'Unparseable duration or missing dates';
              isUnparseable = true;
            }
          }
        } else if (entry.durationText) {
          // Preference 2: parse from durationText
          const parsedMonths = this.parseDurationText(entry.durationText);
          if (parsedMonths !== null) {
            durationMonths = parsedMonths;
            years = Math.round((parsedMonths / 12) * 100) / 100;
            caption = this.formatDurationCaption('', '', false, durationMonths, false, entry.durationText);
          } else {
            years = null;
            durationMonths = null;
            warning = 'Unparseable duration';
            isUnparseable = true;
          }
        } else {
          // Preference 3: unparseable
          years = null;
          durationMonths = null;
          warning = 'Unparseable duration or missing dates';
          isUnparseable = true;
        }
      }

      if (isUnparseable && !warning) {
        warning = 'Unparseable duration or missing dates';
      }

      return {
        company: entry.company || '',
        role: entry.role || '',
        years,
        durationMonths,
        caption,
        startDate: entry.startDate || '',
        endDate: isCurrent ? 'Present' : (entry.endDate || ''),
        isCurrent,
        durationText: entry.durationText || '',
        yearsEditedByRecruiter: Boolean(entry.yearsEditedByRecruiter),
        warning,
        sourceText: entry.sourceText || '',
        page: entry.page || 0
      };
    });

    // Detect overlapping dates across entries with valid month ranges
    let hasOverlaps = false;
    for (let i = 0; i < dateRanges.length; i++) {
      for (let j = i + 1; j < dateRanges.length; j++) {
        const r1 = dateRanges[i];
        const r2 = dateRanges[j];
        if (r1.startIdx <= r2.endIdx && r2.startIdx <= r1.endIdx) {
          hasOverlaps = true;
          if (!enrichedEntries[r1.index].warning) {
            enrichedEntries[r1.index].warning = 'Overlapping dates';
          } else if (!enrichedEntries[r1.index].warning.includes('Overlapping dates')) {
            enrichedEntries[r1.index].warning += '; Overlapping dates';
          }
          if (!enrichedEntries[r2.index].warning) {
            enrichedEntries[r2.index].warning = 'Overlapping dates';
          } else if (!enrichedEntries[r2.index].warning.includes('Overlapping dates')) {
            enrichedEntries[r2.index].warning += '; Overlapping dates';
          }
        }
      }
    }

    if (hasOverlaps) {
      warnings.push('Overlapping dates detected across employment entries.');
    }

    // totalYears = sum of years across entries (rounded to 2 decimals)
    const totalYears = Math.round(
      enrichedEntries.reduce((sum, r) => sum + (typeof r.years === 'number' ? r.years : 0), 0) * 100
    ) / 100;

    // Check parseability across entries
    const hasAnyParseable = enrichedEntries.some((r) => typeof r.years === 'number');
    const allUnparseable = enrichedEntries.length > 0 && !hasAnyParseable;

    if (allUnparseable) {
      warnings.push('One or more entries have an unparseable duration. Please set the experience level.');
    }

    // Determine experienceLevel
    let experienceLevel = 'fresher';
    const isOverridden = Boolean(existingSummary?.levelOverriddenByRecruiter);

    if (isOverridden && existingSummary?.experienceLevel) {
      experienceLevel = existingSummary.experienceLevel;
    } else if (enrichedEntries.length === 0) {
      experienceLevel = 'fresher';
    } else if (allUnparseable) {
      experienceLevel = 'fresher'; // Default level fresher, with recruiter banner
    } else {
      experienceLevel = this.deriveExperienceLevel(totalYears);
    }

    // JD experience gap: JD required years vs totalYears
    const jdRequiredYears = this.extractJdRequiredYears(jdData);
    const jdExperienceGap = this.computeJdExperienceGap(totalYears, jdRequiredYears);

    const experienceSummary = {
      totalYears,
      experienceLevel,
      jdExperienceGap,
      levelOverriddenByRecruiter: isOverridden,
      warnings
    };

    return {
      enrichedRoles: enrichedEntries,
      experienceSummary
    };
  }
}

export default ExperienceService;
