// SportsData.io uses team abbreviations like "LAL", "BOS", etc.
// Map abbreviation → full city + name
export const teamFullNames: Record<string, string> = {
  ATL: 'Atlanta Hawks',
  BOS: 'Boston Celtics',
  BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls',
  CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',
  DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',
  GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets',
  IND: 'Indiana Pacers',
  LAC: 'LA Clippers',
  LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',
  MIN: 'Minnesota Timberwolves',
  NOP: 'New Orleans Pelicans',
  NY:  'New York Knicks',
  OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',
  PHO: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SAC: 'Sacramento Kings',
  SA:  'San Antonio Spurs',
  TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz',
  WAS: 'Washington Wizards',
};

export const teamCities: Record<string, string> = {
  ATL: 'Atlanta',   BOS: 'Boston',    BKN: 'Brooklyn',
  CHA: 'Charlotte', CHI: 'Chicago',   CLE: 'Cleveland',
  DAL: 'Dallas',    DEN: 'Denver',    DET: 'Detroit',
  GSW: 'Golden State', HOU: 'Houston', IND: 'Indiana',
  LAC: 'LA',        LAL: 'Los Angeles', MEM: 'Memphis',
  MIA: 'Miami',     MIL: 'Milwaukee', MIN: 'Minnesota',
  NOP: 'New Orleans', NY: 'New York', OKC: 'Oklahoma City',
  ORL: 'Orlando',   PHI: 'Philadelphia', PHO: 'Phoenix',
  POR: 'Portland',  SAC: 'Sacramento', SA: 'San Antonio',
  TOR: 'Toronto',   UTA: 'Utah',      WAS: 'Washington',
};

export const teamNicknames: Record<string, string> = {
  ATL: 'Hawks',     BOS: 'Celtics',   BKN: 'Nets',
  CHA: 'Hornets',   CHI: 'Bulls',     CLE: 'Cavaliers',
  DAL: 'Mavericks', DEN: 'Nuggets',   DET: 'Pistons',
  GSW: 'Warriors',  HOU: 'Rockets',   IND: 'Pacers',
  LAC: 'Clippers',  LAL: 'Lakers',    MEM: 'Grizzlies',
  MIA: 'Heat',      MIL: 'Bucks',     MIN: 'Timberwolves',
  NOP: 'Pelicans',  NY:  'Knicks',    OKC: 'Thunder',
  ORL: 'Magic',     PHI: '76ers',     PHO: 'Suns',
  POR: 'Trail Blazers', SAC: 'Kings', SA:  'Spurs',
  TOR: 'Raptors',   UTA: 'Jazz',      WAS: 'Wizards',
};

// SportsData.io team logo URL
export function teamLogoUrl(abbrev: string): string {
  return `https://media.api-sports.io/basketball/teams/${abbrev}.png`;
}

// Primary team colors for accents
export const teamColors: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#FFFFFF',
  CHA: '#1D1160', CHI: '#CE1141', CLE: '#860038',
  DAL: '#00538C', DEN: '#0E2240', DET: '#C8102E',
  GSW: '#1D428A', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9',
  MIA: '#98002E', MIL: '#00471B', MIN: '#0C2340',
  NOP: '#0C2340', NY:  '#006BB6', OKC: '#007AC1',
  ORL: '#0077C0', PHI: '#006BB6', PHO: '#1D1160',
  POR: '#E03A3E', SAC: '#5A2D81', SA:  '#C4CED4',
  TOR: '#CE1141', UTA: '#002B5C', WAS: '#002B5C',
};
