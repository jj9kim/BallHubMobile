export interface NBATeamStats {
  team_id: number;
  team_abbreviation: string;
  team_name: string;
  wl?: string;
  pts: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  plus_minus: number;
}

export interface NBAGame {
  game_date: string;
  game_id: string;
  matchup: string;
  season_id: string;
  teams: NBATeamStats[];
  game_status?: string;
  game_time?: string;
  arena?: string;
}

export interface NBAAPIResponse {
  success: boolean;
  games: NBAGame[];
  count: number;
  error?: string;
}

export interface FutureGamesResponse {
  success: boolean;
  games: NBAGame[];
  count: number;
  days_checked: number;
  season_end?: string;
  error?: string;
}

export interface FullScheduleGame {
  leagueId: string;
  seasonYear: string;
  gameDate: string;
  gameId: string;
  gameCode: string;
  gameStatus: number;
  gameStatusText: string;
  gameSequence: number;
  gameDateEst: string;
  gameTimeEst: string;
  gameDateTimeEst: string;
  gameDateUTC: string;
  gameTimeUTC: string;
  gameDateTimeUTC: string;
  awayTeamTime: string;
  homeTeamTime: string;
  day: string;
  monthNum: number;
  weekNumber: number;
  weekName: string;
  ifNecessary: boolean;
  seriesGameNumber: number;
  gameLabel: string;
  gameSubLabel: string;
  seriesText: string;
  arenaName: string;
  arenaState: string;
  arenaCity: string;
  postponedStatus: string;
  branchLink: string;
  gameSubtype: string;
  isNeutral: boolean;
  homeTeam_teamId: number;
  homeTeam_teamName: string;
  homeTeam_teamCity: string;
  homeTeam_teamTricode: string;
  homeTeam_teamSlug: string;
  homeTeam_wins: number;
  homeTeam_losses: number;
  homeTeam_score: number;
  homeTeam_seed: number;
  awayTeam_teamId: number;
  awayTeam_teamName: string;
  awayTeam_teamCity: string;
  awayTeam_teamTricode: string;
  awayTeam_teamSlug: string;
  awayTeam_wins: number;
  awayTeam_losses: number;
  awayTeam_score: number;
  awayTeam_seed: number;
  is_home?: boolean;
}

export interface FullScheduleResponse {
  success: boolean;
  games: FullScheduleGame[];
  count: number;
  future_count: number;
  past_count: number;
  live_count?: number;
  fields: string[];
}

export interface TeamFullScheduleResponse {
  success: boolean;
  team_id: string;
  games: FullScheduleGame[];
  count: number;
  future_count: number;
  past_count: number;
  fields: string[];
}

// Update this to your backend's IP/URL when running on a device
const API_BASE_URL = 'http://127.0.0.1:5000';

export class NBAService {
  static async fetchGames(): Promise<NBAAPIResponse> {
    const response = await fetch(`${API_BASE_URL}/api/nba-games`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data: NBAAPIResponse = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch NBA games');
    return data;
  }

  static async fetchFutureGames(days: number = 180): Promise<FutureGamesResponse> {
    const response = await fetch(`${API_BASE_URL}/api/future-games?days=${days}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch future games');
    return data;
  }

  static async fetchAllGames(): Promise<{
    games: NBAGame[];
    pastCount: number;
    futureCount: number;
    totalCount: number;
  }> {
    const [pastGamesResponse, futureGamesResponse] = await Promise.all([
      this.fetchGames(),
      this.fetchFutureGames(180),
    ]);
    const allGames = [...pastGamesResponse.games, ...futureGamesResponse.games];
    const uniqueGames = Array.from(
      new Map(allGames.map((game) => [game.game_id, game])).values()
    );
    return {
      games: uniqueGames,
      pastCount: pastGamesResponse.games.length,
      futureCount: futureGamesResponse.games.length,
      totalCount: uniqueGames.length,
    };
  }

  static async fetchFullSchedule(): Promise<FullScheduleResponse> {
    const response = await fetch(`${API_BASE_URL}/api/full-schedule`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch full schedule');
    return data;
  }

  static async fetchTeamFullSchedule(teamId: number): Promise<TeamFullScheduleResponse> {
    const response = await fetch(`${API_BASE_URL}/api/team/${teamId}/full-schedule`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch team schedule');
    return data;
  }

  static isFutureGame(game: NBAGame): boolean {
    if (game.teams.length !== 2) return false;
    return game.teams[0].pts === 0 && game.teams[1].pts === 0;
  }

  static getGameStatus(game: NBAGame | FullScheduleGame): string {
    if ('gameStatus' in game) {
      switch (game.gameStatus) {
        case 1: return 'Scheduled';
        case 2: return 'Live';
        case 3: return 'Final';
        default: return game.gameStatusText || 'Unknown';
      }
    }
    if (this.isFutureGame(game)) return 'Scheduled';
    if (game.game_status) return game.game_status;
    return 'Final';
  }

  static getWinner(game: NBAGame): NBATeamStats | null {
    if (game.teams.length !== 2) return null;
    return game.teams[0].pts > game.teams[1].pts ? game.teams[0] : game.teams[1];
  }
}
