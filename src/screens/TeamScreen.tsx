import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator, Dimensions, Modal,
} from 'react-native';
import Svg, { Line, Circle, Rect, Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
import { NBAService, Standing, Game, Player } from '../api/nbaService';
import { teamLogoUri, teamColors } from '../utils/teamMappings';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamProfile'>;
type Tab = 'Overview' | 'Roster' | 'Matches' | 'Stats' | 'Contracts' | 'Draft';

const CAP_BY_YEAR: Record<number, { cap: number; tax: number; min: number; apron1: number; apron2: number }> = {
  2026: { cap: 154_647_000, tax: 187_895_000, min: 139_182_000, apron1: 195_945_000, apron2: 207_824_000 },
  2027: { cap: 165_000_000, tax: 201_000_000, min: 149_000_000, apron1: 209_000_000, apron2: 222_000_000 },
};
const DEFAULT_CAP = { cap: 154_647_000, tax: 187_895_000, min: 139_182_000, apron1: 195_945_000, apron2: 207_824_000 };

function fmtSalary(n: number, full = false): string {
  if (!n) return '—';
  if (full) return `$${n.toLocaleString('en-US')}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TeamLogo({ abbrev, size = 36 }: { abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: teamColors[abbrev] ?? '#333', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: size * 0.32, fontWeight: '800' }}>{abbrev.slice(0, 3)}</Text>
      </View>
    );
  }
  return <Image source={{ uri: teamLogoUri(abbrev) }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setFailed(true)} />;
}

function calcGB(leader: Standing, team: Standing): string {
  if (leader.TeamID === team.TeamID) return '—';
  const gb = ((leader.Wins - team.Wins) + (team.Losses - leader.Losses)) / 2;
  return gb <= 0 ? '—' : gb % 1 === 0 ? String(gb) : gb.toFixed(1);
}

function isGameFinal(g: Game) { return ['Final','F/OT','F/2OT','F/3OT'].includes(g.Status); }
function isGameScheduled(g: Game) { return g.Status === 'Scheduled'; }

// ── Tab Bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const TABS: Tab[] = ['Overview', 'Roster', 'Matches', 'Stats', 'Contracts', 'Draft'];
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row' }}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={s.tabBtn} onPress={() => onChange(t)}>
            <Text style={[s.tabLabel, active === t && s.tabLabelActive]}>{t}</Text>
            {active === t && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Half-court with starters ──────────────────────────────────────────────────

const POS_MAP: Record<string, { x: number; y: number }> = {
  PG: { x: 50, y: 75 },
  SG: { x: 22, y: 58 },
  SF: { x: 78, y: 58 },
  PF: { x: 28, y: 30 },
  C:  { x: 50, y: 18 },
};
const POS_ORDER = ['PG','SG','SF','PF','C'];

function StarterPin({ player, x, y, courtW, courtH, nbaIdMap }: {
  player: any; x: number; y: number; courtW: number; courtH: number;
  nbaIdMap: Record<number,number>;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [failed, setFailed] = useState(false);
  const left      = (x / 100) * courtW;
  const top       = (y / 100) * courtH;
  const uri       = player.PhotoUrl;
  const playerId  = player.PlayerID;  // already resolved to roster ID (or null if no match)
  const teamColor = teamColors[player.Team] ?? '#555';
  const fullName = player.Name ?? `${player.FirstName ?? ''} ${player.LastName ?? ''}`.trim();
  const lastName = player.LastName ?? fullName.split(' ').slice(1).join(' ') ?? '?';

  return (
    <TouchableOpacity
      style={{ position: 'absolute', left: left - 60, top: top - 32, alignItems: 'center', width: 120 }}
      onPress={() => playerId && navigation.navigate('PlayerProfile', { playerId })}
      activeOpacity={playerId ? 0.7 : 1}
    >
      {/* Outer glow ring */}
      <View style={{
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: teamColor + '33',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Photo circle */}
        <View style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', borderWidth: 2, borderColor: teamColor, backgroundColor: '#222' }}>
          {!failed && uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setFailed(true)} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: teamColor }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{lastName.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>
      {/* Name pill */}
      <View style={{ marginTop: 4, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 }}>
          {lastName}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function HalfCourt({ starters, nbaIdMap }: { starters: any[]; nbaIdMap: Record<number,number> }) {
  const courtW = Dimensions.get('window').width - 36;
  const courtH = courtW * 0.85;
  const POS_ORDER_LOCAL = ['C','PF','SF','SG','PG'];

  const assigned: { player: any; x: number; y: number }[] = [];
  const used = new Set<string>();

  starters.forEach(p => {
    const pos = (p.Position ?? '').toUpperCase();
    if (POS_MAP[pos] && !used.has(pos)) {
      assigned.push({ player: p, ...POS_MAP[pos] });
      used.add(pos);
    }
  });
  starters.forEach(p => {
    if (assigned.find(a => a.player.PlayerID === p.PlayerID)) return;
    const pos = POS_ORDER.find(po => !used.has(po)) ?? 'PG';
    assigned.push({ player: p, ...POS_MAP[pos] });
    used.add(pos);
  });

  return (
    <View style={{ width: courtW, height: courtH, backgroundColor: '#2c2c2c', borderRadius: 12, overflow: 'hidden', alignSelf: 'center' }}>
      <Svg width={courtW} height={courtH} style={{ position: 'absolute' }}>
        {/* Court border */}
        <Rect x={2} y={2} width={courtW-4} height={courtH-4} stroke="#3a3a3a" strokeWidth={1.5} fill="none" rx={12} />
        {/* Baseline */}
        <Line x1={0} y1={courtH-1} x2={courtW} y2={courtH-1} stroke="#3a3a3a" strokeWidth={1.5} />
        {/* Paint */}
        <Rect x={courtW*0.29} y={0} width={courtW*0.42} height={courtH*0.36} stroke="#3a3a3a" strokeWidth={1.5} fill="rgba(255,255,255,0.02)" />
        {/* Free-throw circle */}
        <Circle cx={courtW*0.5} cy={courtH*0.36} r={courtW*0.13} stroke="#3a3a3a" strokeWidth={1.5} fill="none" />
        {/* Three-point arc */}
        <Path
          d={`M ${courtW*0.09} 0 L ${courtW*0.09} ${courtH*0.38} A ${courtW*0.43} ${courtW*0.43} 0 0 0 ${courtW*0.91} ${courtH*0.38} L ${courtW*0.91} 0`}
          stroke="#3a3a3a" strokeWidth={1.5} fill="none"
        />
      </Svg>
      {assigned.map(({ player, x, y }) => (
        <StarterPin key={player.PlayerID} player={player} x={x} y={y} courtW={courtW} courtH={courtH} nbaIdMap={nbaIdMap} />
      ))}
    </View>
  );
}

// ESPN schedule may store NOP/UTA/WAS/GSW as NO/UTAH/WSH/GS
const TEAM_ALIASES: Record<string, string[]> = {
  NOP: ['NOP','NO'], UTA: ['UTA','UTAH'], WAS: ['WAS','WSH'], GSW: ['GSW','GS'],
};
function isOurTeam(abbr: string, teamKey: string): boolean {
  const alts = TEAM_ALIASES[teamKey] ?? [teamKey];
  return alts.includes(abbr);
}

// ── Season Stats computed from schedule ───────────────────────────────────────

function computeSeasonStats(games: Game[], teamKey: string) {
  const finished = games.filter(isGameFinal);
  if (finished.length === 0) return null;
  let totalPts = 0, totalOpp = 0, homeW = 0, homeL = 0, awayW = 0, awayL = 0;
  finished.forEach(g => {
    const isHome  = isOurTeam(g.HomeTeam, teamKey);
    const my  = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const opp = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    totalPts += my; totalOpp += opp;
    if (isHome) { my > opp ? homeW++ : homeL++; }
    else        { my > opp ? awayW++ : awayL++; }
  });
  return {
    ppg:    (totalPts / finished.length).toFixed(1),
    oppPpg: (totalOpp / finished.length).toFixed(1),
    homeRec: `${homeW}-${homeL}`,
    awayRec: `${awayW}-${awayL}`,
    gp:     finished.length,
  };
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ teamKey, standing, allStandings }: {
  teamKey: string; standing: Standing | null; allStandings: Standing[];
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [schedule, setSchedule]       = useState<Game[]>([]);
  const [starters, setStarters]       = useState<any[]>([]);
  const [nbaIdMap, setNbaIdMap]       = useState<Record<number,number>>({});
  const [loading, setLoading]         = useState(true);
  const [statsView, setStatsView] = useState<'regular' | 'playoffs'>('regular');

  useEffect(() => {
    NBAService.getTeamSchedule(teamKey)
      .then(async res => {
        const games = res.games ?? [];
        setSchedule(games);
        const lastGame = [...games].filter(isGameFinal).pop();
        if (lastGame) {
          const [boxRes, mapRes, rosterRes] = await Promise.all([
            NBAService.getBoxScore(lastGame.GameID, lastGame.Day ?? undefined, lastGame.AwayTeam, lastGame.HomeTeam),
            NBAService.getNbaIdMap(),
            NBAService.getTeamRoster(teamKey),
          ]);
          const players: any[] = boxRes.boxscore?.PlayerGames ?? [];
          const TEAM_ABBR_VARIANTS: Record<string, string[]> = {
            GSW: ['GSW','GS'], NOP: ['NOP','NO'], UTA: ['UTA','UTAH'], WAS: ['WAS','WSH'],
          };
          const ourVariants = new Set(TEAM_ABBR_VARIANTS[teamKey] ?? [teamKey]);
          const teamStarters = players.filter(p => ourVariants.has(p.Team) && p.Started === 1);

          // Build name→SportsData PlayerID map from roster so tapping navigates correctly
          // Strip everything except letters/digits so apostrophe/hyphen variants match
          const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
          const nameToId: Record<string, number> = {};
          (rosterRes.players ?? []).forEach((p: Player) => {
            nameToId[normalize(`${p.FirstName} ${p.LastName}`)] = p.PlayerID;
          });
          // Attach the correct PlayerID to each starter
          const startersWithId = teamStarters.map(p => {
            const id = nameToId[normalize(p.Name ?? '')] ?? null;
            return { ...p, PlayerID: id };  // null = no valid ID, pin won't navigate
          });

          setStarters(startersWithId);
          setNbaIdMap(mapRes.map ?? {});
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamKey]);

  const last5  = schedule.filter(isGameFinal).slice(-5);
  const next   = schedule.find(g => !isGameFinal(g) && g.Status !== 'InProgress' && g.Status !== 'NotNecessary');
  const sorted = [...allStandings].sort((a, b) => b.Percentage - a.Percentage);
  const regGames      = schedule.filter(g => g.SeasonType === 1);
  const playoffGames  = schedule.filter(g => g.SeasonType === 3);
  const seasonStats   = computeSeasonStats(regGames, teamKey);
  const playoffStats  = computeSeasonStats(playoffGames, teamKey);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40, gap: 10 }}>

      {/* ── Team Form ── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Team Form</Text>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : last5.length === 0 ? (
          <Text style={s.emptyText}>No recent games</Text>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            {last5.map(g => {
              const isHome   = isOurTeam(g.HomeTeam, teamKey);
              const myScore  = isHome ? g.HomeTeamScore : g.AwayTeamScore;
              const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
              const won      = myScore > oppScore;
              const opp      = isHome ? g.AwayTeam : g.HomeTeam;
              return (
                <TouchableOpacity
                  key={g.GameID}
                  style={{ alignItems: 'center', gap: 7 }}
                  onPress={() => navigation.navigate('Game', { gameId: g.GameID, gameDate: (g.Day ?? '').split('T')[0], awayTeam: g.AwayTeam, homeTeam: g.HomeTeam })}
                  activeOpacity={0.7}
                >
                  <TeamLogo abbrev={opp} size={32} />
                  <View style={[s.wlDot, { backgroundColor: won ? '#1a3a1a' : '#3a1a1a', borderColor: won ? '#4caf50' : '#e05a5a' }]}>
                    <Text style={[{ fontSize: 10, fontWeight: '800' }, won ? s.winnerText : s.loserText]}>{won ? 'W' : 'L'}</Text>
                  </View>
                  <Text style={s.formScore}>{myScore}–{oppScore}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Next Match ── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Next Match</Text>
        {next ? (
          <View style={{ marginTop: 12 }}>
            {/* Away team row */}
            <View style={s.matchupRow}>
              <TeamLogo abbrev={next.AwayTeam} size={32} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={s.teamAbbr}>{next.AwayTeam}</Text>
                <Text style={s.rowTeamName}>{next.AwayTeam === teamKey ? 'Away' : ''}</Text>
              </View>
              {next.AwayTeam === teamKey && <Text style={s.atLabel}>AWAY</Text>}
            </View>
            <View style={s.divider} />
            {/* Home team row */}
            <View style={s.matchupRow}>
              <TeamLogo abbrev={next.HomeTeam} size={32} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={s.teamAbbr}>{next.HomeTeam}</Text>
              </View>
              {next.HomeTeam === teamKey && <Text style={s.atLabel}>HOME</Text>}
            </View>
            {/* Date/time footer */}
            {next.DateTime && (
              <View style={[s.divider, { marginBottom: 8 }]} />
            )}
            {next.DateTime && (
              <Text style={s.matchDateText}>
                {new Date(next.DateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {'  ·  '}
                {new Date(next.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
            )}
          </View>
        ) : (
          <Text style={[s.emptyText, { marginTop: 10 }]}>No upcoming games</Text>
        )}
      </View>

      {/* ── Season Stats ── */}
      {/* ── Season Stats ── */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.sectionLabel}>{statsView === 'playoffs' ? 'Playoff Stats' : 'Season Stats'}</Text>
          {playoffStats && (
            <TouchableOpacity
              onPress={() => setStatsView(v => v === 'regular' ? 'playoffs' : 'regular')}
              style={[s.toggleBtn, statsView === 'playoffs' && s.toggleBtnActive]}
            >
              <Text style={[s.toggleBtnText, statsView === 'playoffs' && s.toggleBtnTextActive]}>
                {statsView === 'playoffs' ? 'Regular Season' : 'Playoffs'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />
        ) : (() => {
          const st = statsView === 'playoffs' ? playoffStats : seasonStats;
          if (!st) return <Text style={[s.emptyText, { marginTop: 16 }]}>No stats available</Text>;
          const winPct = statsView === 'regular' && standing
            ? standing.Percentage.toFixed(3)
            : st.gp > 0
              ? ((parseInt(st.homeRec.split('-')[0]) + parseInt(st.awayRec.split('-')[0])) / st.gp).toFixed(3)
              : '—';
          const streak = statsView === 'regular' ? standing?.StreakDescription : null;
          const isWStreak = streak?.startsWith('W');
          return (
            <View style={{ marginTop: 14 }}>
              {/* Big 3 */}
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                {[
                  { val: st.ppg,    label: 'PPG' },
                  { val: st.oppPpg, label: 'OPP PPG' },
                  { val: String(st.gp), label: 'GP' },
                ].map(({ val, label }, i) => (
                  <View key={label} style={[s.bigStatBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: '#2a2a2a' }]}>
                    <Text style={[s.bigStatVal, label === 'OPP PPG' && { color: '#e05a5a' }, label === 'GP' && { color: '#aaa', fontSize: 22 }]}>{val}</Text>
                    <Text style={s.bigStatLbl}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={s.divider} />
              <View style={s.psRow}>
                <Text style={s.psLabel}>Home</Text>
                <Text style={s.psValue}>{st.homeRec}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.psRow}>
                <Text style={s.psLabel}>Away</Text>
                <Text style={s.psValue}>{st.awayRec}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.psRow}>
                <Text style={s.psLabel}>Win %</Text>
                <Text style={s.psValue}>{winPct}</Text>
              </View>
              {streak && (
                <>
                  <View style={s.divider} />
                  <View style={s.psRow}>
                    <Text style={s.psLabel}>Streak</Text>
                    <Text style={[s.psValue, { color: isWStreak ? '#4caf50' : '#e05a5a' }]}>{streak}</Text>
                  </View>
                </>
              )}
            </View>
          );
        })()}
      </View>

      {/* ── Last Starting 5 ── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Last Starting 5</Text>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />
        ) : starters.length > 0 ? (
          <View style={{ marginTop: 14, marginHorizontal: -14 }}>
            <HalfCourt starters={starters} nbaIdMap={nbaIdMap} />
          </View>
        ) : (
          <Text style={[s.emptyText, { marginTop: 16 }]}>No lineup data</Text>
        )}
      </View>

      {/* ── League Standings ── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>League Standings</Text>
        {/* Header row */}
        <View style={[s.standRow, { marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }]}>
          <Text style={[s.standRank, { color: '#555' }]}>#</Text>
          <Text style={[s.standTeam, { color: '#555' }]}>Team</Text>
          {['W','L','PCT','GB','STK'].map(h => <Text key={h} style={[s.standStat, { color: '#555' }]}>{h}</Text>)}
        </View>
        {sorted.map((t, i) => {
          const streak = t.StreakDescription ?? '';
          const isMe   = t.Key === teamKey;
          const gb     = i === 0 ? '—' : calcGB(sorted[0], t);
          return (
            <View key={t.TeamID} style={[s.standRow, { paddingVertical: 7 }, isMe && s.standRowHighlight]}>
              <Text style={[s.standRank, !isMe && { color: '#555' }]}>{i + 1}</Text>
              <View style={s.standTeam}>
                <TeamLogo abbrev={t.Key} size={20} />
                <Text style={[s.rowTeamName, { fontSize: 13 }, !isMe && { color: '#aaa', fontWeight: '500' }]} numberOfLines={1}>
                  {t.Name}
                </Text>
              </View>
              <Text style={[s.standStat, isMe && { color: '#fff' }]}>{t.Wins}</Text>
              <Text style={[s.standStat, isMe && { color: '#fff' }]}>{t.Losses}</Text>
              <Text style={[s.standStat, isMe && { color: '#fff' }]}>{t.Percentage.toFixed(3)}</Text>
              <Text style={[s.standStat, isMe && { color: '#fff' }]}>{gb}</Text>
              <Text style={[s.standStat, streak.startsWith('W') ? s.winnerText : s.loserText]}>{streak}</Text>
            </View>
          );
        })}
      </View>

    </ScrollView>
  );
}

// ── Roster Tab ────────────────────────────────────────────────────────────────

function fmtHeight(inches: number): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

const MONTHS: Record<string, number> = {
  JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
  JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
};

function calcAge(birthDate: string): string {
  if (!birthDate) return '—';
  // Parse 'APR 09, 1996' — Hermes can't handle non-ISO strings in Date.parse
  const m = birthDate.match(/^([A-Z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  let birth: Date;
  if (m) {
    const month = MONTHS[m[1]];
    if (month === undefined) return '—';
    birth = new Date(parseInt(m[3]), month, parseInt(m[2]));
  } else {
    // ISO format fallback e.g. '1996-04-09'
    birth = new Date(birthDate);
  }
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const notYetHadBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (notYetHadBirthday) age--;
  return String(age);
}

function PlayerRow({ player: p, teamKey, alt, nbaIdMap }: {
  player: Player; teamKey: string; alt: boolean; nbaIdMap: Record<number, number>;
}) {
  const navigation = useNavigation<Nav>();
  const [imgFailed, setImgFailed] = useState(false);
  const nbaid    = nbaIdMap[p.PlayerID];
  const photoUri = nbaid
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaid}.png`
    : p.PhotoUrl ?? null;

  return (
    <TouchableOpacity
      style={[s.rosterRow, alt && { backgroundColor: '#191919' }]}
      onPress={() => navigation.navigate('PlayerProfile', { playerId: p.PlayerID })}
      activeOpacity={0.7}
    >
      <Text style={[s.rosterCell, { width: 32, color: '#555' }]}>{p.Jersey ?? '—'}</Text>
      <View style={[s.rosterCell, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: '#2a2a2a' }}>
          {!imgFailed && photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setImgFailed(true)} />
          ) : (
            <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: teamColors[teamKey] ?? '#333' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{p.LastName?.slice(0, 2)}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{p.FirstName} {p.LastName}</Text>
      </View>
      <Text style={s.rosterCell}>{p.Position ?? '—'}</Text>
      <Text style={s.rosterCell}>{fmtHeight(p.Height)}</Text>
      <Text style={s.rosterCell}>{p.Weight ?? '—'}</Text>
      <Text style={s.rosterCell}>{calcAge(p.BirthDate)}</Text>
    </TouchableOpacity>
  );
}

const POS_GROUPS: Record<string, string[]> = {
  Guards:   ['PG', 'SG', 'G'],
  Forwards: ['SF', 'PF', 'F'],
  Centers:  ['C'],
};

function RosterTab({ teamKey }: { teamKey: string }) {
  const [players, setPlayers]   = useState<Player[]>([]);
  const [nbaIdMap, setNbaIdMap] = useState<Record<number, number>>({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      NBAService.getTeamRoster(teamKey),
      NBAService.getNbaIdMap(),
    ]).then(([rosterRes, mapRes]) => {
      setPlayers(rosterRes.players ?? []);
      setNbaIdMap(mapRes.map ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamKey]);

  if (loading) return <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />;

  const grouped: Record<string, Player[]> = { Guards: [], Forwards: [], Centers: [], Other: [] };
  players.forEach(p => {
    const pos = (p.Position ?? '').toUpperCase();
    if (POS_GROUPS.Guards.includes(pos))   grouped.Guards.push(p);
    else if (POS_GROUPS.Forwards.includes(pos)) grouped.Forwards.push(p);
    else if (POS_GROUPS.Centers.includes(pos))  grouped.Centers.push(p);
    else grouped.Other.push(p);
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {Object.entries(grouped).filter(([, ps]) => ps.length > 0).map(([group, ps]) => (
        <View key={group} style={{ marginBottom: 20 }}>
          <Text style={s.sectionTitle}>{group}</Text>
          {/* Header */}
          <View style={[s.rosterRow, { borderBottomWidth: 1, borderBottomColor: '#2a2a2a', paddingBottom: 6, marginBottom: 2 }]}>
            <Text style={[s.rosterCell, { width: 32 }]}>#</Text>
            <Text style={[s.rosterCell, { flex: 1 }]}>Player</Text>
            <Text style={s.rosterCell}>POS</Text>
            <Text style={s.rosterCell}>HT</Text>
            <Text style={s.rosterCell}>WT</Text>
            <Text style={s.rosterCell}>AGE</Text>
          </View>
          {ps.map((p, i) => <PlayerRow key={p.PlayerID} player={p} teamKey={teamKey} alt={i % 2 === 1} nbaIdMap={nbaIdMap} />)}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Matches Tab (placeholder) ─────────────────────────────────────────────────

function MatchesTab({ teamKey }: { teamKey: string }) {
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    NBAService.getTeamSchedule(teamKey)
      .then(res => { setSchedule(res.games ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamKey]);

  const past   = schedule.filter(g => isGameFinal(g)).reverse();
  const future = schedule.filter(g => !isGameFinal(g) && g.Status !== 'InProgress');
  const games  = showPast ? past : future;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', margin: 12, gap: 8 }}>
        {[{ label: 'Upcoming', val: false }, { label: 'Results', val: true }].map(({ label, val }) => (
          <TouchableOpacity key={label} style={[s.chip, showPast === val && s.chipActive]} onPress={() => setShowPast(val)}>
            <Text style={[s.chipText, showPast === val && s.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {games.map((g, i) => {
            const isHome   = g.HomeTeam === teamKey;
            const opp      = isHome ? g.AwayTeam : g.HomeTeam;
            const myScore  = isHome ? g.HomeTeamScore : g.AwayTeamScore;
            const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
            const won      = isGameFinal(g) && myScore > oppScore;
            const date     = g.Day ? new Date(g.Day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return (
              <View key={g.GameID} style={[s.matchRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#1e1e1e' }]}>
                <Text style={s.matchDate}>{date}</Text>
                <TeamLogo abbrev={opp} size={24} />
                <Text style={s.matchOpp}>{isHome ? 'vs' : '@'} {opp}</Text>
                {isGameFinal(g) ? (
                  <Text style={[s.matchScore, won ? s.winner : s.loser]}>{won ? 'W' : 'L'} {myScore}–{oppScore}</Text>
                ) : (
                  <Text style={s.matchTime}>
                    {g.DateTime ? new Date(g.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD'}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ── Contracts Tab ─────────────────────────────────────────────────────────────

const FULL_POSITION: Record<string, string> = {
  PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward',
  PF: 'Power Forward', C: 'Center', G: 'Guard', F: 'Forward',
  'G-F': 'Guard-Forward', 'F-C': 'Forward-Center', 'F-G': 'Forward-Guard',
};

const OPTION_SHORT: Record<string, string>  = { 'Player Option': 'PO', 'Team Option': 'TO', 'Two-Way': '2W' };
const OPTION_COLOR: Record<string, string>  = { 'Player Option': '#60a5fa', 'Team Option': '#f59e0b', 'Two-Way': '#a78bfa' };

const PHOTO_W = 28;
const NAME_PADDING = 10 + 7; // paddingLeft + gap
const YEAR_W  = 110;

function SalaryCell({ entry, isEmpty, isTwoWay, isFirstYear, width }: { entry: any; isEmpty: boolean; isTwoWay: boolean; isFirstYear: boolean; width?: number }) {
  const w = width ? { width } : {};
  if (isEmpty) return <View style={[ct.cell, w]} />;
  if (isTwoWay) {
    if (!isFirstYear) return <View style={[ct.cell, w]} />;
    return (
      <View style={[ct.cell, w]}>
        <View style={ct.twoBadge}><Text style={ct.twoText}>2-WAY</Text></View>
      </View>
    );
  }
  if (!entry) {
    return (
      <View style={[ct.cell, w]}>
        <View style={ct.ufaBadge}><Text style={ct.ufaText}>UFA</Text></View>
      </View>
    );
  }
  const opt = entry.optionType;
  return (
    <View style={[ct.cell, w]}>
      <Text style={ct.salary}>{fmtSalary(entry.salary)}</Text>
      {opt && (
        <Text style={[ct.optTag, { color: OPTION_COLOR[opt] ?? '#aaa' }]}>
          {OPTION_SHORT[opt] ?? opt}
        </Text>
      )}
    </View>
  );
}

function CapBar({ year, total, caps, statusColor }: {
  year: number; total: number;
  caps: { cap: number; tax: number; min: number; apron1: number; apron2: number };
  statusColor: string;
}) {
  const max    = caps.apron2 * 1.08;
  const fillPct = Math.min(total / max * 100, 100);
  const toPct   = (v: number) => `${Math.min(v / max * 100, 100)}%` as any;

  const thresholds = [
    { key: 'Min',         value: caps.min,    color: '#4ade80' },
    { key: 'Cap',         value: caps.cap,    color: '#4ade80' },
    { key: 'Luxury Tax',  value: caps.tax,    color: '#f59e0b' },
    { key: '1st Apron',   value: caps.apron1, color: '#f97316' },
    { key: '2nd Apron',   value: caps.apron2, color: '#ef4444' },
  ];

  const statusLabel = total > caps.apron2 ? 'Over 2nd Apron'
    : total > caps.apron1 ? 'Over 1st Apron'
    : total > caps.tax    ? 'Over Tax'
    : total > caps.cap    ? 'Over Cap'
    : 'Under Cap';

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16 }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {year - 1}-{String(year).slice(2)} Payroll
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>
          {fmtSalary(total)}{'  ·  '}{statusLabel}
        </Text>
      </View>

      {/* Bar + tick marks */}
      <View style={{ height: 24, overflow: 'hidden' }}>
        {/* Track */}
        <View style={[ct.capBarBg, { position: 'absolute', left: 0, right: 0, top: 8 }]}>
          <View style={[ct.capBarFill, { width: `${fillPct}%` as any, backgroundColor: statusColor }]} />
        </View>

        {/* Threshold ticks */}
        {thresholds.map(({ key, value, color }) => (
          <View key={key} style={{ position: 'absolute', left: toPct(value), top: 4, alignItems: 'center', width: 1, overflow: 'hidden' }}>
            <View style={{ width: 3, height: 18, backgroundColor: color, opacity: 0.95 }} />
          </View>
        ))}
      </View>

      {/* Legend — 2 rows, 3 columns aligned */}
      {[[0,1,2],[3,4,-1]].map((rowIdxs, ri) => (
        <View key={ri} style={{ flexDirection: 'row', marginTop: 6 }}>
          {rowIdxs.map((i, ci) => {
            if (i === -1) return <View key={ci} style={{ flex: 1 }} />;
            const { key, value, color } = thresholds[i];
            return (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                <Text style={{ color: '#555', fontSize: 10 }}>{key}  {fmtSalary(value)}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ContractPlayerRow({ player: p, alt, teamKey, nameFontSize, width, playerIdMap }: { player: any; alt: boolean; teamKey: string; nameFontSize: number; width: number; playerIdMap: Record<string, number> }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [failed, setFailed] = useState(false);
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const playerId = playerIdMap[normalize(p.Name ?? '')];
  // ESPN may not have a photo for some players — fall back to NBA.com headshot via roster ID
  const uri = p.PhotoUrl ?? (playerId ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png` : null);
  return (
    <TouchableOpacity
      style={[ct.nameRow, alt && { backgroundColor: '#191919' }, { width, flexDirection: 'row', alignItems: 'center', gap: 7 }]}
      onPress={() => playerId && navigation.navigate('PlayerProfile', { playerId })}
      activeOpacity={playerId ? 0.7 : 1}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2a2a2a', flexShrink: 0 }}>
        {!failed && uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: teamColors[teamKey] ?? '#333' }}>
            <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>{p.Name?.split(' ').pop()?.slice(0, 2)}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[ct.playerName, { fontSize: nameFontSize }]} numberOfLines={1}>{p.Name}</Text>
        <Text style={ct.playerPos}>
          {p.Jersey ? `#${p.Jersey}` : ''}
          {p.Jersey && p.Position ? '  ·  ' : ''}
          {FULL_POSITION[p.Position] ?? p.Position ?? ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ContractsTab({ teamKey }: { teamKey: string }) {
  const [salaries, setSalaries]         = useState<any[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [playerIdMap, setPlayerIdMap]   = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      NBAService.getTeamSalaries(teamKey),
      NBAService.getTeamRoster(teamKey),
    ]).then(([salRes, rosterRes]) => {
      setSalaries(salRes.players ?? []);
      setTotal(salRes.totalSalary ?? 0);
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const map: Record<string, number> = {};
      (rosterRes.players ?? []).forEach((p: Player) => {
        map[normalize(`${p.FirstName} ${p.LastName}`)] = p.PlayerID;
      });
      setPlayerIdMap(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [teamKey]);

  const currentYear = new Date().getFullYear();
  const years = Array.from(new Set(
    salaries.flatMap(p => (p.SalaryByYear ?? []).map((y: any) => y.year))
  )).sort((a, b) => a - b);
  const displayYears = years.length > 0 ? years : [currentYear];

  const longestName = salaries.reduce((max, p) => Math.max(max, (p.Name ?? '').length), 0);
  const nameFontSize = longestName > 20 ? 10 : longestName > 15 ? 11 : 12;
  const charWidth    = nameFontSize === 12 ? 7.2 : nameFontSize === 11 ? 6.6 : 6.1;
  const nameColW     = Math.ceil(longestName * charWidth) + PHOTO_W + NAME_PADDING + 4;


  const yearTotals: Record<number, number> = {};
  displayYears.forEach(y => {
    yearTotals[y] = salaries.reduce((sum, p) => {
      const entry = (p.SalaryByYear ?? []).find((s: any) => s.year === y);
      return sum + (entry?.salary ?? 0);
    }, 0);
  });

  const activeYear  = selectedYear ?? displayYears[0];
  const sortedSalaries = [...salaries].sort((a, b) => {
    const aEntry = (a.SalaryByYear ?? []).find((s: any) => s.year === activeYear);
    const bEntry = (b.SalaryByYear ?? []).find((s: any) => s.year === activeYear);
    return (bEntry?.salary ?? 0) - (aEntry?.salary ?? 0);
  });
  const activeTotal = yearTotals[activeYear] ?? 0;
  const caps        = CAP_BY_YEAR[activeYear] ?? DEFAULT_CAP;
  const statusColor = activeTotal > caps.apron2 ? '#ef4444' : activeTotal > caps.apron1 ? '#f97316' : activeTotal > caps.tax ? '#f59e0b' : activeTotal > caps.cap ? '#facc15' : '#4ade80';

  if (loading) return <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Cap bar (updates with selected year) ── */}
      <CapBar year={activeYear} total={activeTotal} caps={caps} statusColor={statusColor} />

      {/* ── Table (fixed name col + scrollable year cols) ── */}
      <View style={{ flexDirection: 'row' }}>

        {/* Fixed left: player names */}
        <View style={{ width: nameColW, borderRightWidth: 1, borderRightColor: '#2a2a2a' }}>
          <View style={[ct.headerRow, { paddingLeft: 14 }]}>
            <Text style={ct.headerText}>PLAYER</Text>
          </View>
          {sortedSalaries.map((p, i) => (
            <ContractPlayerRow key={p.EspnId ?? i} player={p} alt={i % 2 === 1} teamKey={teamKey} nameFontSize={nameFontSize} width={nameColW} playerIdMap={playerIdMap} />
          ))}
        </View>

        {/* Scrollable right: year columns */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={[ct.headerRow, { flexDirection: 'row' }]}>
              {displayYears.map(y => {
                const isActive = y === activeYear;
                return (
                  <TouchableOpacity
                    key={y}
                    style={[ct.yearHeader, { width: YEAR_W }, isActive && ct.yearHeaderActive]}
                    onPress={() => setSelectedYear(y)}
                    activeOpacity={0.7}
                  >
                    <Text style={[ct.headerText, isActive && ct.headerTextActive]}>
                      {y - 1}-{String(y).slice(2)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {sortedSalaries.map((p, i) => {
              const isTwoWay  = p.Salary === 0 && (p.SalaryByYear ?? []).length === 0;
              const salaryMap = new Map((p.SalaryByYear ?? []).map((s: any) => [s.year, s]));
              const lastYear  = Math.max(...(p.SalaryByYear ?? []).map((s: any) => s.year), 0);
              return (
                <View key={p.EspnId ?? i} style={[{ flexDirection: 'row' }, i % 2 === 1 && { backgroundColor: '#191919' }]}>
                  {displayYears.map((y, yi) => (
                    <SalaryCell
                      key={y}
                      entry={salaryMap.get(y)}
                      isEmpty={!isTwoWay && lastYear > 0 && y > lastYear}
                      isTwoWay={isTwoWay}
                      isFirstYear={yi === 0}
                      width={YEAR_W}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

    </ScrollView>
  );
}

// ── Draft Tab ─────────────────────────────────────────────────────────────────

function DraftPickRow({ pick, i }: { pick: any; i: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [failed, setFailed] = useState(false);
  const uri = pick.PhotoUrl ?? null;
  const canNav = !!pick.NbaId;

  return (
    <TouchableOpacity
      style={[dt.row, i % 2 === 1 && { backgroundColor: '#191919' }]}
      onPress={() => canNav && navigation.navigate('PlayerProfile', { playerId: pick.NbaId })}
      activeOpacity={canNav ? 0.7 : 1}
    >
      {/* Pick number */}
      <View style={dt.pickBadge}>
        <Text style={dt.pickNum}>{pick.Overall}</Text>
      </View>

      {/* Photo */}
      <View style={{ width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: '#2a2a2a', flexShrink: 0 }}>
        {!failed && uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{pick.Name?.split(' ').pop()?.slice(0, 2)}</Text>
          </View>
        )}
      </View>

      {/* Name + meta */}
      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
        <Text style={dt.name} numberOfLines={1}>{pick.Name}</Text>
        <Text style={dt.meta}>
          {pick.Position ?? ''}
          {pick.Position && pick.College ? '  ·  ' : ''}
          {pick.College ?? ''}
        </Text>
      </View>

      {/* Stats */}
      {pick.Stats?.GP > 0 && (
        <View style={dt.statsCol}>
          <Text style={dt.statVal}>{pick.Stats.PTS?.toFixed(1)}</Text>
          <Text style={dt.statLbl}>PTS</Text>
        </View>
      )}
      {pick.Stats?.GP > 0 && (
        <View style={dt.statsCol}>
          <Text style={dt.statVal}>{pick.Stats.REB?.toFixed(1)}</Text>
          <Text style={dt.statLbl}>REB</Text>
        </View>
      )}
      {pick.Stats?.GP > 0 && (
        <View style={dt.statsCol}>
          <Text style={dt.statVal}>{pick.Stats.AST?.toFixed(1)}</Text>
          <Text style={dt.statLbl}>AST</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DraftTab({ teamKey }: { teamKey: string }) {
  const [picks, setPicks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    NBAService.getTeamDraftPicks(teamKey)
      .then(res => setPicks(res.picks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamKey]);

  if (loading) return <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />;
  if (!picks.length) return <Text style={[s.emptyText, { textAlign: 'center', marginTop: 40 }]}>No draft data</Text>;

  // Group by year
  const byYear: Record<number, any[]> = {};
  picks.forEach(p => {
    if (!byYear[p.DraftYear]) byYear[p.DraftYear] = [];
    byYear[p.DraftYear].push(p);
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {years.map(year => (
        <View key={year} style={{ marginTop: 16 }}>
          {/* Year header — tappable to full draft page */}
          <TouchableOpacity style={dt.yearHeader} onPress={() => navigation.navigate('Draft', { year })} activeOpacity={0.7}>
            <Text style={dt.yearText}>{year} NBA Entry Draft</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={dt.yearCount}>{byYear[year].length} pick{byYear[year].length !== 1 ? 's' : ''}</Text>
              <Text style={{ color: '#555', fontSize: 12 }}>›</Text>
            </View>
          </TouchableOpacity>
          {/* Column headers */}
          <View style={[dt.row, { borderBottomWidth: 1, borderBottomColor: '#2a2a2a', paddingVertical: 6 }]}>
            <View style={dt.pickBadge}><Text style={dt.colHeader}>#</Text></View>
            <View style={{ width: 38 }} />
            <Text style={[dt.colHeader, { flex: 1, marginLeft: 10 }]}>Player</Text>
            <Text style={[dt.colHeader, { width: 36, textAlign: 'center' }]}>PTS</Text>
            <Text style={[dt.colHeader, { width: 36, textAlign: 'center' }]}>REB</Text>
            <Text style={[dt.colHeader, { width: 36, textAlign: 'center' }]}>AST</Text>
          </View>
          {byYear[year].map((pick, i) => (
            <DraftPickRow key={pick.Overall} pick={pick} i={i} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

type SortKey = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG' | 'GP';

// ── Player Stat Row Component ──────────────────────────────────────────────────
function PlayerStatRowComp({ player, stats, statValue, teamKey, isFirst, onPress }: {
  player: any; stats: any; statValue: string; teamKey: string; isFirst: boolean;
  onPress: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUri = player.PhotoUrl ?? null;

  return (
    <TouchableOpacity
      style={[s.playerStatRow, !isFirst && { borderTopWidth: 1, borderTopColor: '#1e1e1e' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Player image */}
      <View style={s.playerStatImg}>
        {!imgFailed && photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: teamColors[teamKey] ?? '#333' }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
              {player.LastName?.slice(0, 2).toUpperCase() ?? ''}
            </Text>
          </View>
        )}
      </View>

      {/* Name and position */}
      <View style={s.playerStatNameCol}>
        <Text style={s.playerStatName} numberOfLines={1}>{`${player.FirstName ?? ''} ${player.LastName ?? ''}`.trim()}</Text>
        <Text style={s.playerStatPos}>{player.Position}</Text>
      </View>

      {/* Stat value */}
      <Text style={s.playerStatValue}>{statValue}</Text>
    </TouchableOpacity>
  );
}

function RankBadge({ rank }: { rank?: number }) {
  if (!rank) return null;
  const color = rank === 1 ? '#fbbf24' : rank <= 5 ? '#6ee7b7' : rank <= 15 ? '#9ca3af' : '#fb7185';
  return (
    <View style={{ backgroundColor: color + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8, borderWidth: 1, borderColor: color + '40' }}>
      <Text style={{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>#{rank}</Text>
    </View>
  );
}

function positionGroup(pos: string): string {
  if (!pos) return 'Other';
  const p = pos.toUpperCase();
  if (p.includes('G')) return 'Guard';
  if (p.includes('F')) return 'Forward';
  if (p.includes('C')) return 'Center';
  return 'Other';
}

const POS_FILTERS = ['All', 'Guard', 'Forward', 'Center'];

function ViewAllModal({ stat, teamKey, onClose, onPlayer }: {
  stat: { label: string; players: { player: any; stats: any }[]; fmtVal: (v: number) => string; getValue: (st: any) => number };
  teamKey: string;
  onClose: () => void;
  onPlayer: (id: number) => void;
}) {
  const [posFilter, setPosFilter] = useState('All');

  const filtered = posFilter === 'All'
    ? stat.players
    : stat.players.filter(({ player }) => positionGroup(player.Position) === posFilter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#141414' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>{stat.label}</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={{ color: '#6ee7b7', fontSize: 16, fontWeight: '600' }}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Position filter pills */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {POS_FILTERS.map(pos => (
          <TouchableOpacity
            key={pos}
            onPress={() => setPosFilter(pos)}
            style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: posFilter === pos ? '#6ee7b7' : '#1e1e1e', borderWidth: 1, borderColor: posFilter === pos ? '#6ee7b7' : '#333' }}
          >
            <Text style={{ color: posFilter === pos ? '#000' : '#aaa', fontWeight: '600', fontSize: 13 }}>{pos}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Player list */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {filtered.map(({ player, stats }, i) => (
          <PlayerStatRowComp
            key={player.PlayerID}
            player={player}
            stats={stats}
            statValue={stat.fmtVal(stat.getValue(stats))}
            teamKey={teamKey}
            isFirst={i === 0}
            onPress={() => onPlayer(player.PlayerID)}
          />
        ))}
        {filtered.length === 0 && (
          <Text style={{ color: '#555', fontSize: 14, textAlign: 'center', marginTop: 40 }}>No players at this position</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatsTab({ teamKey }: { teamKey: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [regular,      setRegular]      = useState<any>(null);
  const [playoffs,     setPlayoffs]     = useState<any>(null);
  const [regularRanks, setRegularRanks] = useState<any>({});
  const [playoffRanks, setPlayoffRanks] = useState<any>({});
  const [rosterStats,  setRosterStats]  = useState<{ player: any; stats: any }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [view,        setView]          = useState<'regular' | 'playoffs'>('regular');
  const [viewAllStat, setViewAllStat] = useState<{ key: SortKey; label: string; players: { player: any; stats: any }[]; fmtVal: (v: number) => string; getValue: (st: any) => number } | null>(null);

  useEffect(() => {
    NBAService.getTeamSeasonStats(teamKey)
      .then(res => {
        setRegular(res.regular);
        setPlayoffs(res.playoffs);
        setRegularRanks(res.regularRanks ?? {});
        setPlayoffRanks(res.playoffRanks ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    NBAService.getTeamPlayerStats(teamKey)
      .then(res => setRosterStats(res.players ?? []))
      .catch(() => {})
      .finally(() => setLoadingRoster(false));
  }, [teamKey]);

  const fmtPct = (v: number) => v ? (v * 100).toFixed(1) + '%' : '—';
  const fmt    = (v: number, d = 1) => v != null ? v.toFixed(d) : '—';

  const st    = view === 'playoffs' ? playoffs : regular;
  const ranks = view === 'playoffs' ? playoffRanks : regularRanks;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40, gap: 10 }}>
      {/* Toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={s.sectionLabel}>{view === 'playoffs' ? 'Playoff Stats' : 'Season Stats'}</Text>
        {playoffs && (
          <TouchableOpacity
            onPress={() => setView(v => v === 'regular' ? 'playoffs' : 'regular')}
            style={[s.toggleBtn, view === 'playoffs' && s.toggleBtnActive]}
          >
            <Text style={[s.toggleBtnText, view === 'playoffs' && s.toggleBtnTextActive]}>
              {view === 'playoffs' ? 'Regular Season' : 'Playoffs'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : !st ? (
        <Text style={[s.emptyText, { textAlign: 'center', marginTop: 40 }]}>No stats available</Text>
      ) : (
        <>
          {/* Big 4 */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row' }}>
              {[
                { val: fmt(st.PTS), label: 'PTS', rankKey: 'PTS' },
                { val: fmt(st.REB), label: 'REB', rankKey: 'REB' },
                { val: fmt(st.AST), label: 'AST', rankKey: 'AST' },
                { val: fmt(st.TOV), label: 'TOV', rankKey: 'TOV' },
              ].map(({ val, label, rankKey }, i) => (
                <View key={label} style={[s.bigStatBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: '#2a2a2a' }]}>
                  <Text style={s.bigStatVal}>{val}</Text>
                  <Text style={s.bigStatLbl}>{label}</Text>
                  {ranks[rankKey] && <Text style={{ color: ranks[rankKey] === 1 ? '#fbbf24' : ranks[rankKey] <= 5 ? '#6ee7b7' : ranks[rankKey] <= 15 ? '#9ca3af' : '#fb7185', fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.3 }}>#{ranks[rankKey]}</Text>}
                </View>
              ))}
            </View>
          </View>

          {/* Shooting */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>Shooting</Text>
            <View style={{ marginTop: 14 }}>
              <View style={s.psRow}><Text style={s.psLabel}>Field Goal %</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmtPct(st.FGPct)}</Text><RankBadge rank={ranks.FGPct} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Three Point %</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmtPct(st.TPPct)}</Text><RankBadge rank={ranks.TPPct} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Free Throw %</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmtPct(st.FTPct)}</Text><RankBadge rank={ranks.FTPct} /></View></View>
            </View>
          </View>

          {/* Rebounds */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>Rebounds</Text>
            <View style={{ marginTop: 14 }}>
              <View style={s.psRow}><Text style={s.psLabel}>Total</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.REB)}</Text><RankBadge rank={ranks.REB} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Offensive</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.OREB)}</Text><RankBadge rank={ranks.OREB} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Defensive</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.DREB)}</Text><RankBadge rank={ranks.DREB} /></View></View>
            </View>
          </View>

          {/* Defense & Other */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>Defense & Other</Text>
            <View style={{ marginTop: 14 }}>
              <View style={s.psRow}><Text style={s.psLabel}>Steals</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.STL)}</Text><RankBadge rank={ranks.STL} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Blocks</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.BLK)}</Text><RankBadge rank={ranks.BLK} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Turnovers</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.psValue}>{fmt(st.TOV)}</Text><RankBadge rank={ranks.TOV} /></View></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Plus / Minus</Text><Text style={[s.psValue, { color: st.PlusMinus >= 0 ? '#4caf50' : '#e05a5a' }]}>{st.PlusMinus >= 0 ? '+' : ''}{fmt(st.PlusMinus)}</Text></View>
              <View style={s.divider} />
              <View style={s.psRow}><Text style={s.psLabel}>Games Played</Text><Text style={s.psValue}>{st.GP}</Text></View>
            </View>
          </View>
        </>
      )}

      {/* ── Player Stats ── */}
      {loadingRoster ? (
        <View style={s.card}>
          <Text style={s.sectionLabel}>Player Stats</Text>
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        </View>
      ) : rosterStats.length === 0 ? (
        <View style={s.card}>
          <Text style={s.sectionLabel}>Player Stats</Text>
          <Text style={[s.emptyText, { marginTop: 12 }]}>No player data</Text>
        </View>
      ) : (() => {
        const STAT_CATEGORIES: { key: SortKey; label: string; getValue: (st: any) => number }[] = [
          { key: 'PTS', label: 'Points', getValue: s => s?.Points ?? 0 },
          { key: 'REB', label: 'Rebounds', getValue: s => s?.Rebounds ?? 0 },
          { key: 'AST', label: 'Assists', getValue: s => s?.Assists ?? 0 },
          { key: 'STL', label: 'Steals', getValue: s => s?.Steals ?? 0 },
          { key: 'BLK', label: 'Blocks', getValue: s => s?.BlockedShots ?? 0 },
        ];

        const renderStatCard = (stat: typeof STAT_CATEGORIES[0]) => {
          const sorted = [...rosterStats]
            .filter(r => r.stats)
            .sort((a, b) => stat.getValue(b.stats) - stat.getValue(a.stats));
          const top5 = sorted.slice(0, 5);
          const fmtVal = (v: number) =>
            stat.key === 'FG' ? (v * 100).toFixed(1) + '%' : v.toFixed(1);

          return (
            <View key={stat.key} style={s.card}>
              <Text style={s.sectionLabel}>{stat.label}</Text>
              <View style={{ marginTop: 12, gap: 1 }}>
                {top5.map(({ player, stats }, i) => (
                  <PlayerStatRowComp
                    key={player.PlayerID}
                    player={player}
                    stats={stats}
                    statValue={fmtVal(stat.getValue(stats))}
                    teamKey={teamKey}
                    isFirst={i === 0}
                    onPress={() => navigation.navigate('PlayerProfile', { playerId: player.PlayerID })}
                  />
                ))}
              </View>
              {sorted.length > 5 && (
                <TouchableOpacity
                  style={s.viewAllBtn}
                  onPress={() => setViewAllStat({ key: stat.key, label: stat.label, players: sorted, fmtVal, getValue: stat.getValue })}
                >
                  <Text style={s.viewAllBtnText}>View All ({sorted.length})</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        };

        return (
          <>
            {/* Full-page modal for View All */}
            <Modal visible={!!viewAllStat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewAllStat(null)}>
              {viewAllStat && <ViewAllModal stat={viewAllStat} teamKey={teamKey} onClose={() => setViewAllStat(null)} onPlayer={(id) => { setViewAllStat(null); navigation.navigate('PlayerProfile', { playerId: id }); }} />}
            </Modal>
            {STAT_CATEGORIES.map(stat => renderStatCard(stat))}
          </>
        );
      })()}
    </ScrollView>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TeamScreen({ route }: Props) {
  const { teamKey, teamCity, teamName } = route.params;
  const [activeTab, setActiveTab]   = useState<Tab>('Overview');
  const [standings, setStandings]   = useState<Standing[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(true);

  useEffect(() => {
    NBAService.getStandings()
      .then(res => { setStandings(res.standings ?? []); setLoadingStandings(false); })
      .catch(() => setLoadingStandings(false));
  }, []);

  const standing = standings.find(t => t.Key === teamKey) ?? null;
  const color    = teamColors[teamKey] ?? '#555';

  return (
    <SafeAreaView style={s.container}>
      {/* Team header */}
      <View style={[s.header, { borderBottomColor: color }]}>
        <TeamLogo abbrev={teamKey} size={56} />
        <View style={{ marginLeft: 14 }}>
          <Text style={s.teamCity}>{teamCity}</Text>
          <Text style={s.teamName}>{teamName}</Text>
          {standing && (
            <Text style={s.teamRecord}>{standing.Wins}–{standing.Losses} · {standing.Conference === 'Eastern' ? 'East' : 'West'} #{standing.ConferenceRank}</Text>
          )}
        </View>
      </View>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {loadingStandings && activeTab === 'Overview' ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === 'Overview'   && <OverviewTab teamKey={teamKey} standing={standing} allStandings={standings} />}
          {activeTab === 'Roster'     && <RosterTab   teamKey={teamKey} />}
          {activeTab === 'Matches'    && <MatchesTab  teamKey={teamKey} />}
          {activeTab === 'Stats'      && <StatsTab teamKey={teamKey} />}
          {activeTab === 'Contracts'  && <ContractsTab teamKey={teamKey} />}
          {activeTab === 'Draft'      && <DraftTab    teamKey={teamKey} />}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#141414' },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 3 },
  teamCity:       { color: '#888', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  teamName:       { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  teamRecord:     { color: '#aaa', fontSize: 13, marginTop: 4 },

  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  tabBtn:         { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  tabLabel:       { color: '#555', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  tabUnderline:   { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#fff', borderRadius: 1 },

  // ── shared card / row language ──────────────────────────────────────────────
  card:           { backgroundColor: '#1e1e1e', borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  sectionLabel:   { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle:   { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  divider:        { height: 1, backgroundColor: '#2a2a2a', marginVertical: 4 },
  emptyText:      { color: '#555', fontSize: 14 },

  teamAbbr:       { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowTeamName:    { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 1 },
  winnerText:     { color: '#fff', fontWeight: '800' },
  loserText:      { color: '#555' },

  // ── team form ────────────────────────────────────────────────────────────────
  wlDot:          { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  formScore:      { color: '#555', fontSize: 10, fontWeight: '500' },

  // ── next match ───────────────────────────────────────────────────────────────
  matchupRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  atLabel:        { color: '#555', fontSize: 11, fontWeight: '600' },
  matchDateText:  { color: '#555', fontSize: 12, fontWeight: '500' },

  // ── season stats / lineup (PlayerScreen-matched) ─────────────────────────────
  toggleBtn:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#242424' },
  toggleBtnActive:    { backgroundColor: '#fff' },
  toggleBtnText:      { color: '#777', fontSize: 11, fontWeight: '600' },
  toggleBtnTextActive:{ color: '#000', fontWeight: '700' },

  bigStatBox:     { flex: 1, alignItems: 'center', paddingVertical: 12 },
  bigStatVal:     { color: '#fff', fontSize: 26, fontWeight: '800' },
  bigStatLbl:     { color: '#555', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  psRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  psLabel:        { flex: 1, color: '#aaa', fontSize: 14, fontWeight: '500' },
  psValue:        { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── player stats table ────────────────────────────────────────────────────────
  psrRow:         { flexDirection: 'row', alignItems: 'center' },
  psrName:        { width: 80 },
  psrCell:        { flex: 1, alignItems: 'center' },
  psrHeader:      { color: '#555', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  psrStat:        { flex: 1, color: '#ccc', fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // ── player stat cards ──────────────────────────────────────────────────────────
  playerStatRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 10 },
  playerStatImg:    { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: '#2a2a2a', flexShrink: 0 },
  playerStatNameCol:{ flex: 1 },
  playerStatName:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  playerStatPos:    { color: '#555', fontSize: 10, marginTop: 2 },
  playerStatValue:  { color: '#6ee7b7', fontSize: 14, fontWeight: '700', minWidth: 50, textAlign: 'right' },
  viewAllBtn:       { marginTop: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2a2a2a', alignItems: 'center' },
  viewAllBtnText:   { color: '#888', fontSize: 11, fontWeight: '600' },

  // ── standings ────────────────────────────────────────────────────────────────
  standRow:           { flexDirection: 'row', alignItems: 'center' },
  standRowHighlight:  { backgroundColor: '#252525', borderRadius: 8, paddingHorizontal: 4, marginHorizontal: -4 },
  standRank:          { width: 24, color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  standTeam:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  standStat:          { width: 40, color: '#888', fontSize: 11, textAlign: 'center' },

  // ── roster tab ───────────────────────────────────────────────────────────────
  rosterRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rosterCell:     { width: 44, color: '#888', fontSize: 11, textAlign: 'center' },

  // ── matches tab ──────────────────────────────────────────────────────────────
  chip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#242424' },
  chipActive:     { backgroundColor: '#fff' },
  chipText:       { color: '#777', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#000' },

  matchRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  matchDate:      { color: '#555', fontSize: 11, width: 48 },
  matchOpp:       { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  matchScore:     { fontSize: 13, fontWeight: '700' },
  matchTime:      { color: '#888', fontSize: 12 },

  winner:         { color: '#4caf50' },
  loser:          { color: '#e05a5a' },
});

const ct = StyleSheet.create({
  // cap bar
  capBarBg:    { height: 5, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' },
  capBarFill:  { height: '100%', borderRadius: 3 },
  capLabel:    { color: '#555', fontSize: 10, fontWeight: '500' },

  // header row
  headerRow:   { height: 36, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  headerText:  { color: '#555', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  yearHeader:       { alignItems: 'center', justifyContent: 'center' },
  yearHeaderActive: { borderBottomWidth: 2, borderBottomColor: '#fff' },
  headerTextActive: { color: '#fff' },

  // name column rows
  nameRow:     { height: 52, paddingLeft: 10, paddingRight: 6,
                 borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  playerName:  { color: '#fff', fontSize: 10, fontWeight: '700' },
  playerPos:   { color: '#555', fontSize: 10, fontWeight: '600', marginTop: 2 },

  // salary cells
  cell:        { height: 52, alignItems: 'center', justifyContent: 'center',
                 borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  salary:      { color: '#fff', fontSize: 12, fontWeight: '700' },
  optTag:      { fontSize: 9, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

  // UFA badge
  ufaBadge:    { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#5a2a2a',
                 borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  ufaText:     { color: '#e05a5a', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // 2-WAY badge
  twoBadge:    { backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: '#3a3a6a',
                 borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  twoText:     { color: '#a78bfa', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

const dt = StyleSheet.create({
  yearHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 16, paddingVertical: 10 },
  yearText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  yearCount:   { color: '#555', fontSize: 12 },
  colHeader:   { color: '#555', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  pickBadge:   { width: 30, alignItems: 'center' },
  pickNum:     { color: '#555', fontSize: 12, fontWeight: '700' },

  name:        { color: '#fff', fontSize: 13, fontWeight: '600' },
  meta:        { color: '#555', fontSize: 10, fontWeight: '500', marginTop: 2 },

  statsCol:    { width: 36, alignItems: 'center' },
  statVal:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  statLbl:     { color: '#555', fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
});
