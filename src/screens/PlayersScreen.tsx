import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Image, ActivityIndicator, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService } from '../api/nbaService';
import { teamLogoUri, teamColors } from '../utils/teamMappings';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STAT_CATEGORIES = [
  { key: 'Points',               label: 'Points',      fmt: (v: number) => v.toFixed(1) },
  { key: 'Rebounds',             label: 'Rebounds',    fmt: (v: number) => v.toFixed(1) },
  { key: 'Assists',              label: 'Assists',     fmt: (v: number) => v.toFixed(1) },
  { key: 'Steals',               label: 'Steals',      fmt: (v: number) => v.toFixed(1) },
  { key: 'BlockedShots',         label: 'Blocks',      fmt: (v: number) => v.toFixed(1) },
  { key: 'FieldGoalsPercentage', label: 'FG%',         fmt: (v: number) => (v * 100).toFixed(1) + '%' },
  { key: 'ThreePointersPercentage', label: '3P%',      fmt: (v: number) => (v * 100).toFixed(1) + '%' },
  { key: 'FreeThrowsPercentage', label: 'FT%',         fmt: (v: number) => (v * 100).toFixed(1) + '%' },
  { key: 'Minutes',              label: 'Minutes',     fmt: (v: number) => v.toFixed(1) },
  { key: 'Turnovers',            label: 'Turnovers',   fmt: (v: number) => v.toFixed(1) },
];

const SEASONS = [2025,2024,2023,2022,2021,2020,2019,2018,2017,2016];

function positionGroup(pos: string): string {
  if (!pos) return 'Other';
  // NBA.com lists the primary position first in hybrid labels (e.g. "Forward-Center" → primarily a Forward)
  const primary = pos.split('-')[0].trim().toUpperCase();
  if (primary.startsWith('G')) return 'Guard';
  if (primary.startsWith('F')) return 'Forward';
  if (primary.startsWith('C')) return 'Center';
  return 'Other';
}

const POS_FILTERS = ['All', 'Guard', 'Forward', 'Center'];

function PlayerPhoto({ player, size = 36 }: { player: any; size?: number }) {
  const [failed, setFailed] = useState(false);
  const color = teamColors[player.Team] ?? '#333';
  if (failed || !player.PhotoUrl) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: size * 0.28, fontWeight: '800' }}>
          {player.LastName?.slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: player.PhotoUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ── Player Stat Row (shared by top-5 cards and the View All modal) ────────────
function PlayerStatRow({ player, statValue, isFirst, onPress }: {
  player: any; statValue: string; isFirst: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.playerStatRow, !isFirst && { borderTopWidth: 1, borderTopColor: '#1e1e1e' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <PlayerPhoto player={player} size={40} />
      <View style={s.playerStatNameCol}>
        <Text style={s.playerStatName} numberOfLines={1}>{player.FirstName} {player.LastName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Image source={{ uri: teamLogoUri(player.Team) }} style={{ width: 13, height: 13 }} resizeMode="contain" />
          <Text style={s.playerStatPos}>{player.Team} · {player.Position}</Text>
        </View>
      </View>
      <Text style={s.playerStatValue}>{statValue}</Text>
    </TouchableOpacity>
  );
}

// ── View All Modal ─────────────────────────────────────────────────────────────
function ViewAllModal({ label, players, onClose, onPlayer }: {
  label: string;
  players: { p: any; val: string }[];
  onClose: () => void;
  onPlayer: (p: any) => void;
}) {
  const [posFilter, setPosFilter] = useState('All');

  const filtered = posFilter === 'All'
    ? players
    : players.filter(({ p }) => positionGroup(p.Position) === posFilter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#141414' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>{label}</Text>
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

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {filtered.map(({ p, val }, i) => (
          <PlayerStatRow key={p.PlayerID} player={p} statValue={val} isFirst={i === 0} onPress={() => onPlayer(p)} />
        ))}
        {filtered.length === 0 && (
          <Text style={{ color: '#555', fontSize: 14, textAlign: 'center', marginTop: 40 }}>No players at this position</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PlayersScreen() {
  const navigation = useNavigation<Nav>();
  const [players, setPlayers]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [season, setSeason]         = useState(2025);
  const [seasonType, setSeasonType] = useState<'regular' | 'playoffs'>('regular');
  const [showPicker, setShowPicker] = useState(false);
  const [viewAll, setViewAll]       = useState<{ label: string; players: { p: any; val: string }[] } | null>(null);

  useEffect(() => {
    setLoading(true);
    setPlayers([]);
    NBAService.getLeaguePlayerStats(season, seasonType)
      .then(res => setPlayers(res.players ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [season, seasonType]);

  const navigatePlayer = (p: any) => navigation.navigate('PlayerProfile', {
    playerId: p.PlayerID,
    fallback: { name: `${p.FirstName} ${p.LastName}`, team: p.Team, position: p.Position, photoUrl: p.PhotoUrl },
  });

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Players</Text>
      </View>

      {/* Season picker + Regular/Playoffs toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e1e1e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#2a2a2a', alignSelf: 'flex-start' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{season}-{String(season+1).slice(2)}</Text>
          <Text style={{ color: '#6ee7b7', fontSize: 11 }}>▼</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSeasonType(t => t === 'regular' ? 'playoffs' : 'regular')}
          style={[s.toggleBtn, seasonType === 'playoffs' && s.toggleBtnActive]}
        >
          <Text style={[s.toggleBtnText, seasonType === 'playoffs' && s.toggleBtnTextActive]}>
            {seasonType === 'playoffs' ? 'Playoffs' : 'Regular Season'}
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
            {SEASONS.map(yr => (
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
        {viewAll && (
          <ViewAllModal
            label={viewAll.label}
            players={viewAll.players}
            onClose={() => setViewAll(null)}
            onPlayer={(p) => { setViewAll(null); navigatePlayer(p); }}
          />
        )}
      </Modal>

      {/* Stat cards */}
      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : players.length === 0 ? (
        <Text style={{ color: '#555', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
          {seasonType === 'playoffs' ? 'No playoff data for this season' : 'No player data'}
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
          {(() => {
            // Qualifying games threshold — keeps small-sample outliers (e.g. 75% FG on 2 games)
            // off the leaderboards, same way NBA.com requires a minimum games played to qualify.
            const maxGames = players.reduce((m, p) => Math.max(m, p.stats?.Games ?? 0), 0);
            const minGames = Math.max(5, Math.round(maxGames * 0.5));
            return STAT_CATEGORIES.map(cat => {
            const sorted = [...players]
              .filter(p => p.stats?.[cat.key] != null && p.stats[cat.key] > 0 && (p.stats?.Games ?? 0) >= minGames)
              .sort((a, b) => b.stats[cat.key] - a.stats[cat.key]);
            const top5 = sorted.slice(0, 5);
            const allPlayers = sorted.map(p => ({ p, val: cat.fmt(p.stats[cat.key]) }));

            return (
              <View key={cat.key} style={s.card}>
                <Text style={s.cardLabel}>{cat.label}</Text>
                <View style={{ marginTop: 12 }}>
                  {top5.map((p, i) => (
                    <PlayerStatRow
                      key={p.PlayerID}
                      player={p}
                      statValue={cat.fmt(p.stats[cat.key])}
                      isFirst={i === 0}
                      onPress={() => navigatePlayer(p)}
                    />
                  ))}
                </View>
                {sorted.length > 5 && (
                  <TouchableOpacity style={s.viewAllBtn} onPress={() => setViewAll({ label: cat.label, players: allPlayers })}>
                    <Text style={s.viewAllBtnText}>View All ({sorted.length})</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
            });
          })()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header:    { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:     { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  card:      { backgroundColor: '#1e1e1e', borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  cardLabel: { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  toggleBtn:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#242424' },
  toggleBtnActive:    { backgroundColor: '#fff' },
  toggleBtnText:      { color: '#777', fontSize: 11, fontWeight: '600' },
  toggleBtnTextActive:{ color: '#000', fontWeight: '700' },

  playerStatRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 10 },
  playerStatNameCol:{ flex: 1 },
  playerStatName:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  playerStatPos:    { color: '#555', fontSize: 11 },
  playerStatValue:  { color: '#fff', fontSize: 14, fontWeight: '700', minWidth: 50, textAlign: 'right' },
  viewAllBtn:       { marginTop: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a', alignItems: 'center' },
  viewAllBtnText:   { color: '#6ee7b7', fontSize: 13, fontWeight: '600' },
});
