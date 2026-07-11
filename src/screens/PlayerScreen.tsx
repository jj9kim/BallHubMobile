import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  Image, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService, Player, PlayerStats, PlayerGameStats } from '../api/nbaService';
import { teamColors, teamLogoUri, teamFullNames } from '../utils/teamMappings';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerProfile'>;

type Tab = 'Stats' | 'Game Log';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHeight(inches: number): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

const MONTHS_PS: Record<string, number> = {
  JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
  JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
};
function calcAge(birthDate: string): string {
  if (!birthDate) return '—';
  let birth: Date;
  // 'APR 09, 1996' format
  const abbr = birthDate.match(/^([A-Z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (abbr) {
    const month = MONTHS_PS[abbr[1]];
    if (month === undefined) return '—';
    birth = new Date(parseInt(abbr[3]), month, parseInt(abbr[2]));
  } else {
    // ISO 'YYYY-MM-DD' — parse manually to avoid Hermes timezone shift
    const parts = birthDate.split('-').map(Number);
    if (parts.length === 3) birth = new Date(parts[0], parts[1] - 1, parts[2]);
    else return '—';
  }
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return String(age);
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return '—';
  return (val * 100).toFixed(1) + '%';
}

function fmtStat(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

// ── Player photo ──────────────────────────────────────────────────────────────

function PlayerPhoto({ player, size = 90 }: { player: Player; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = player.PhotoUrl;
  const color = teamColors[player.Team] ?? '#333';

  if (failed || !uri) {
    return (
      <View style={[ph.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        <Text style={{ color: '#fff', fontSize: size * 0.3, fontWeight: '800' }}>
          {player.LastName?.slice(0, 2)}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const ph = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statRowLabel}>{label}</Text>
      <Text style={[s.statRowValue, accent && s.accentText]}>{value}</Text>
    </View>
  );
}

// ── Game log row ──────────────────────────────────────────────────────────────

function GameLogRow({ log, isAlt }: { log: PlayerGameStats; isAlt: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const parts = log.Day ? log.Day.split('-').map(Number) : null;
  const date  = parts ? new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const result = (log as any).WinLoss || (log.PlusMinus > 0 ? 'W' : 'L');
  const won    = result === 'W';
  const canNav = !!log.GameID && !!log.Day;

  return (
    <TouchableOpacity
      style={[s.logRow, isAlt && { backgroundColor: '#191919' }]}
      disabled={!canNav}
      onPress={() => canNav && navigation.navigate('Game', { gameId: log.GameID, gameDate: log.Day! })}
      activeOpacity={0.7}
    >
      <Text style={s.logDate}>{date}</Text>
      <Text style={s.logMatchup}>
        {log.HomeOrAway === 'HOME' ? 'vs' : '@'} {log.Opponent ?? '—'}
      </Text>
      <Text style={[s.logResult, won ? s.winText : s.loseText]}>
        {result}{(log as any).TeamScore != null ? ` ${(log as any).TeamScore}-${(log as any).OpponentScore}` : ''}
      </Text>
      <Text style={s.logStat}>{log.Points ?? '—'}</Text>
      <Text style={s.logStat}>{log.Rebounds ?? '—'}</Text>
      <Text style={s.logStat}>{log.Assists ?? '—'}</Text>
      <Text style={s.logMin}>{log.Minutes != null ? fmtStat(log.Minutes, 0) : '—'}</Text>
    </TouchableOpacity>
  );
}

// ── Career Stats Card ─────────────────────────────────────────────────────────

function CareerStatCols({ row, dim }: { row: any; dim?: boolean }) {
  const c = dim ? '#666' : '#ccc';
  return (
    <>
      <Text style={[s.careerStat, { color: c }]}>{row.Games}</Text>
      <Text style={[s.careerStat, { color: dim ? '#888' : '#fff', fontWeight: '700' }]}>{fmtStat(row.Points)}</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat(row.Rebounds)}</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat(row.Assists)}</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat(row.Steals)}</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat(row.BlockedShots)}</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat((row.FieldGoalsPercentage ?? 0) * 100, 1)}%</Text>
      <Text style={[s.careerStat, { color: c }]}>{fmtStat((row.ThreePointersPercentage ?? 0) * 100, 1)}%</Text>
    </>
  );
}

function CareerStatsCard({ career }: { career: any[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Group rows by SeasonYear — NBA.com returns individual team rows + a real TOT row for traded seasons
  const seasons: { year: number; label: string; tot: any; teams: any[] }[] = [];
  const yearMap = new Map<number, { tot: any | null; teams: any[] }>();
  for (const row of career) {
    if (!yearMap.has(row.SeasonYear)) yearMap.set(row.SeasonYear, { tot: null, teams: [] });
    const entry = yearMap.get(row.SeasonYear)!;
    if (row.Team === 'TOT') entry.tot = row;
    else entry.teams.push(row);
  }
  for (const [year, { tot, teams }] of [...yearMap.entries()].sort((a, b) => b[0] - a[0])) {
    const label = (tot ?? teams[0])?.Season ?? String(year);
    // Single team season: use that row directly. Traded: use the real TOT row from NBA.com
    const mainRow = teams.length > 1 ? tot : teams[0];
    seasons.push({ year, label, tot: mainRow, teams });
  }

  const toggle = (year: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionLabel}>Career Stats</Text>
      {/* Header */}
      <View style={[s.careerRow, { marginTop: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', paddingBottom: 6 }]}>
        <Text style={[s.careerSeason, { color: '#555', width: 86 }]}>Season</Text>
        {['GP','PTS','REB','AST','STL','BLK','FG%','3P%'].map(h => (
          <Text key={h} style={[s.careerStat, { color: '#555' }]}>{h}</Text>
        ))}
      </View>

      {seasons.map(({ year, label, tot, teams }, si) => {
        const isMultiTeam = teams.length > 1;
        const isOpen = expanded.has(year);

        return (
          <View key={year}>
            <TouchableOpacity
              activeOpacity={isMultiTeam ? 0.6 : 1}
              onPress={isMultiTeam ? () => toggle(year) : undefined}
              style={[s.careerRow, si > 0 && { borderTopWidth: 1, borderTopColor: '#2a2a2a' }]}
            >
              <View style={s.careerSeasonCell}>
                {isMultiTeam ? (
                  <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={s.careerTotText}>TOT</Text>
                  </View>
                ) : tot?.Team ? (
                  <Image source={{ uri: teamLogoUri(tot.Team) }} style={{ width: 20, height: 20 }} resizeMode="contain" />
                ) : null}
                <Text style={s.careerSeason}>{label}</Text>
              </View>
              <CareerStatCols row={tot} />
            </TouchableOpacity>

            {/* Expanded team rows — most recent team first */}
            {isOpen && [...teams].reverse().map((teamRow, ti) => (
              <View key={`${year}-${teamRow.Team}-${ti}`}
                style={[s.careerRow, { borderTopWidth: 1, borderTopColor: '#1e1e1e', paddingLeft: 6, backgroundColor: '#181818' }]}>
                <View style={s.careerSeasonCell}>
                  <Image source={{ uri: teamLogoUri(teamRow.Team) }} style={{ width: 20, height: 20 }} resizeMode="contain" />
                  <Text style={[s.careerSeason, { color: '#777', fontSize: 10 }]}>{teamRow.Team}</Text>
                </View>
                <CareerStatCols row={teamRow} dim />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PlayerScreen({ route }: Props) {
  const { playerId, fallback } = route.params;

  const [player,       setPlayer]       = useState<Player | null>(null);
  const [stats,        setStats]        = useState<PlayerStats | null>(null);
  const [playoffStats, setPlayoffStats] = useState<PlayerStats | null>(null);
  const [logs,         setLogs]         = useState<PlayerGameStats[]>([]);
  const [career,       setCareer]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);  // bio + career only
  const [statsLoading, setStatsLoading] = useState(true);  // season stats separately
  const [activeTab,    setActiveTab]    = useState<Tab>('Stats');
  const [showPlayoffs, setShowPlayoffs] = useState(false);

  useEffect(() => {
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

    // Fast path: bio + career — these are always cached, loads in <100ms
    Promise.all([
      safe(NBAService.getPlayerById(playerId)),
      safe(NBAService.getPlayerCareerStats(playerId)),
    ]).then(([pRes, careerRes]) => {
      if (pRes?.player) setPlayer(pRes.player);
      setCareer(careerRes?.seasons ?? []);
    }).catch(() => {}).finally(() => setLoading(false));

    // Slow path: season stats (may need NBA.com game log fetch) — independent spinner
    Promise.all([
      safe(NBAService.getPlayerSeasonStats(playerId)),
      safe(NBAService.getPlayerPlayoffStats(playerId)),
    ]).then(([sRes, poRes]) => {
      setStats(sRes?.stats ?? null);
      setPlayoffStats(poRes?.stats ?? null);
    }).catch(() => {}).finally(() => setStatsLoading(false));

    // Game log tab loads independently
    safe(NBAService.getPlayerGameLogs(playerId))
      .then(lRes => setLogs(lRes?.logs ?? []));
  }, [playerId]);

  const color = player ? (teamColors[player.Team] ?? '#555') : '#555';

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!player) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={{ color: '#555', textAlign: 'center', marginTop: 60 }}>Player not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={[s.header, { borderBottomColor: color }]}>
        <PlayerPhoto player={player} size={72} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.playerName}>{player.FirstName} {player.LastName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Image source={{ uri: teamLogoUri(player.Team) }} style={{ width: 18, height: 18 }} resizeMode="contain" />
            <Text style={s.playerMeta}>{teamFullNames[player.Team] ?? player.Team}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            {player.Jersey != null && <Text style={s.playerBio}>#{player.Jersey}</Text>}
            {player.Position && <Text style={s.playerBio}>{player.Position}</Text>}
            {player.Height > 0 && <Text style={s.playerBio}>{fmtHeight(player.Height)}</Text>}
            {player.Weight > 0 && <Text style={s.playerBio}>{player.Weight} lbs</Text>}
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {(['Stats', 'Game Log'] as Tab[]).map(tab => (
          <TouchableOpacity key={tab} style={s.tabBtn} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>{tab}</Text>
            {activeTab === tab && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ── */}
      {activeTab === 'Stats' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40, gap: 10 }}>

          {/* Per-game averages */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.sectionLabel}>{showPlayoffs ? 'Playoff Averages' : 'Season Averages'}</Text>
              {playoffStats && (
                <TouchableOpacity
                  onPress={() => setShowPlayoffs(p => !p)}
                  style={[s.toggleBtn, showPlayoffs && s.toggleBtnActive]}
                >
                  <Text style={[s.toggleBtnText, showPlayoffs && s.toggleBtnTextActive]}>
                    {showPlayoffs ? 'Regular Season' : 'Playoffs'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {statsLoading ? (
              <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
            ) : (showPlayoffs ? playoffStats : stats) ? (
              <View style={{ marginTop: 14 }}>
                {/* Big 3 */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {(() => { const st = showPlayoffs ? playoffStats! : stats!; return [
                    { val: fmtStat(st.Points),   label: 'PTS' },
                    { val: fmtStat(st.Rebounds),  label: 'REB' },
                    { val: fmtStat(st.Assists),   label: 'AST' },
                  ]; })().map(({ val, label }, i) => (
                    <View key={label} style={[s.bigStatBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: '#2a2a2a' }]}>
                      <Text style={s.bigStatVal}>{val}</Text>
                      <Text style={s.bigStatLbl}>{label}</Text>
                    </View>
                  ))}
                </View>
                {(() => { const st = showPlayoffs ? playoffStats! : stats!; return (<>
                <View style={s.divider} />
                <StatRow label="Steals"          value={fmtStat(st.Steals)} />
                <View style={s.divider} />
                <StatRow label="Blocks"          value={fmtStat(st.BlockedShots)} />
                <View style={s.divider} />
                <StatRow label="Turnovers"       value={fmtStat(st.Turnovers)} />
                <View style={s.divider} />
                <StatRow label="Field Goal %"    value={fmtPct(st.FieldGoalsPercentage)} />
                <View style={s.divider} />
                <StatRow label="3-Point %"       value={fmtPct(st.ThreePointersPercentage)} />
                <View style={s.divider} />
                <StatRow label="Free Throw %"    value={fmtPct(st.FreeThrowsPercentage)} />
                <View style={s.divider} />
                <StatRow label="Games Played"    value={String(st.Games ?? '—')} />
                <View style={s.divider} />
                <StatRow label="Minutes"         value={fmtStat(st.Minutes)} />
                </>); })()}
              </View>
            ) : (
              <Text style={[s.emptyText, { marginTop: 12 }]}>No stats available</Text>
            )}
          </View>

          {/* Career Stats */}
          {career.length > 0 && (
            <CareerStatsCard career={career} />
          )}

          {/* Bio */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>Profile</Text>
            <View style={{ marginTop: 14 }}>
              {player.BirthDate    && <><StatRow label="Age"        value={calcAge(player.BirthDate)} /><View style={s.divider} /></>}
              {player.BirthCountry && <><StatRow label="Country"    value={player.BirthCountry} /><View style={s.divider} /></>}
              {player.College      && <><StatRow label="College"    value={player.College} /><View style={s.divider} /></>}
              {(player as any).DraftYear && (
                <>
                  <StatRow
                    label="Draft"
                    value={`${(player as any).DraftYear} · Round ${(player as any).DraftRound} · Pick ${(player as any).DraftPick}`}
                  />
                  <View style={s.divider} />
                </>
              )}
              {player.Experience != null && <><StatRow label="Experience" value={`${player.Experience} yr${player.Experience !== 1 ? 's' : ''}`} /><View style={s.divider} /></>}
              <StatRow label="Status" value={player.Status ?? '—'} accent={player.Status === 'Active'} />
            </View>
          </View>

        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Game log header */}
          <View style={[s.logRow, { borderBottomWidth: 1, borderBottomColor: '#2a2a2a', paddingVertical: 8, paddingHorizontal: 12 }]}>
            <Text style={[s.logDate,    { color: '#555' }]}>Date</Text>
            <Text style={[s.logMatchup, { color: '#555' }]}>Opp</Text>
            <Text style={[s.logResult,  { color: '#555' }]}>W/L</Text>
            <Text style={[s.logStat,    { color: '#555' }]}>PTS</Text>
            <Text style={[s.logStat,    { color: '#555' }]}>REB</Text>
            <Text style={[s.logStat,    { color: '#555' }]}>AST</Text>
            <Text style={[s.logMin,     { color: '#555' }]}>MIN</Text>
          </View>
          {logs.length === 0 ? (
            <Text style={[s.emptyText, { textAlign: 'center', marginTop: 40 }]}>No game logs</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {logs.map((log, i) => <GameLogRow key={log.GameID} log={log} isAlt={i % 2 === 1} />)}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#141414' },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 3 },
  playerName:     { color: '#fff', fontSize: 20, fontWeight: '800' },
  playerMeta:     { color: '#aaa', fontSize: 13, fontWeight: '500' },
  playerBio:      { color: '#555', fontSize: 12, fontWeight: '500' },

  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  tabBtn:         { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel:       { color: '#555', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  tabUnderline:   { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#fff', borderRadius: 1 },

  card:           { backgroundColor: '#1e1e1e', borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  sectionLabel:   { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  divider:        { height: 1, backgroundColor: '#2a2a2a', marginVertical: 2 },
  emptyText:      { color: '#555', fontSize: 14 },

  bigStatBox:     { flex: 1, alignItems: 'center', paddingVertical: 12 },
  bigStatVal:     { color: '#fff', fontSize: 26, fontWeight: '800' },
  bigStatLbl:     { color: '#555', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  statRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  statRowLabel:   { flex: 1, color: '#aaa', fontSize: 14, fontWeight: '500' },
  statRowValue:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  accentText:     { color: '#4caf50' },
  toggleBtn:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#242424' },
  toggleBtnActive:{ backgroundColor: '#fff' },
  toggleBtnText:  { color: '#777', fontSize: 11, fontWeight: '600' },
  toggleBtnTextActive: { color: '#000', fontWeight: '700' },

  winText:        { color: '#4caf50' },
  loseText:       { color: '#e05a5a' },

  careerRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  careerSeasonCell: { width: 82, flexDirection: 'row', alignItems: 'center', gap: 5 },
  careerSeason:     { color: '#aaa', fontSize: 11, fontWeight: '600' },
  careerStat:       { flex: 1, color: '#ccc', fontSize: 10, textAlign: 'center' },
  careerChevron:    { width: 20, color: '#555', fontSize: 10, textAlign: 'center' },
  careerTotText:    { color: '#fff', fontSize: 9, fontWeight: '700' },

  logRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  logDate:        { width: 90, color: '#888', fontSize: 11 },
  logMatchup:     { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  logResult:      { width: 72, fontSize: 11, fontWeight: '700' },
  logStat:        { width: 34, color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  logMin:         { width: 34, color: '#888', fontSize: 11, textAlign: 'center' },
});
