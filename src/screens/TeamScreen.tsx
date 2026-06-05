import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService, Standing, Game, Player } from '../api/nbaService';
import { teamLogoUri, teamColors } from '../utils/teamMappings';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamProfile'>;
type Tab = 'Overview' | 'Roster' | 'Matches' | 'Stats';

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
  const TABS: Tab[] = ['Overview', 'Roster', 'Matches', 'Stats'];
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

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ teamKey, standing, allStandings }: {
  teamKey: string; standing: Standing | null; allStandings: Standing[];
}) {
  const [schedule, setSchedule] = useState<Game[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    NBAService.getTeamSchedule(teamKey)
      .then(res => { setSchedule(res.games ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamKey]);

  const played = schedule.filter(g => isGameFinal(g)).slice(-5);
  const next   = schedule.find(g => isGameScheduled(g) || (!isGameFinal(g) && g.Status !== 'InProgress'));

  const color  = teamColors[teamKey] ?? '#555';
  const confStandings = allStandings
    .filter(t => t.Conference === standing?.Conference)
    .sort((a, b) => b.Percentage - a.Percentage);
  const confLeader = confStandings[0];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>

      {/* Record card */}
      {standing && (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { label: 'Record',    value: `${standing.Wins}-${standing.Losses}` },
              { label: 'Conf Rank', value: `#${standing.ConferenceRank}` },
              { label: 'PCT',       value: standing.Percentage.toFixed(3) },
              { label: 'GB',        value: calcGB(confLeader, standing) },
            ].map(({ label, value }) => (
              <View key={label} style={{ alignItems: 'center' }}>
                <Text style={s.statVal}>{value}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { label: 'Home',    value: `${standing.HomeWins}-${standing.HomeLosses}` },
              { label: 'Away',    value: `${standing.AwayWins}-${standing.AwayLosses}` },
              { label: 'L10',     value: `${standing.LastTenWins}-${standing.LastTenLosses}` },
              { label: 'Streak',  value: standing.StreakDescription ?? '—' },
            ].map(({ label, value }) => (
              <View key={label} style={{ alignItems: 'center' }}>
                <Text style={s.statVal}>{value}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Next game */}
      {next && (
        <View>
          <Text style={s.sectionTitle}>Next Game</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <TeamLogo abbrev={next.AwayTeam} size={40} />
                <Text style={s.gameTeamAbbr}>{next.AwayTeam}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.vsText}>vs</Text>
                {next.DateTime && (
                  <Text style={s.gameTime}>
                    {new Date(next.DateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                )}
                {next.DateTime && (
                  <Text style={s.gameTime}>
                    {new Date(next.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <TeamLogo abbrev={next.HomeTeam} size={40} />
                <Text style={s.gameTeamAbbr}>{next.HomeTeam}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Last 5 games */}
      {loading ? <ActivityIndicator color="#fff" /> : played.length > 0 && (
        <View>
          <Text style={s.sectionTitle}>Last {played.length} Games</Text>
          <View style={s.card}>
            {played.map((g, i) => {
              const isHome  = g.HomeTeam === teamKey;
              const opp     = isHome ? g.AwayTeam : g.HomeTeam;
              const myScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
              const oppScore= isHome ? g.AwayTeamScore : g.HomeTeamScore;
              const won     = myScore > oppScore;
              return (
                <View key={g.GameID} style={[s.gameRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#2a2a2a', marginTop: 10, paddingTop: 10 }]}>
                  <Text style={[s.wlBadge, won ? s.wBadge : s.lBadge]}>{won ? 'W' : 'L'}</Text>
                  <TeamLogo abbrev={opp} size={22} />
                  <Text style={s.gameOpp}>{isHome ? 'vs' : '@'} {opp}</Text>
                  <Text style={[s.gameScore, won ? s.winner : s.loser]}>{myScore} – {oppScore}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

// ── Roster Tab ────────────────────────────────────────────────────────────────

function calcAge(birthDate: string): string {
  if (!birthDate) return '—';
  const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
  return String(age);
}

function PlayerRow({ player: p, teamKey, alt, nbaIdMap }: {
  player: Player; teamKey: string; alt: boolean; nbaIdMap: Record<number, number>;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const nbaid    = nbaIdMap[p.PlayerID];
  const photoUri = nbaid
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaid}.png`
    : p.PhotoUrl ?? null;

  return (
    <View style={[s.rosterRow, alt && { backgroundColor: '#191919' }]}>
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
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>{p.FirstName} {p.LastName}</Text>
      </View>
      <Text style={s.rosterCell}>{p.Position ?? '—'}</Text>
      <Text style={s.rosterCell}>{p.Height ?? '—'}</Text>
      <Text style={s.rosterCell}>{p.Weight ?? '—'}</Text>
      <Text style={s.rosterCell}>{calcAge(p.BirthDate)}</Text>
    </View>
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

// ── Stats Tab (placeholder) ───────────────────────────────────────────────────

function StatsTab() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#555', fontSize: 15 }}>Stats coming soon</Text>
    </View>
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
          {activeTab === 'Overview' && <OverviewTab teamKey={teamKey} standing={standing} allStandings={standings} />}
          {activeTab === 'Roster'   && <RosterTab   teamKey={teamKey} />}
          {activeTab === 'Matches'  && <MatchesTab  teamKey={teamKey} />}
          {activeTab === 'Stats'    && <StatsTab />}
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
  tabBtn:         { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel:       { color: '#555', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  tabUnderline:   { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#fff', borderRadius: 1 },

  sectionTitle:   { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },

  card:           { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16 },
  statVal:        { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  statLabel:      { color: '#666', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  gameRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameOpp:        { flex: 1, color: '#ccc', fontSize: 13, fontWeight: '500' },
  gameScore:      { fontSize: 13, fontWeight: '700' },
  gameTeamAbbr:   { color: '#aaa', fontSize: 12, fontWeight: '700' },
  vsText:         { color: '#555', fontSize: 16, fontWeight: '700' },
  gameTime:       { color: '#888', fontSize: 11, textAlign: 'center' },
  wlBadge:        { width: 22, height: 22, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  wBadge:         { backgroundColor: '#1a3a1a' },
  lBadge:         { backgroundColor: '#3a1a1a' },
  winner:         { color: '#4caf50' },
  loser:          { color: '#e05a5a' },

  rosterRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rosterCell:     { width: 44, color: '#888', fontSize: 11, textAlign: 'center' },

  chip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#242424' },
  chipActive:     { backgroundColor: '#fff' },
  chipText:       { color: '#777', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#000' },

  matchRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  matchDate:      { color: '#555', fontSize: 11, width: 48 },
  matchOpp:       { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  matchScore:     { fontSize: 13, fontWeight: '700' },
  matchTime:      { color: '#888', fontSize: 12 },
});
