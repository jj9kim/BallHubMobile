import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  Image, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

function calcAge(birthDate: string): string {
  if (!birthDate) return '—';
  return String(Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000)));
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

function PlayerPhoto({ player, nbaId, size = 90 }: { player: Player; nbaId?: number; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = nbaId
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`
    : player.PhotoUrl;
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
  const date   = log.Day ? new Date(log.Day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  const won    = log.PlusMinus > 0;
  const result = log.PlusMinus > 0 ? 'W' : 'L';

  return (
    <View style={[s.logRow, isAlt && { backgroundColor: '#191919' }]}>
      <Text style={s.logDate}>{date}</Text>
      <Text style={s.logMatchup}>{log.Opponent ?? '—'}</Text>
      <Text style={[s.logResult, won ? s.winText : s.loseText]}>{result}</Text>
      <Text style={s.logStat}>{log.Points ?? '—'}</Text>
      <Text style={s.logStat}>{log.Rebounds ?? '—'}</Text>
      <Text style={s.logStat}>{log.Assists ?? '—'}</Text>
      <Text style={s.logMin}>{log.Minutes != null ? fmtStat(log.Minutes, 0) : '—'}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PlayerScreen({ route }: Props) {
  const { playerId } = route.params;

  const [player,   setPlayer]   = useState<Player | null>(null);
  const [stats,    setStats]    = useState<PlayerStats | null>(null);
  const [logs,     setLogs]     = useState<PlayerGameStats[]>([]);
  const [nbaId,    setNbaId]    = useState<number | undefined>(undefined);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Stats');

  useEffect(() => {
    Promise.all([
      NBAService.getPlayerById(playerId),
      NBAService.getPlayerSeasonStats(playerId),
      NBAService.getPlayerGameLogs(playerId),
      NBAService.getNbaIdMap(),
    ]).then(([pRes, sRes, lRes, mapRes]) => {
      setPlayer(pRes.player);
      setStats(sRes.stats ?? null);
      setLogs((lRes.logs ?? []).reverse());
      setNbaId(mapRes.map?.[playerId]);
    }).catch(() => {}).finally(() => setLoading(false));
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
        <PlayerPhoto player={player} nbaId={nbaId} size={72} />
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
            <Text style={s.sectionLabel}>Season Averages</Text>
            {stats ? (
              <View style={{ marginTop: 14 }}>
                {/* Big 3 */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {[
                    { val: fmtStat(stats.Points),    label: 'PTS' },
                    { val: fmtStat(stats.Rebounds),  label: 'REB' },
                    { val: fmtStat(stats.Assists),   label: 'AST' },
                  ].map(({ val, label }, i) => (
                    <View key={label} style={[s.bigStatBox, i > 0 && { borderLeftWidth: 1, borderLeftColor: '#2a2a2a' }]}>
                      <Text style={s.bigStatVal}>{val}</Text>
                      <Text style={s.bigStatLbl}>{label}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.divider} />
                <StatRow label="Steals"          value={fmtStat(stats.Steals)} />
                <View style={s.divider} />
                <StatRow label="Blocks"          value={fmtStat(stats.BlockedShots)} />
                <View style={s.divider} />
                <StatRow label="Turnovers"       value={fmtStat(stats.Turnovers)} />
                <View style={s.divider} />
                <StatRow label="Field Goal %"    value={fmtPct(stats.FieldGoalsPercentage)} />
                <View style={s.divider} />
                <StatRow label="3-Point %"       value={fmtPct(stats.ThreePointersPercentage)} />
                <View style={s.divider} />
                <StatRow label="Free Throw %"    value={fmtPct(stats.FreeThrowsPercentage)} />
                <View style={s.divider} />
                <StatRow label="True Shooting %" value={fmtPct(stats.TrueShootingPercentage)} />
                <View style={s.divider} />
                <StatRow label="Games Played"    value={String(stats.Games ?? '—')} />
                <View style={s.divider} />
                <StatRow label="Minutes"         value={fmtStat(stats.Minutes)} />
              </View>
            ) : (
              <Text style={[s.emptyText, { marginTop: 12 }]}>No stats available</Text>
            )}
          </View>

          {/* Bio */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>Profile</Text>
            <View style={{ marginTop: 14 }}>
              {player.BirthDate    && <><StatRow label="Age"        value={calcAge(player.BirthDate)} /><View style={s.divider} /></>}
              {player.BirthCountry && <><StatRow label="Country"    value={player.BirthCountry} /><View style={s.divider} /></>}
              {player.College      && <><StatRow label="College"    value={player.College} /><View style={s.divider} /></>}
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

  winText:        { color: '#4caf50' },
  loseText:       { color: '#e05a5a' },

  logRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  logDate:        { width: 52, color: '#888', fontSize: 11 },
  logMatchup:     { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  logResult:      { width: 24, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  logStat:        { width: 34, color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  logMin:         { width: 34, color: '#888', fontSize: 11, textAlign: 'center' },
});
