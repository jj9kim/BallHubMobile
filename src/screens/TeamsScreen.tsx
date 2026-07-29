import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Image, ActivityIndicator, ScrollView,
  RefreshControl, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService, Standing, Game } from '../api/nbaService';
import { teamLogoUri, teamColors, teamFullNames } from '../utils/teamMappings';
import { PlayoffBracket } from '../components/PlayoffBracket';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Types ─────────────────────────────────────────────────────────────────────

// Show Playoffs tab mid-April through mid-June
// Playoffs tab always visible — bracket is useful year-round for looking back

type Tab = 'Overview' | 'Matches' | 'Playoffs' | 'Draft' | 'Stats';
type StandingsView = 'All' | 'Conference' | 'Division';

// ── Helpers ───────────────────────────────────────────────────────────────────

function TeamLogo({ abbrev, size = 26 }: { abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: teamColors[abbrev] ?? '#333', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: size * 0.32, fontWeight: '800' }}>{abbrev.slice(0, 3)}</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri: teamLogoUri(abbrev) }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setFailed(true)} />
  );
}

function calcGB(leader: Standing, team: Standing): string {
  if (leader.TeamID === team.TeamID) return '—';
  const gb = ((leader.Wins - team.Wins) + (team.Losses - leader.Losses)) / 2;
  return gb <= 0 ? '—' : gb % 1 === 0 ? String(gb) : gb.toFixed(1);
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayYMD() { return toYMD(new Date()); }

// ── Tab Bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const TABS: Tab[] = ['Overview', 'Matches', 'Playoffs', 'Stats', 'Draft'];
  return (
    <View style={s.tabBar}>
      {TABS.map(t => (
        <TouchableOpacity key={t} style={s.tabBtn} onPress={() => onChange(t)}>
          <Text style={[s.tabLabel, active === t && s.tabLabelActive]}>{t}</Text>
          {active === t && <View style={s.tabUnderline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Shared Standings Table ────────────────────────────────────────────────────

const STAT_COLS = ['W', 'L', 'PCT', 'GB', 'L10', 'STK'];

function StandingsSection({ teams, title }: { teams: Standing[]; title?: string }) {
  const navigation = useNavigation<Nav>();
  const leader = teams[0];
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={s.tableRow}>
        <Text style={[s.hCell, { width: 24 }]}>#</Text>
        <Text style={[s.hCell, s.teamCol]}>Team</Text>
        {STAT_COLS.map(c => <Text key={c} style={s.hCell}>{c}</Text>)}
      </View>
      {teams.map((team, idx) => {
        const streak = team.StreakDescription ?? '';
        return (
          <TouchableOpacity
            key={team.TeamID}
            style={[s.tableRow, idx % 2 === 1 && s.rowAlt]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('TeamProfile', { teamKey: team.Key, teamCity: team.City, teamName: team.Name })}
          >
            <Text style={[s.cell, { width: 24, color: '#555', fontWeight: '700' }]}>{idx + 1}</Text>
            <View style={[s.cell, s.teamCol, { flexDirection: 'row', alignItems: 'center', gap: 7 }]}>
              <TeamLogo abbrev={team.Key} size={22} />
              <View>
                <Text style={s.teamCity} numberOfLines={1}>{team.City}</Text>
                <Text style={s.teamName} numberOfLines={1}>{team.Name}</Text>
              </View>
            </View>
            <Text style={s.cell}>{team.Wins}</Text>
            <Text style={s.cell}>{team.Losses}</Text>
            <Text style={s.cell}>{team.Percentage.toFixed(3)}</Text>
            <Text style={s.cell}>{calcGB(leader, team)}</Text>
            <Text style={s.cell}>{team.LastTenWins}-{team.LastTenLosses}</Text>
            <View style={[s.cell, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: streak.startsWith('W') ? '#fff' : '#333' }} />
              <Text style={{ color: '#888', fontSize: 11 }}>{streak.replace(/^[WL]/, '')}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

const DIVISION_ORDER = ['Atlantic','Central','Southeast','Northwest','Pacific','Southwest'];

function OverviewTab({ standings }: { standings: Standing[] }) {
  const [view, setView] = useState<StandingsView>('All');
  const sorted = [...standings].sort((a, b) => b.Percentage - a.Percentage);
  const east   = sorted.filter(t => t.Conference === 'East' || t.Conference === 'Eastern');
  const west   = sorted.filter(t => t.Conference === 'West' || t.Conference === 'Western');

  const byDiv: Record<string, Standing[]> = {};
  standings.forEach(t => {
    if (!byDiv[t.Division]) byDiv[t.Division] = [];
    byDiv[t.Division].push(t);
  });
  DIVISION_ORDER.forEach(d => { if (byDiv[d]) byDiv[d].sort((a, b) => b.Percentage - a.Percentage); });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.filterRow}>
        {(['All', 'Conference', 'Division'] as StandingsView[]).map(v => (
          <TouchableOpacity key={v} style={[s.chip, view === v && s.chipActive]} onPress={() => setView(v)}>
            <Text style={[s.chipText, view === v && s.chipTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'All' && <StandingsSection teams={sorted} />}

      {view === 'Conference' && (
        <>
          <StandingsSection teams={east} title="Eastern Conference" />
          <StandingsSection teams={west} title="Western Conference" />
        </>
      )}

      {view === 'Division' && DIVISION_ORDER.filter(d => byDiv[d]).map(div => (
        <StandingsSection key={div} teams={byDiv[div]} title={div} />
      ))}
    </ScrollView>
  );
}

// ── Matches Tab ───────────────────────────────────────────────────────────────

function GameRow({ game }: { game: Game }) {
  const isFinal     = NBAService.isFinal(game);
  const isLive      = NBAService.isLive(game);
  const isScheduled = NBAService.isScheduled(game);
  const awayWon     = isFinal && game.AwayTeamScore > game.HomeTeamScore;
  const homeWon     = isFinal && game.HomeTeamScore > game.AwayTeamScore;

  const time = isScheduled && game.DateTime
    ? new Date(game.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : isFinal ? 'Final'
    : isLive ? `Q${game.Quarter} ${game.TimeRemainingMinutes}:${String(game.TimeRemainingSeconds ?? 0).padStart(2,'0')}`
    : 'TBD';

  return (
    <View style={s.gameRow}>
      {/* Away */}
      <View style={s.gameTeam}>
        <TeamLogo abbrev={game.AwayTeam} size={24} />
        <Text style={[s.gameTeamName, !awayWon && isFinal && s.loser]}>{game.AwayTeam}</Text>
        {!isScheduled && <Text style={[s.gameScore, awayWon && s.winner]}>{game.AwayTeamScore}</Text>}
      </View>
      {/* Status */}
      <View style={s.gameStatus}>
        {isLive && <View style={s.liveDot} />}
        <Text style={[s.gameTime, isLive && s.liveText]}>{time}</Text>
      </View>
      {/* Home */}
      <View style={[s.gameTeam, { flexDirection: 'row-reverse' }]}>
        <TeamLogo abbrev={game.HomeTeam} size={24} />
        <Text style={[s.gameTeamName, !homeWon && isFinal && s.loser]}>{game.HomeTeam}</Text>
        {!isScheduled && <Text style={[s.gameScore, homeWon && s.winner]}>{game.HomeTeamScore}</Text>}
      </View>
    </View>
  );
}

function MatchesTab({ standings }: { standings: Standing[] }) {
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [games, setGames]   = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGames = useCallback(async (date: string) => {
    try {
      setLoading(true);
      const res = await NBAService.getGamesByDate(date);
      setGames((res.games ?? []).filter((g: Game) => g.Status !== 'NotNecessary'));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadGames(selectedDate); }, [selectedDate]);

  // Build a simple 7-day strip centred on today
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 3 + i);
    return toYMD(d);
  });

  function dayLabel(ymd: string) {
    const diff = Math.round((new Date(ymd).setHours(12) - new Date(todayYMD()).setHours(12)) / 86400000);
    if (diff === 0)  return 'Today';
    if (diff === -1) return 'Yest';
    if (diff === 1)  return 'Tom';
    return new Date(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Date strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateStrip} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
        {days.map(d => (
          <TouchableOpacity key={d} style={[s.dateChip, d === selectedDate && s.dateChipActive]} onPress={() => setSelectedDate(d)}>
            <Text style={[s.dateChipText, d === selectedDate && s.dateChipTextActive]} numberOfLines={1}>{dayLabel(d)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : games.length === 0 ? (
        <View style={s.centered}><Text style={s.empty}>No games</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGames(selectedDate); }} tintColor="#fff" />}
        >
          {games.map(g => <GameRow key={g.GameID} game={g} />)}
        </ScrollView>
      )}
    </View>
  );
}

// ── Draft Tab ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
// NBA Draft happens late June — only include current year after July 1
const LATEST_DRAFT = new Date().getMonth() >= 6 ? CURRENT_YEAR : CURRENT_YEAR - 1;
const DRAFT_YEARS = Array.from({ length: LATEST_DRAFT - 2000 }, (_, i) => LATEST_DRAFT - i);

function DraftTab() {
  const navigation = useNavigation<Nav>();
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {DRAFT_YEARS.map((year, i) => (
        <TouchableOpacity
          key={year}
          style={[d.yearRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#1e1e1e' }]}
          onPress={() => navigation.navigate('Draft', { year })}
          activeOpacity={0.7}
        >
          <Text style={d.yearRowTitle}>{year} NBA Entry Draft</Text>
          <Text style={d.yearRowChevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── League Stats Tab ──────────────────────────────────────────────────────────

const LEAGUE_STAT_CATEGORIES = [
  { key: 'PTS',     label: 'Points',         lowerBetter: false },
  { key: 'OPP_PTS', label: 'Points Allowed', lowerBetter: true  },
  { key: 'REB',     label: 'Rebounds',       lowerBetter: false },
  { key: 'AST',     label: 'Assists',        lowerBetter: false },
  { key: 'TOV',     label: 'Turnovers',      lowerBetter: true  },
  { key: 'STL',     label: 'Steals',         lowerBetter: false },
  { key: 'BLK',     label: 'Blocks',         lowerBetter: false },
  { key: 'FGPct',   label: 'FG%',            lowerBetter: false },
  { key: 'TPPct',   label: '3P%',            lowerBetter: false },
  { key: 'FTPct',   label: 'FT%',            lowerBetter: false },
];
const SEASONS_LIST = [2025,2024,2023,2022,2021,2020,2019,2018,2017,2016];

function LeagueStatsTab() {
  const navigation = useNavigation<Nav>();
  const [teams, setTeams]           = useState<{ abbr: string; stats: any }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [seasonType, setSeasonType] = useState(2);
  const [season, setSeason]         = useState(2025);
  const [showPicker, setShowPicker] = useState(false);
  const [viewAll, setViewAll]       = useState<{ label: string; teams: { abbr: string; val: string }[] } | null>(null);

  useEffect(() => {
    setLoading(true);
    setTeams([]);
    NBAService.getLeagueTeamStats(season, seasonType)
      .then(res => setTeams(res.teams ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [season, seasonType]);

  const fmt = (v: number, key: string) => {
    if (v == null) return '—';
    return key.includes('Pct') ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
  };

  const navigateTeam = (abbr: string) => navigation.navigate('TeamProfile', {
    teamKey: abbr,
    teamCity: teamFullNames[abbr]?.split(' ').slice(0, -1).join(' ') ?? abbr,
    teamName: teamFullNames[abbr]?.split(' ').slice(-1)[0] ?? abbr,
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Controls */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        <TouchableOpacity onPress={() => setShowPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e1e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a2a' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{season}-{String(season+1).slice(2)}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 11 }}>▼</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSeasonType(t => t === 2 ? 3 : 2)}
          style={{ backgroundColor: '#1e1e1e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: seasonType === 3 ? '#6ee7b7' : '#2a2a2a' }}>
          <Text style={{ color: seasonType === 3 ? '#6ee7b7' : '#aaa', fontWeight: '600', fontSize: 13 }}>
            {seasonType === 2 ? 'Regular Season' : 'Playoffs'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Season picker modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#141414' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>Select Season</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={{ padding: 8 }}>
              <Text style={{ color: '#6ee7b7', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {SEASONS_LIST.map(yr => (
              <TouchableOpacity key={yr} onPress={() => { setSeason(yr); setShowPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' }}>
                <Text style={{ color: season === yr ? '#6ee7b7' : '#fff', fontSize: 16, fontWeight: season === yr ? '700' : '400' }}>
                  {yr}-{String(yr+1).slice(2)}
                </Text>
                {season === yr && <Text style={{ color: '#6ee7b7' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* View All modal */}
      <Modal visible={!!viewAll} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewAll(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#141414' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>{viewAll?.label}</Text>
            <TouchableOpacity onPress={() => setViewAll(null)} style={{ padding: 8 }}>
              <Text style={{ color: '#6ee7b7', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {viewAll?.teams.map(({ abbr, val }, i) => (
              <TouchableOpacity key={abbr} onPress={() => { setViewAll(null); navigateTeam(abbr); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e', gap: 12 }}>
                <Text style={{ color: '#444', fontSize: 12, fontWeight: '700', width: 24, textAlign: 'right' }}>{i+1}</Text>
                <TeamLogo abbrev={abbr} size={28} />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }}>{teamFullNames[abbr] ?? abbr}</Text>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{val}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Stat cards */}
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
          {LEAGUE_STAT_CATEGORIES.map(cat => {
            const sorted = [...teams]
              .filter(t => t.stats?.[cat.key] != null)
              .sort((a, b) => cat.lowerBetter
                ? a.stats[cat.key] - b.stats[cat.key]
                : b.stats[cat.key] - a.stats[cat.key]);
            const top5 = sorted.slice(0, 5);
            const allTeams = sorted.map(t => ({ abbr: t.abbr, val: fmt(t.stats[cat.key], cat.key) }));

            return (
              <View key={cat.key} style={{ backgroundColor: '#1e1e1e', borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
                <Text style={{ color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.label}</Text>
                <View style={{ marginTop: 10 }}>
                  {top5.map(({ abbr, stats }, i) => (
                    <TouchableOpacity key={abbr} onPress={() => navigateTeam(abbr)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2a2a2a', gap: 10 }}>
                      <Text style={{ color: '#444', fontSize: 11, fontWeight: '700', width: 16, textAlign: 'right' }}>{i+1}</Text>
                      <TeamLogo abbrev={abbr} size={24} />
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{teamFullNames[abbr] ?? abbr}</Text>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{fmt(stats[cat.key], cat.key)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {sorted.length > 5 && (
                  <TouchableOpacity onPress={() => setViewAll({ label: cat.label, teams: allTeams })}
                    style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a', alignItems: 'center' }}>
                    <Text style={{ color: '#6ee7b7', fontSize: 13, fontWeight: '600' }}>View All ({sorted.length})</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ── Playoffs Tab ──────────────────────────────────────────────────────────────

// Play-in started in 2020-21 season (season param = 2020)
const PLAYOFF_SEASONS = [2025,2024,2023,2022,2021,2020,2019,2018,2017,2016];

function PlayoffsTab() {
  const [season, setSeason]       = useState(2025);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      {/* Season picker button */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e1e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2a2a2a', alignSelf: 'flex-start' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{season}-{String(season+1).slice(2)}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 11 }}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Season picker modal */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#141414' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>Select Season</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={{ padding: 8 }}>
              <Text style={{ color: '#6ee7b7', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {PLAYOFF_SEASONS.map(yr => (
              <TouchableOpacity
                key={yr}
                onPress={() => { setSeason(yr); setShowPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' }}
              >
                <Text style={{ color: season === yr ? '#6ee7b7' : '#fff', fontSize: 16, fontWeight: season === yr ? '700' : '400' }}>
                  {yr}-{String(yr+1).slice(2)}
                </Text>
                {season === yr && <Text style={{ color: '#6ee7b7' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <PlayoffBracket season={season} />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TeamsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    NBAService.getStandings()
      .then(res => { setStandings(res.standings ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Teams</Text>
      </View>
      <TabBar active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === 'Overview'  && <OverviewTab standings={standings} />}
          {activeTab === 'Matches'   && <MatchesTab  standings={standings} />}
          {activeTab === 'Playoffs'  && <PlayoffsTab />}
          {activeTab === 'Stats'     && <LeagueStatsTab />}
          {activeTab === 'Draft'     && <DraftTab />}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const COL_W = 36;

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#141414' },
  header:           { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:            { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:            { color: '#555', fontSize: 15 },

  // Tab bar
  tabBar:           { flexDirection: 'row', justifyContent: 'space-evenly', borderBottomWidth: 1, borderBottomColor: '#2a2a2a', backgroundColor: '#141414' },
  tabBtn:           { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel:         { color: '#555', fontSize: 12, fontWeight: '600' },
  tabLabelActive:   { color: '#fff' },
  tabUnderline:     { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#fff', borderRadius: 1 },

  // Filter chips
  filterRow:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip:             { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#242424' },
  chipActive:       { backgroundColor: '#fff' },
  chipText:         { color: '#777', fontSize: 12, fontWeight: '600' },
  chipTextActive:   { color: '#000' },

  // Standings table
  section:          { paddingHorizontal: 12, marginBottom: 20 },
  sectionTitle:     { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  tableRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  rowAlt:           { backgroundColor: '#191919' },
  hCell:            { width: COL_W, color: '#555', fontSize: 10, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },
  cell:             { width: COL_W, color: '#888', fontSize: 11, textAlign: 'center' },
  teamCol:          { flex: 1 },
  teamCity:         { color: '#777', fontSize: 10, fontWeight: '600' },
  teamName:         { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 1 },
  win:              { color: '#fff', fontWeight: '700' },
  loss:             { color: '#555' },
  winner:           { color: '#fff', fontWeight: '800' },
  loser:            { color: '#555' },

  // Matches
  dateStrip:        { maxHeight: 44, marginBottom: 8 },
  dateChip:         { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  dateChipActive:   { backgroundColor: '#fff' },
  dateChipText:     { color: '#777', fontSize: 12, fontWeight: '500' },
  dateChipTextActive:{ color: '#000', fontWeight: '700' },

  gameRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  gameTeam:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameTeamName:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  gameScore:        { color: '#888', fontSize: 18, fontWeight: '600', marginLeft: 'auto' },
  gameStatus:       { alignItems: 'center', paddingHorizontal: 8, gap: 3 },
  gameTime:         { color: '#666', fontSize: 11, fontWeight: '600' },
  liveText:         { color: '#4caf50', fontWeight: '700' },
  liveDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4caf50' },
});

const d = StyleSheet.create({
  yearRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 16, paddingVertical: 18 },
  yearRowTitle:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  yearRowChevron: { color: '#555', fontSize: 20, fontWeight: '300' },
});

