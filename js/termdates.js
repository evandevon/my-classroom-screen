// Government school term dates (first and last student day) by region, 2026–2027.
// Sources: each state/territory education department and the NZ Ministry of Education,
// checked November 2026. Teachers can edit them in the Calendar settings.

const T = (...pairs) => pairs.map(([start, end]) => ({ start, end }));

export const REGIONS = {
  nsw: {
    label: 'New South Wales (public schools, Eastern Division)',
    short: 'NSW',
    terms: T(['2026-02-02', '2026-04-02'], ['2026-04-22', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-17'],
      ['2027-02-03', '2027-04-09'], ['2027-04-29', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-11', '2027-12-17']),
  },
  act: {
    label: 'Australian Capital Territory (public schools)',
    short: 'ACT',
    terms: T(['2026-02-02', '2026-04-02'], ['2026-04-21', '2026-07-03'], ['2026-07-21', '2026-09-25'], ['2026-10-13', '2026-12-18'],
      ['2027-02-02', '2027-04-09'], ['2027-04-28', '2027-07-02'], ['2027-07-20', '2027-09-24'], ['2027-10-12', '2027-12-17']),
  },
  vic: {
    label: 'Victoria (government schools)',
    short: 'VIC',
    terms: T(['2026-01-28', '2026-04-02'], ['2026-04-20', '2026-06-26'], ['2026-07-13', '2026-09-18'], ['2026-10-05', '2026-12-18'],
      ['2027-01-28', '2027-03-25'], ['2027-04-12', '2027-06-25'], ['2027-07-12', '2027-09-17'], ['2027-10-04', '2027-12-17']),
  },
  qld: {
    label: 'Queensland (state schools)',
    short: 'QLD',
    terms: T(['2026-01-27', '2026-04-02'], ['2026-04-20', '2026-06-26'], ['2026-07-13', '2026-09-18'], ['2026-10-06', '2026-12-11'],
      ['2027-01-27', '2027-03-25'], ['2027-04-12', '2027-06-25'], ['2027-07-12', '2027-09-17'], ['2027-10-05', '2027-12-10']),
  },
  sa: {
    label: 'South Australia (public schools)',
    short: 'SA',
    terms: T(['2026-01-27', '2026-04-10'], ['2026-04-27', '2026-07-03'], ['2026-07-20', '2026-09-25'], ['2026-10-12', '2026-12-11'],
      ['2027-01-27', '2027-04-09'], ['2027-04-26', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-10']),
  },
  wa: {
    label: 'Western Australia (public schools)',
    short: 'WA',
    terms: T(['2026-02-02', '2026-04-02'], ['2026-04-20', '2026-07-03'], ['2026-07-20', '2026-09-25'], ['2026-10-12', '2026-12-17'],
      ['2027-02-01', '2027-04-09'], ['2027-04-27', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-16']),
  },
  tas: {
    label: 'Tasmania (government schools)',
    short: 'TAS',
    terms: T(['2026-02-05', '2026-04-17'], ['2026-05-04', '2026-07-10'], ['2026-07-27', '2026-10-02'], ['2026-10-19', '2026-12-18'],
      ['2027-02-04', '2027-04-09'], ['2027-04-26', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-16']),
  },
  nt: {
    label: 'Northern Territory (government schools)',
    short: 'NT',
    terms: T(['2026-01-28', '2026-04-02'], ['2026-04-13', '2026-06-19'], ['2026-07-13', '2026-09-18'], ['2026-10-05', '2026-12-11'],
      ['2027-01-27', '2027-04-02'], ['2027-04-12', '2027-06-18'], ['2027-07-12', '2027-09-17'], ['2027-10-04', '2027-12-10']),
  },
  nz: {
    label: 'New Zealand (state schools — Term 1 start and Term 4 end vary by school)',
    short: 'NZ',
    terms: T(['2026-02-02', '2026-04-02'], ['2026-04-20', '2026-07-03'], ['2026-07-20', '2026-09-25'], ['2026-10-12', '2026-12-18'],
      ['2027-02-01', '2027-04-09'], ['2027-04-27', '2027-07-02'], ['2027-07-19', '2027-09-24'], ['2027-10-11', '2027-12-17']),
  },
};

// Best guess from the device's time zone. NSW and the ACT share a time zone, so the ACT
// can't be told apart automatically (it can be chosen in settings).
const ZONES = {
  'Australia/Sydney': 'nsw', 'Australia/NSW': 'nsw', 'Australia/Broken_Hill': 'nsw', 'Australia/Lord_Howe': 'nsw',
  'Australia/Canberra': 'act', 'Australia/ACT': 'act',
  'Australia/Melbourne': 'vic', 'Australia/Victoria': 'vic',
  'Australia/Brisbane': 'qld', 'Australia/Lindeman': 'qld', 'Australia/Queensland': 'qld',
  'Australia/Adelaide': 'sa', 'Australia/South': 'sa',
  'Australia/Perth': 'wa', 'Australia/West': 'wa', 'Australia/Eucla': 'wa',
  'Australia/Hobart': 'tas', 'Australia/Tasmania': 'tas', 'Australia/Currie': 'tas',
  'Australia/Darwin': 'nt', 'Australia/North': 'nt',
  'Pacific/Auckland': 'nz', 'Pacific/Chatham': 'nz', 'NZ': 'nz',
};

export function detectRegion() {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch { /* ignore */ }
  return { region: ZONES[tz] || null, tz };
}

/** The region a widget should use: its own choice, or the time-zone guess. */
export function resolveRegion(choice) {
  if (choice && choice !== 'auto') return { region: choice, guessed: false };
  const { region, tz } = detectRegion();
  return { region, guessed: true, tz };
}
