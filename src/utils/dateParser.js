const moment = require('moment');

const MONTH_MAP = {
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

/**
 * Parse a variety of date string formats into a JS Date object.
 * Supports:
 *   MM/YYYY, MM-YYYY, DD/MM/YYYY, DD-MM-YYYY
 *   "March 2026", "Mar 2026", "03/2026"
 *   "next year", "next month", "skip"
 */
function parseDate(input) {
  if (!input) return null;
  const raw = input.toString().trim().toLowerCase();

  if (raw === 'skip' || raw === 'no expiry' || raw === 'nahi') return null;

  // next month
  if (raw.includes('next month') || raw.includes('agle mahine')) {
    return moment().add(1, 'months').endOf('month').toDate();
  }
  // next year
  if (raw.includes('next year') || raw.includes('agle saal')) {
    return moment().add(1, 'years').endOf('month').toDate();
  }
  // this month
  if (raw.includes('this month') || raw.includes('is mahine')) {
    return moment().endOf('month').toDate();
  }

  // DD/MM/YYYY or DD-MM-YYYY
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return moment(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`, 'YYYY-MM-DD').toDate();
  }

  // MM/YYYY or MM-YYYY
  m = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return moment(`${m[2]}-${m[1].padStart(2,'0')}-01`, 'YYYY-MM-DD').endOf('month').toDate();
  }

  // "5 April 2026" or "05 Apr 26"  (DD Month YYYY)
  m = raw.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{2,4})$/);
  if (m) {
    const monthNum = MONTH_MAP[m[2]];
    if (monthNum) {
      let year = parseInt(m[3]);
      if (year < 100) year += 2000;
      return moment(`${year}-${String(monthNum).padStart(2,'0')}-${m[1].padStart(2,'0')}`, 'YYYY-MM-DD').toDate();
    }
  }

  // "March 2026" or "Mar 26"
  m = raw.match(/^([a-z]+)\s+(\d{2,4})$/);
  if (m) {
    const monthNum = MONTH_MAP[m[1]];
    if (monthNum) {
      let year = parseInt(m[2]);
      if (year < 100) year += 2000;
      return moment(`${year}-${String(monthNum).padStart(2,'0')}-01`, 'YYYY-MM-DD').endOf('month').toDate();
    }
  }

  // "2026-03"
  m = raw.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m) {
    return moment(`${m[1]}-${m[2].padStart(2,'0')}-01`, 'YYYY-MM-DD').endOf('month').toDate();
  }

  return null;
}

/**
 * Format a date for display
 */
function formatDate(date) {
  if (!date) return 'No Expiry';
  const m = moment(date);
  // If the day is the last day of its month, it was entered as month-only (MM/YYYY or Month YYYY)
  const isMonthOnly = m.date() === m.daysInMonth();
  return isMonthOnly ? m.format('MMM YYYY') : m.format('D MMM YYYY');
}

/**
 * Days remaining until date
 */
function daysUntil(date) {
  return moment(date).diff(moment().startOf('day'), 'days');
}

module.exports = { parseDate, formatDate, daysUntil };
