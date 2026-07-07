// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlayoffInfo {
  roundName: string;
  gameNumber: number;
  seriesLabel: string;
  postSeriesLabel: string;
  winsAway: number;
  winsHome: number;
  isComplete: boolean;
  leader: string;
  isPlayIn: boolean;
}

export interface Game {
  GameID: number;
  Season: number;
  SeasonType: number;
  Status: string;
  Day: string;
  DateTime: string;
  AwayTeam: string;
  HomeTeam: string;
  AwayTeamID: number;
  HomeTeamID: number;
  AwayTeamScore: number;
  HomeTeamScore: number;
  Quarter: string | null;
  TimeRemainingMinutes: number | null;
  TimeRemainingSeconds: number | null;
  Attendance: number | null;
  Channel: string | null;
  PlayoffInfo?: PlayoffInfo;
}

export interface Standing {
  Season: number;
  TeamID: number;
  Key: string;
  City: string;
  Name: string;
  Conference: string;
  Division: string;
  Wins: number;
  Losses: number;
  Percentage: number;
  GamesBack: number;
  StreakDescription: string;
  PointsPerGameFor: number;
  PointsPerGameAgainst: number;
  HomeWins: number;
  HomeLosses: number;
  AwayWins: number;
  AwayLosses: number;
  LastTenWins: number;
  LastTenLosses: number;
  ConferenceRank: number;
}

export interface Player {
  PlayerID: number;
  FirstName: string;
  LastName: string;
  Team: string;
  TeamID: number;
  Position: string;
  Jersey: number;
  Height: number;
  Weight: number;
  BirthDate: string;
  BirthCity: string;
  BirthState: string;
  BirthCountry: string;
  College: string | null;
  Experience: number;
  Salary: number;
  Status: string;
  PhotoUrl: string;
  UsaTodayHeadshotUrl: string | null;
}

export interface PlayerStats {
  PlayerID: number;
  Name: string;
  Team: string;
  Position: string;
  Season: number;
  Games: number;
  Minutes: number;
  Points: number;
  Rebounds: number;
  Assists: number;
  Steals: number;
  BlockedShots: number;
  Turnovers: number;
  FieldGoalsPercentage: number;
  ThreePointersPercentage: number;
  FreeThrowsPercentage: number;
  TrueShootingPercentage: number;
  PlayerEfficiencyRating: number;
  UsageRatePercentage: number;
  PlusMinus: number;
  DoubleDoubles: number;
  TripleDoubles: number;
}

export interface BoxScore {
  Game: Game;
  HomeTeam: {
    Team: string;
    Players: PlayerGameStats[];
  };
  AwayTeam: {
    Team: string;
    Players: PlayerGameStats[];
  };
  PlayerGames: PlayerGameStats[];
}

export interface PlayerGameStats extends PlayerStats {
  GameID: number;
  Opponent: string;
  HomeOrAway: string;
  Day: string;
  Started: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

// On a real device change this to your machine's local IP e.g. http://192.168.1.x:5001
const API_BASE_URL = 'http://localhost:5001';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Unknown error');
  return json as T;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const NBAService = {
  // Games
  getGamesByDate: (date: string) =>
    apiFetch<{ games: Game[] }>(`/api/games?date=${date}`),

  getLiveGames: () =>
    apiFetch<{ games: Game[] }>('/api/games/live'),

  getGameById: (id: number) =>
    apiFetch<{ game: Game }>(`/api/games/${id}`),

  getBoxScore: (id: number, date?: string, away?: string, home?: string) => {
    const params = [date && `date=${date}`, away && `away=${away}`, home && `home=${home}`].filter(Boolean);
    return apiFetch<{ boxscore: BoxScore }>(`/api/games/${id}/boxscore${params.length ? '?' + params.join('&') : ''}`);
  },

  getPlayersByGame: (id: number) =>
    apiFetch<{ players: PlayerGameStats[] }>(`/api/games/${id}/players`),

  // Playoffs
  getPlayoffBracket: (season = 2025) =>
    apiFetch<{ rounds: any[]; playIn: any[]; totalSeries: number }>(`/api/games/playoffs/${season}`),

  // Standings
  getStandings: (season = 2025) =>
    apiFetch<{ standings: Standing[] }>(`/api/standings/${season}`),

  // Teams
  getAllTeams: () =>
    apiFetch<{ teams: any[] }>('/api/teams'),

  getTeamRoster: (team: string) =>
    apiFetch<{ players: Player[] }>(`/api/teams/${team}/roster`),

  getTeamSchedule: (team: string, season = 2025) =>
    apiFetch<{ games: Game[] }>(`/api/teams/${team}/schedule/${season}`),

  getTeamSeasonStats: (team: string, season = 2025) =>
    apiFetch<{ regular: any; playoffs: any; regularRanks: any; playoffRanks: any }>(`/api/teams/${team}/stats/${season}`),

  getTeamPlayerStats: (team: string, season = 2025) =>
    apiFetch<{ players: { player: any; stats: any }[] }>(`/api/teams/${team}/player-stats/${season}`),

  getLeagueTeamStats: (season = 2025, seasonType = 2) =>
    apiFetch<{ teams: { abbr: string; stats: any }[] }>(`/api/teams/league-stats/${season}/${seasonType}`),

  // Player ID map (SportsData → NbaDotCom)
  getNbaIdMap: () =>
    apiFetch<{ map: Record<number, number> }>('/api/players/nba-id-map'),

  // Players
  getPlayerById: (id: number) =>
    apiFetch<{ player: Player }>(`/api/players/${id}`),

  getPlayerSeasonStats: (id: number, season = 2025) =>
    apiFetch<{ stats: PlayerStats }>(`/api/players/${id}/stats/${season}`),

  getPlayerGameLogs: (id: number, season = 2025) =>
    apiFetch<{ logs: PlayerGameStats[] }>(`/api/players/${id}/gamelogs/${season}`),

  getPlayerCareerStats: (id: number) =>
    apiFetch<{ seasons: any[] }>(`/api/players/${id}/career`),

  getPlayerPlayoffStats: (id: number, season = 2025) =>
    apiFetch<{ stats: PlayerStats }>(`/api/players/${id}/playoff-stats/${season}`),

  getDraftClass: (year: number) =>
    apiFetch<{ picks: any[] }>(`/api/teams/draft/${year}`),

  getTeamSalaries: (team: string) =>
    apiFetch<{ players: any[]; totalSalary: number }>(`/api/teams/${team}/salaries`),

  getTeamDraftPicks: (team: string) =>
    apiFetch<{ picks: any[] }>(`/api/teams/${team}/draftpicks`),

  // Helpers
  formatDate: (dateStr: string): string => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },

  isLive: (game: Game): boolean =>
    game.Status === 'InProgress',

  isFinal: (game: Game): boolean =>
    game.Status === 'Final' || game.Status === 'F/OT' || game.Status === 'F/2OT' || game.Status === 'F/3OT',

  isScheduled: (game: Game): boolean =>
    game.Status === 'Scheduled',
};
