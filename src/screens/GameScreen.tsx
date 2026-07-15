import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator,
  ScrollView, TouchableOpacity, Image, FlatList, Dimensions,
  Modal, Pressable,
} from 'react-native';
import Svg, { Line, Circle, Rect, Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<RootStackParamList>;
import type { RootStackParamList } from '../navigation';
import { NBAService } from '../api/nbaService';
import { teamColors, teamSecondaryColors, teamFullNames, teamLogoUri, teamCities, teamNicknames } from '../utils/teamMappings';
import { PlayoffBracket, isEastSeries } from '../components/PlayoffBracket';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

const TABS = ['Facts', 'Lineup', 'Table', 'Stats'] as const;
type Tab = typeof TABS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(val: number): string {
  return val > 0 ? `${Math.round(val)}%` : '0%';
}

function fmt(val: number, decimals = 0): string {
  return val != null ? val.toFixed(decimals) : '0';
}

// ── Team Logo ─────────────────────────────────────────────────────────────────

function TeamLogo({ abbrev, size = 40 }: { abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[logo.fallback, { width: size, height: size, backgroundColor: teamColors[abbrev] ?? '#555' }]}>
        <Text style={[logo.fallbackText, { fontSize: size * 0.3 }]}>{abbrev}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: teamLogoUri(abbrev) }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

// ── Sliding Tab Bar ───────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={tab.bar}>
      {TABS.map(t => (
        <TouchableOpacity key={t} style={tab.btn} onPress={() => onChange(t)}>
          <Text style={[tab.label, active === t && tab.labelActive]}>{t}</Text>
          {active === t && <View style={tab.underline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Stat Bar Row (Facts tab) ──────────────────────────────────────────────────

function StatBar({
  label, v1, v2, color1, color2,
  format = (v: number) => String(Math.round(v)),
}: {
  label: string; v1: number; v2: number;
  color1: string; color2: string;
  format?: (v: number) => string;
}) {
  const total = v1 + v2;
  const pct1 = total > 0 ? (v1 / total) * 100 : 50;
  const pct2 = 100 - pct1;
  return (
    <View style={facts.row}>
      <Text style={facts.val}>{format(v1)}</Text>
      <View style={facts.mid}>
        <Text style={facts.statLabel}>{label}</Text>
        <View style={facts.barWrap}>
          <View style={[facts.barLeft, { width: `${pct1}%`, backgroundColor: color1 }]} />
          <View style={[facts.barRight, { width: `${pct2}%`, backgroundColor: color2 }]} />
        </View>
      </View>
      <Text style={[facts.val, { textAlign: 'right' }]}>{format(v2)}</Text>
    </View>
  );
}

// ── Facts Tab ─────────────────────────────────────────────────────────────────

function FactsTab({ home, away, homeTeam, awayTeam }: { home: any; away: any; homeTeam: string; awayTeam: string }) {
  if (!home || !away) return <Text style={s.empty}>No team stats available</Text>;

  // Parse hex color to RGB
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.slice(0,2), 16),
      g: parseInt(h.slice(2,4), 16),
      b: parseInt(h.slice(4,6), 16),
    };
  };
  // Euclidean distance between two colors
  const colorDistance = (a: string, b: string) => {
    const c1 = hexToRgb(a), c2 = hexToRgb(b);
    return Math.sqrt(Math.pow(c1.r-c2.r,2) + Math.pow(c1.g-c2.g,2) + Math.pow(c1.b-c2.b,2));
  };

  const homeColor  = teamColors[homeTeam] ?? '#5a8ae0';
  const awayPrimary = teamColors[awayTeam] ?? '#e05a5a';
  // Use secondary if colors are too similar (distance < 60 out of 441 max)
  const awayColor  = colorDistance(awayPrimary, homeColor) < 60
    ? (teamSecondaryColors[awayTeam] ?? '#aaaaaa')
    : awayPrimary;
  const bar = (label: string, v1: number, v2: number, format?: (v: number) => string) => (
    <StatBar label={label} v1={v1} v2={v2} color1={awayColor} color2={homeColor} format={format} />
  );

  return (
    <ScrollView contentContainerStyle={facts.container}>
      {bar('Points',    away.Points,               home.Points)}
      {bar('FG',        away.FieldGoalsMade,        home.FieldGoalsMade)}
      {bar('FG%',       away.FieldGoalsPercentage,  home.FieldGoalsPercentage,  v => `${Math.round(v)}%`)}
      {bar('3PM',       away.ThreePointersMade,     home.ThreePointersMade)}
      {bar('3P%',       away.ThreePointersPercentage, home.ThreePointersPercentage, v => `${Math.round(v)}%`)}
      {bar('FT',        away.FreeThrowsMade,        home.FreeThrowsMade,        v => `${Math.round(v)}/${Math.round(v === away.FreeThrowsMade ? away.FreeThrowsAttempted : home.FreeThrowsAttempted)}`)}
      {bar('Rebounds',  away.Rebounds,              home.Rebounds)}
      {bar('Off Reb',   away.OffensiveRebounds,     home.OffensiveRebounds)}
      {bar('Def Reb',   away.DefensiveRebounds,     home.DefensiveRebounds)}
      {bar('Assists',   away.Assists,               home.Assists)}
      {bar('Steals',    away.Steals,                home.Steals)}
      {bar('Blocks',    away.BlockedShots,          home.BlockedShots)}
      {bar('Turnovers', away.Turnovers,             home.Turnovers)}
      {bar('Fouls',     away.PersonalFouls,         home.PersonalFouls)}
    </ScrollView>
  );
}

// ── Player Stats Modal ────────────────────────────────────────────────────────

function PlayerModal({ player, nbaIdMap, onClose }: {
  player: any;
  nbaIdMap: Record<number, number>;
  onClose: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const nbaid = nbaIdMap[player.PlayerID];
  const photoUri = player.PhotoUrl ?? (nbaid ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaid}.png` : null);
  const rating = calculateRating(player);
  const color  = teamColors[player.Team] ?? '#555';

  const statRows = [
    { label: 'Points',    value: Math.round(player.Points ?? 0) },
    { label: 'Rebounds',  value: Math.round(player.Rebounds ?? 0) },
    { label: 'Assists',   value: Math.round(player.Assists ?? 0) },
    { label: 'Steals',    value: Math.round(player.Steals ?? 0) },
    { label: 'Blocks',    value: Math.round(player.BlockedShots ?? 0) },
    { label: 'Turnovers', value: Math.round(player.Turnovers ?? 0) },
    { label: 'FG',        value: `${Math.round(player.FieldGoalsMade ?? 0)}/${Math.round(player.FieldGoalsAttempted ?? 0)}` },
    { label: 'FG%',       value: `${Math.round(player.FieldGoalsPercentage ?? 0)}%` },
    { label: '3PM',       value: `${Math.round(player.ThreePointersMade ?? 0)}/${Math.round(player.ThreePointersAttempted ?? 0)}` },
    { label: '3P%',       value: `${Math.round(player.ThreePointersPercentage ?? 0)}%` },
    { label: 'FT',        value: `${Math.round(player.FreeThrowsMade ?? 0)}/${Math.round(player.FreeThrowsAttempted ?? 0)}` },
    { label: 'Minutes',   value: player.Minutes ?? 0 },
    { label: '+/-',       value: `${(player.PlusMinus ?? 0) > 0 ? '+' : ''}${Math.round(player.PlusMinus ?? 0)}` },
    { label: 'PER',       value: (player.PlayerEfficiencyRating ?? 0).toFixed(1) },
    { label: 'USG%',      value: `${Math.round(player.UsageRatePercentage ?? 0)}%` },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={() => {}}>
          {/* Header */}
          <View style={modal.header}>
            {/* Photo */}
            <View style={[modal.photoRing, { borderColor: color }]}>
              {photoUri && !imgFailed ? (
                <Image source={{ uri: photoUri }} style={modal.photo} onError={() => setImgFailed(true)} />
              ) : (
                <View style={[modal.photoFallback, { backgroundColor: color }]}>
                  <Text style={modal.photoInitials}>
                    {player.Name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
              )}
            </View>
            <View style={modal.info}>
              <Text style={modal.playerName}>{player.Name}</Text>
              <Text style={modal.playerMeta}>{player.Team} · {player.Position} · {player.Minutes ?? 0} min</Text>
              <View style={[modal.ratingBadge, { backgroundColor: ratingColor(rating) }]}>
                <Text style={modal.ratingText}>{rating.toFixed(1)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
              <Text style={modal.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Stats grid */}
          <View style={modal.grid}>
            {statRows.map(({ label, value }) => (
              <View key={label} style={modal.statCell}>
                <Text style={modal.statVal}>{value}</Text>
                <Text style={modal.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Lineup Tab — Vertical Court ───────────────────────────────────────────────

// Position layout on a vertical half-court (0–100 coords, origin top-left)
// Away team occupies top half (y: 2–48), home team bottom half (y: 52–98)
const STARTER_POSITIONS: Record<string, { away: {x:number;y:number}; home: {x:number;y:number} }> = {
  PG: { away: { x: 50, y: 40 }, home: { x: 50, y: 60 } },
  SG: { away: { x: 22, y: 30 }, home: { x: 78, y: 70 } },
  SF: { away: { x: 78, y: 30 }, home: { x: 22, y: 70 } },
  PF: { away: { x: 30, y: 14 }, home: { x: 70, y: 86 } },
  C:  { away: { x: 50, y: 10 }, home: { x: 50, y: 90 } },
};

function ratingColor(r: number): string {
  if (r >= 7) return '#32c771';
  if (r >= 5) return '#f59e0b';
  return '#ef4444';
}

function calculateRating(p: any): number {
  // Simple rating from box score — mirrors your web formula loosely
  const pts = p.Points ?? 0;
  const reb = p.Rebounds ?? 0;
  const ast = p.Assists ?? 0;
  const stl = p.Steals ?? 0;
  const blk = p.BlockedShots ?? 0;
  const tov = p.Turnovers ?? 0;
  const mins = p.Minutes ?? 1;
  const raw = (pts * 1 + reb * 1.2 + ast * 1.5 + stl * 2 + blk * 2 - tov * 1.5) / mins * 4;
  return Math.min(10, Math.max(0, raw));
}

function CourtPlayer({
  player, x, y, courtW, courtH, nbaIdMap, onPress,
}: { player: any; x: number; y: number; courtW: number; courtH: number; nbaIdMap: Record<number,number>; onPress: (p: any) => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const left   = (x / 100) * courtW;
  const top    = (y / 100) * courtH;
  const rating = calculateRating(player);
  const nbaid  = nbaIdMap[player.PlayerID];
  const photoUri = player.PhotoUrl ?? (nbaid ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaid}.png` : null);

  return (
    <TouchableOpacity
      style={[court.playerPin, { left: left - 22, top: top - 26 }]}
      onPress={() => onPress(player)}
      activeOpacity={0.7}
    >
      <View style={[court.badge, { backgroundColor: ratingColor(rating) }]}>
        <Text style={court.badgeText}>{rating.toFixed(1)}</Text>
      </View>
      <View style={[court.photoRing, { borderColor: teamColors[player.Team] ?? '#888' }]}>
        {photoUri && !imgFailed ? (
          <Image source={{ uri: photoUri }} style={court.photo} onError={() => setImgFailed(true)} />
        ) : (
          <View style={[court.photoFallback, { backgroundColor: teamColors[player.Team] ?? '#555' }]}>
            <Text style={court.photoFallbackText}>{player.Name?.split(' ').pop()?.slice(0, 2)}</Text>
          </View>
        )}
      </View>
      <Text style={court.playerName} numberOfLines={1}>{player.Name?.split(' ').pop()}</Text>
    </TouchableOpacity>
  );
}

function BenchRow({ player, nbaIdMap, onPress }: { player: any; nbaIdMap: Record<number,number>; onPress: (p: any) => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const rating  = calculateRating(player);
  const color   = teamColors[player.Team] ?? '#555';
  const nbaid   = nbaIdMap[player.PlayerID];
  const photoUri = player.PhotoUrl ?? (nbaid ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaid}.png` : null);

  return (
    <TouchableOpacity style={lineup.playerRow} onPress={() => onPress(player)} activeOpacity={0.7}>
      {/* Photo */}
      <View style={[lineup.photo, { borderColor: color }]}>
        {photoUri && !imgFailed ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} onError={() => setImgFailed(true)} />
        ) : (
          <View style={[lineup.photoFallback, { backgroundColor: color }]}>
            <Text style={lineup.photoInitials}>{player.Name?.split(' ').pop()?.slice(0, 2)}</Text>
          </View>
        )}
      </View>
      {/* Name + position */}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={lineup.playerName} numberOfLines={1}>{player.Name}</Text>
        <Text style={lineup.positionText}>{player.Position ?? '–'}</Text>
      </View>
      {/* Rating */}
      <View style={[lineup.ratingBadge, { backgroundColor: ratingColor(rating) }]}>
        <Text style={lineup.ratingText}>{rating.toFixed(1)}</Text>
      </View>
      {/* Stats */}
      <View style={lineup.statCols}>
        <Text style={lineup.statVal}>{player.Minutes ?? 0}m</Text>
        <Text style={lineup.statVal}>{Math.round(player.Points ?? 0)}</Text>
        <Text style={lineup.statVal}>{Math.round(player.Rebounds ?? 0)}</Text>
        <Text style={lineup.statVal}>{Math.round(player.Assists ?? 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function LineupTab({ players, homeTeam, awayTeam }: { players: any[]; homeTeam: string; awayTeam: string }) {
  const screenW = Dimensions.get('window').width;
  const courtW  = screenW;
  const courtH  = courtW * 1.9;
  const [nbaIdMap, setNbaIdMap]       = useState<Record<number,number>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  useEffect(() => {
    NBAService.getNbaIdMap().then(res => setNbaIdMap(res.map ?? {})).catch(() => {});
  }, []); // aspect ratio similar to real court

  // Vertical court positions (x/y as % of court width/height)
  // Away = top half (y 2–48), Home = bottom half (y 52–98)
  const POS_MAP: Record<string, { away: {x:number;y:number}; home: {x:number;y:number} }> = {
    PG: { away: { x: 50, y: 38 }, home: { x: 50, y: 62 } },
    SG: { away: { x: 22, y: 28 }, home: { x: 78, y: 72 } },
    SF: { away: { x: 78, y: 28 }, home: { x: 22, y: 72 } },
    PF: { away: { x: 28, y: 14 }, home: { x: 72, y: 86 } },
    C:  { away: { x: 50, y:  8 }, home: { x: 50, y: 92 } },
  };
  const POS_ORDER = ['PG','SG','SF','PF','C'];

  const assignPositions = (team: string, isHome: boolean) => {
    const starters = players
      .filter(p => p.Team === team && p.Started === 1)
      .sort((a, b) => (b.Minutes ?? 0) - (a.Minutes ?? 0));
    const used = new Set<string>();
    const result: { player: any; x: number; y: number }[] = [];

    starters.forEach(p => {
      const pos = p.Position?.toUpperCase();
      if (pos && POS_MAP[pos] && !used.has(pos)) {
        result.push({ player: p, ...(isHome ? POS_MAP[pos].home : POS_MAP[pos].away) });
        used.add(pos);
      }
    });
    starters.forEach(p => {
      if (result.find(r => r.player.PlayerID === p.PlayerID)) return;
      const pos = POS_ORDER.find(po => !used.has(po)) ?? 'PG';
      result.push({ player: p, ...(isHome ? POS_MAP[pos].home : POS_MAP[pos].away) });
      used.add(pos);
    });
    return result;
  };

  const awayStarters = assignPositions(awayTeam, false);
  const homeStarters = assignPositions(homeTeam, true);

  const awayBench = players.filter(p => p.Team === awayTeam && p.Started !== 1 && (p.Minutes ?? 0) > 0)
                           .sort((a, b) => (b.Points ?? 0) - (a.Points ?? 0));
  const homeBench = players.filter(p => p.Team === homeTeam && p.Started !== 1 && (p.Minutes ?? 0) > 0)
                           .sort((a, b) => (b.Points ?? 0) - (a.Points ?? 0));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── Vertical Court ── */}
      <View style={{ width: courtW, height: courtH, backgroundColor: '#2c2c2c' }}>

        {/* SVG court markings */}
        <Svg width={courtW} height={courtH} style={{ position: 'absolute' }}>
          {/* Court outline */}
          <Rect x={2} y={2} width={courtW - 4} height={courtH - 4}
            stroke="#343434" strokeWidth={3} fill="none" />

          {/* Half-court line */}
          <Line x1={0} y1={courtH * 0.5} x2={courtW} y2={courtH * 0.5}
            stroke="#343434" strokeWidth={2} />

          {/* Center circle */}
          <Circle cx={courtW * 0.5} cy={courtH * 0.5}
            r={courtW * 0.13} stroke="#343434" strokeWidth={2} fill="none" />
          <Circle cx={courtW * 0.5} cy={courtH * 0.5}
            r={4} fill="#343434" />

          {/* ── TOP (away) ── */}
          {/* Paint */}
          <Rect x={courtW * 0.29} y={0}
            width={courtW * 0.42} height={courtH * 0.21}
            stroke="#343434" strokeWidth={2} fill="none" />
          {/* FT circle */}
          <Circle cx={courtW * 0.5} cy={courtH * 0.21}
            r={courtW * 0.11} stroke="#343434" strokeWidth={2} fill="none" />
          {/* Three-point line: corners + arc
              Corner lines run from top edge straight down to cornerY,
              then arc connects them sweeping downward.
              cornerX = 8% from each side, cornerY = 28% from top */}
          <Path
            d={`
              M ${courtW * 0.09} 0
              L ${courtW * 0.09} ${courtH * 0.20}
              A ${courtW * 0.43} ${courtW * 0.43} 0 0 0 ${courtW * 0.91} ${courtH * 0.20}
              L ${courtW * 0.91} 0
            `}
            stroke="#343434" strokeWidth={2} fill="none"
          />

          {/* ── BOTTOM (home) ── */}
          {/* Paint */}
          <Rect x={courtW * 0.29} y={courtH * 0.79}
            width={courtW * 0.42} height={courtH * 0.21}
            stroke="#343434" strokeWidth={2} fill="none" />
          {/* FT circle */}
          <Circle cx={courtW * 0.5} cy={courtH * 0.79}
            r={courtW * 0.11} stroke="#343434" strokeWidth={2} fill="none" />
          {/* Three-point line: corners + arc sweeping upward */}
          <Path
            d={`
              M ${courtW * 0.09} ${courtH}
              L ${courtW * 0.09} ${courtH * 0.80}
              A ${courtW * 0.43} ${courtW * 0.43} 0 0 1 ${courtW * 0.91} ${courtH * 0.80}
              L ${courtW * 0.91} ${courtH}
            `}
            stroke="#343434" strokeWidth={2} fill="none"
          />
        </Svg>

        {/* Player pins */}
        {[...awayStarters, ...homeStarters].map(({ player, x, y }) => (
          <CourtPlayer key={player.PlayerID} player={player} x={x} y={y}
            courtW={courtW} courtH={courtH}
            nbaIdMap={nbaIdMap} onPress={setSelectedPlayer} />
        ))}
      </View>

      {/* ── Bench — split by team ── */}
      {(awayBench.length > 0 || homeBench.length > 0) && (
        <>
          {/* Header */}
          <View style={[lineup.header, { marginTop: 16 }]}>
            <Text style={[lineup.headerLabel, { width: 32, marginRight: 10 }]} />
            <Text style={[lineup.headerLabel, { flex: 1 }]}>Player</Text>
            <Text style={[lineup.headerLabel, { width: 36 }]} />
            {['MIN','PTS','REB','AST'].map(h => (
              <Text key={h} style={lineup.headerStat}>{h}</Text>
            ))}
          </View>

          {/* Away bench */}
          {awayBench.length > 0 && (
            <>
              <View style={lineup.sectionHeader}>
                <TeamLogo abbrev={awayTeam} size={16} />
                <Text style={lineup.sectionTitle}>{awayTeam} Bench</Text>
              </View>
              {awayBench.map(p => <BenchRow key={p.PlayerID} player={p} nbaIdMap={nbaIdMap} onPress={setSelectedPlayer} />)}
            </>
          )}

          {/* Home bench */}
          {homeBench.length > 0 && (
            <>
              <View style={lineup.sectionHeader}>
                <TeamLogo abbrev={homeTeam} size={16} />
                <Text style={lineup.sectionTitle}>{homeTeam} Bench</Text>
              </View>
              {homeBench.map(p => <BenchRow key={p.PlayerID} player={p} nbaIdMap={nbaIdMap} onPress={setSelectedPlayer} />)}
            </>
          )}
        </>
      )}

      {/* Player modal */}
      {selectedPlayer && (
        <PlayerModal
          player={selectedPlayer}
          nbaIdMap={nbaIdMap}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </ScrollView>
  );
}

type StandingsView = 'All' | 'Conference' | 'Division';

function calcGamesBack(leader: any, team: any): string {
  if (leader.TeamID === team.TeamID) return '—';
  const gb = ((leader.Wins - team.Wins) + (team.Losses - leader.Losses)) / 2;
  return gb <= 0 ? '—' : gb.toFixed(1);
}

function StandingsTable({ teams, highlightTeams, rankOffset = 0 }: {
  teams: any[]; highlightTeams: string[]; rankOffset?: number;
}) {
  const navigation = useNavigation<Nav>();
  const leader = teams[0];
  return (
    <>
      <View style={table.headerRow}>
        <Text style={[table.cell, table.rankCol]}>#</Text>
        <Text style={[table.cell, table.teamCol, { textAlign: 'left' }]}>Team</Text>
        <Text style={table.cell}>W</Text>
        <Text style={table.cell}>L</Text>
        <Text style={table.cell}>PCT</Text>
        <Text style={table.cell}>GB</Text>
        <Text style={table.cell}>L10</Text>
        <Text style={table.cell}>STK</Text>
      </View>
      {teams.map((team, i) => {
        const highlighted = highlightTeams.includes(team.Key);
        const streak = team.StreakDescription ?? '';
        return (
          <TouchableOpacity
            key={team.TeamID}
            style={[table.row, highlighted && table.rowHighlighted]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('TeamProfile', {
              teamKey:  team.Key,
              teamCity: teamCities[team.Key]    ?? team.City ?? team.Key,
              teamName: teamNicknames[team.Key] ?? team.Name ?? team.Key,
            })}
          >
            <Text style={[table.cell, table.rankCol]}>{i + 1 + rankOffset}</Text>
            <View style={[table.cell, table.teamCol, { flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
              <TeamLogo abbrev={team.Key} size={16} />
              <Text style={table.teamName} numberOfLines={1}>{team.Name}</Text>
            </View>
            <Text style={table.cell}>{team.Wins}</Text>
            <Text style={table.cell}>{team.Losses}</Text>
            <Text style={table.cell}>{team.Percentage.toFixed(3)}</Text>
            <Text style={table.cell}>{leader ? calcGamesBack(leader, team) : '—'}</Text>
            <Text style={table.cell}>{team.LastTenWins}-{team.LastTenLosses}</Text>
            <Text style={[table.cell, streak.startsWith('W') ? table.win : table.loss]}>
              {streak}
            </Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

function TableTab({ highlightTeams, isPlayoffs, season }: { highlightTeams: string[]; isPlayoffs: boolean; season: number }) {
  if (isPlayoffs) return <PlayoffBracket highlightTeams={highlightTeams} season={season} />;
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<StandingsView>('Conference');

  useEffect(() => {
    NBAService.getStandings().then(res => {
      setStandings(res.standings ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />;

  const sorted = [...standings].sort((a, b) => b.Percentage - a.Percentage);
  const east   = sorted.filter(t => t.Conference === 'East' || t.Conference === 'Eastern').map((t, i) => ({ ...t, confRank: i + 1 }));
  const west   = sorted.filter(t => t.Conference === 'West' || t.Conference === 'Western').map((t, i) => ({ ...t, confRank: i + 1 }));

  // Division grouping
  const divisionOrder = ['Atlantic','Central','Southeast','Northwest','Pacific','Southwest'];
  const byDivision: Record<string, any[]> = {};
  standings.forEach(t => {
    if (!byDivision[t.Division]) byDivision[t.Division] = [];
    byDivision[t.Division].push(t);
  });
  divisionOrder.forEach(d => {
    if (byDivision[d]) byDivision[d].sort((a, b) => b.Percentage - a.Percentage);
  });

  return (
    <View style={{ flex: 1 }}>
      {/* View toggle */}
      <View style={table.toggle}>
        {(['All', 'Conference', 'Division'] as StandingsView[]).map(v => (
          <TouchableOpacity
            key={v}
            style={[table.toggleBtn, view === v && table.toggleBtnActive]}
            onPress={() => setView(v)}
          >
            <Text style={[table.toggleText, view === v && table.toggleTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView>
        {view === 'All' && (
          <StandingsTable teams={sorted} highlightTeams={highlightTeams} />
        )}

        {view === 'Conference' && (
          <>
            <View style={table.divisionHeader}>
              <View style={[table.divisionDot, { backgroundColor: '#4169E1' }]} />
              <Text style={table.divisionTitle}>Eastern Conference</Text>
            </View>
            <StandingsTable teams={east} highlightTeams={highlightTeams} />
            <View style={[table.divisionHeader, { marginTop: 16 }]}>
              <View style={[table.divisionDot, { backgroundColor: '#e05a5a' }]} />
              <Text style={table.divisionTitle}>Western Conference</Text>
            </View>
            <StandingsTable teams={west} highlightTeams={highlightTeams} />
          </>
        )}

        {view === 'Division' && (
          divisionOrder.filter(d => byDivision[d]).map(division => (
            <View key={division}>
              <View style={table.divisionHeader}>
                <View style={[table.divisionDot, { backgroundColor: '#a855f7' }]} />
                <Text style={table.divisionTitle}>{division}</Text>
              </View>
              <StandingsTable teams={byDivision[division]} highlightTeams={highlightTeams} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ players, homeTeam, awayTeam }: { players: any[]; homeTeam: string; awayTeam: string }) {
  const [team, setTeam] = useState<string>(awayTeam);

  const cols = ['PTS','REB','AST','STL','BLK','TOV','+/-'];
  const teamPlayers = players
    .filter(p => p.Team === team && (p.Minutes ?? 0) > 0)
    .sort((a, b) => (b.Points ?? 0) - (a.Points ?? 0));

  return (
    <View style={{ flex: 1 }}>
      {/* Team toggle */}
      <View style={table.toggle}>
        {[awayTeam, homeTeam].map(t => (
          <TouchableOpacity
            key={t}
            style={[table.toggleBtn, team === t && table.toggleBtnActive]}
            onPress={() => setTeam(t)}
          >
            <Text style={[table.toggleText, team === t && table.toggleTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Header */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={statsTab.headerRow}>
            <Text style={statsTab.nameCol}>Player</Text>
            {cols.map(c => <Text key={c} style={statsTab.statCol}>{c}</Text>)}
          </View>
          {teamPlayers.map(p => (
            <View key={p.PlayerID} style={[statsTab.row, p.Started === 1 && statsTab.starter]}>
              <Text style={statsTab.nameCol} numberOfLines={1}>{p.Name}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.Points ?? 0)}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.Rebounds ?? 0)}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.Assists ?? 0)}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.Steals ?? 0)}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.BlockedShots ?? 0)}</Text>
              <Text style={statsTab.statCol}>{Math.round(p.Turnovers ?? 0)}</Text>
              <Text style={[statsTab.statCol,
                (p.PlusMinus ?? 0) > 0 ? statsTab.pos : (p.PlusMinus ?? 0) < 0 ? statsTab.neg : null]}>
                {(p.PlusMinus ?? 0) > 0 ? '+' : ''}{Math.round(p.PlusMinus ?? 0)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function GameScreen({ route, navigation }: Props) {
  const { gameId, gameDate, awayTeam, homeTeam } = route.params;
  const [boxscore, setBoxscore]   = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Facts');

  function goToTeam(abbrev: string) {
    navigation.navigate('TeamProfile', {
      teamKey:  abbrev,
      teamCity: teamCities[abbrev]    ?? abbrev,
      teamName: teamNicknames[abbrev] ?? abbrev,
    });
  }

  useEffect(() => {
    NBAService.getBoxScore(gameId, gameDate, awayTeam, homeTeam)
      .then(res => { setBoxscore(res.boxscore); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [gameId]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (error || !boxscore) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.empty}>{error ?? 'Game not found'}</Text>
      </SafeAreaView>
    );
  }

  const game    = boxscore.Game;
  const players = boxscore.PlayerGames ?? [];
  const teams   = boxscore.TeamGames ?? [];
  const quarters = game.Quarters ?? [];

  const awayTeamStats = teams.find((t: any) => t.Team === game.AwayTeam);
  const homeTeamStats = teams.find((t: any) => t.Team === game.HomeTeam);

  const isFinal     = NBAService.isFinal(game);
  const isScheduled = NBAService.isScheduled(game);
  const awayWon     = isFinal && game.AwayTeamScore > game.HomeTeamScore;
  const homeWon     = isFinal && game.HomeTeamScore > game.AwayTeamScore;
  const isPlayoffs  = game.SeasonType === 3;

  return (
    <SafeAreaView style={s.container}>
      {/* Game header */}
      <View style={s.gameHeader}>
        {/* Away team */}
        <TouchableOpacity style={s.teamBlock} onPress={() => goToTeam(game.AwayTeam)} activeOpacity={0.7}>
          <TeamLogo abbrev={game.AwayTeam} size={52} />
          <Text style={s.teamAbbr}>{game.AwayTeam}</Text>
          <Text style={s.teamName} numberOfLines={1}>
            {teamFullNames[game.AwayTeam] ?? game.AwayTeam}
          </Text>
        </TouchableOpacity>

        {/* Score / status */}
        <View style={s.scoreBlock}>
          {isScheduled ? (
            <Text style={s.gameTime}>
              {game.DateTime
                ? new Date(game.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : 'TBD'}
            </Text>
          ) : (
            <>
              <View style={s.scoreRow}>
                <Text style={[s.score, awayWon && s.scoreWinner]}>{game.AwayTeamScore}</Text>
                <Text style={s.scoreDash}>–</Text>
                <Text style={[s.score, homeWon && s.scoreWinner]}>{game.HomeTeamScore}</Text>
              </View>
              <Text style={s.statusText}>
                {isFinal ? 'Final' : `Q${game.Quarter} ${game.TimeRemainingMinutes}:${String(game.TimeRemainingSeconds ?? 0).padStart(2, '0')}`}
              </Text>
            </>
          )}

          {/* Playoff series badge */}
          {isPlayoffs && boxscore.PlayoffInfo && (
            <View style={s.seriesBadge}>
              <Text style={s.seriesRound}>
                {boxscore.PlayoffInfo.roundName} · Game {boxscore.PlayoffInfo.gameNumber}
              </Text>
              <Text style={s.seriesText}>
                {game.AwayTeam} {boxscore.PlayoffInfo.winsAway} – {boxscore.PlayoffInfo.winsHome} {game.HomeTeam}
              </Text>
              <Text style={s.seriesSubtext}>
                {isFinal ? boxscore.PlayoffInfo.postSeriesLabel : boxscore.PlayoffInfo.seriesLabel}
              </Text>
            </View>
          )}

          {/* Quarter scores */}
          {quarters.length > 0 && (
            <View style={s.quarters}>
              <View style={s.quarterRow}>
                <Text style={s.quarterLabel} />
                {quarters.map((q: any) => (
                  <Text key={q.Number} style={s.quarterLabel}>Q{q.Number}</Text>
                ))}
                <Text style={[s.quarterLabel, { color: '#fff' }]}>T</Text>
              </View>
              <View style={s.quarterRow}>
                <Text style={s.quarterTeam}>{game.AwayTeam}</Text>
                {quarters.map((q: any) => (
                  <Text key={q.Number} style={s.quarterScore}>{q.AwayScore}</Text>
                ))}
                <Text style={[s.quarterScore, { color: '#fff', fontWeight: '700' }]}>{game.AwayTeamScore}</Text>
              </View>
              <View style={s.quarterRow}>
                <Text style={s.quarterTeam}>{game.HomeTeam}</Text>
                {quarters.map((q: any) => (
                  <Text key={q.Number} style={s.quarterScore}>{q.HomeScore}</Text>
                ))}
                <Text style={[s.quarterScore, { color: '#fff', fontWeight: '700' }]}>{game.HomeTeamScore}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Home team */}
        <TouchableOpacity style={s.teamBlock} onPress={() => goToTeam(game.HomeTeam)} activeOpacity={0.7}>
          <TeamLogo abbrev={game.HomeTeam} size={52} />
          <Text style={s.teamAbbr}>{game.HomeTeam}</Text>
          <Text style={s.teamName} numberOfLines={1}>
            {teamFullNames[game.HomeTeam] ?? game.HomeTeam}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'Facts' && (
          <FactsTab home={homeTeamStats} away={awayTeamStats} homeTeam={game.HomeTeam} awayTeam={game.AwayTeam} />
        )}
        {activeTab === 'Lineup' && (
          <LineupTab players={players} homeTeam={game.HomeTeam} awayTeam={game.AwayTeam} />
        )}
        {activeTab === 'Table' && (
          <TableTab
            highlightTeams={[game.HomeTeam, game.AwayTeam]}
            isPlayoffs={isPlayoffs}
            season={game.Season}
          />
        )}
        {activeTab === 'Stats' && (
          <StatsTab players={players} homeTeam={game.HomeTeam} awayTeam={game.AwayTeam} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#141414' },
  empty:        { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 15 },

  gameHeader:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 16, backgroundColor: '#1a1a1a' },
  teamBlock:    { flex: 1, alignItems: 'center', gap: 6 },
  teamAbbr:     { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  teamName:     { color: '#ccc', fontSize: 11, textAlign: 'center' },
  scoreBlock:   { flex: 1.4, alignItems: 'center', gap: 4 },
  scoreRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score:        { color: '#888', fontSize: 34, fontWeight: '300' },
  scoreWinner:  { color: '#fff', fontWeight: '700' },
  scoreDash:    { color: '#444', fontSize: 24 },
  statusText:   { color: '#666', fontSize: 12, fontWeight: '600' },
  gameTime:     { color: '#fff', fontSize: 20, fontWeight: '600' },

  quarters:     { marginTop: 8, width: '100%' },
  quarterRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 2 },
  quarterLabel: { color: '#555', fontSize: 10, fontWeight: '600', flex: 1, textAlign: 'center' },
  quarterTeam:  { color: '#888', fontSize: 10, fontWeight: '700', flex: 1 },
  quarterScore: { color: '#888', fontSize: 10, flex: 1, textAlign: 'center' },
  seriesBadge:  { marginTop: 4, alignItems: 'center', backgroundColor: '#252525', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  seriesRound:  { color: '#f59e0b', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  seriesText:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  seriesSubtext:{ color: '#888', fontSize: 11 },
});

const logo = StyleSheet.create({
  fallback:     { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#fff', fontWeight: '800' },
});

const tab = StyleSheet.create({
  bar:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a2a2a', backgroundColor: '#1a1a1a' },
  btn:          { flex: 1, alignItems: 'center', paddingVertical: 12 },
  label:        { color: '#555', fontSize: 13, fontWeight: '600' },
  labelActive:  { color: '#fff' },
  underline:    { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: '#fff', borderRadius: 1 },
});

const facts = StyleSheet.create({
  container:  { padding: 16, paddingBottom: 40 },
  row:        { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  val:        { color: '#ffffff', fontSize: 13, fontWeight: '700', width: 44 },
  mid:        { flex: 1, alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  statLabel:  { color: '#666', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  barWrap:    { flexDirection: 'row', width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#2a2a2a' },
  barLeft:    { height: '100%' },
  barRight:   { height: '100%' },
});

const court = StyleSheet.create({
  container:       { position: 'relative', backgroundColor: '#2c2c2c', overflow: 'hidden' },
  surface:         { ...StyleSheet.absoluteFill, backgroundColor: '#2c2c2c' },
  halfLine:        { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#3a3a3a' },
  centerCircle:    { position: 'absolute', borderWidth: 2, borderColor: '#3a3a3a', backgroundColor: 'transparent' },
  paint:           { position: 'absolute', borderWidth: 2, borderColor: '#3a3a3a', backgroundColor: 'transparent' },
  teamLabel:       { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, left: 0, right: 0, justifyContent: 'center' },
  teamLabelText:   { color: '#555', fontSize: 12, fontWeight: '700' },
  playerPin:       { position: 'absolute', alignItems: 'center', width: 44 },
  badge:           { position: 'absolute', top: -6, right: -4, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1, zIndex: 10 },
  badgeText:       { color: '#000', fontSize: 9, fontWeight: '800' },
  photoRing:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 2, borderColor: '#444' },
  photo:           { width: '100%', height: '100%' },
  photoFallback:   { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photoFallbackText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  playerName:      { color: '#ccc', fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});

const lineup = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  headerLabel:  { flex: 1, color: '#555', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  headerStat:   { width: 40, color: '#555', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1e1e1e' },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  playerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  posTag:       { width: 32, height: 22, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  posText:      { fontSize: 10, fontWeight: '800' },
  playerName:   { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
  ratingBadge:   { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
  ratingText:    { color: '#000', fontSize: 10, fontWeight: '800' },
  statCols:      { flexDirection: 'row' },
  statVal:       { width: 40, color: '#888', fontSize: 12, textAlign: 'center' },
  photo:         { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', borderWidth: 2 },
  photoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photoInitials: { color: '#fff', fontSize: 14, fontWeight: '800' },
  positionText:  { color: '#666', fontSize: 11, marginTop: 1 },
});

const table = StyleSheet.create({
  toggle:          { flexDirection: 'row', margin: 12, gap: 8 },
  toggleBtn:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#242424' },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText:      { color: '#777', fontSize: 12, fontWeight: '600' },
  toggleTextActive:{ color: '#000' },
  headerRow:       { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  row:             { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  rowHighlighted:  { backgroundColor: '#1a2a1a', borderLeftWidth: 3, borderLeftColor: '#4caf50' },
  cell:            { flex: 1, color: '#888', fontSize: 11, textAlign: 'center' },
  rankCol:         { flex: 0, width: 22, textAlign: 'center' },
  teamCol:         { flex: 0, width: 120 },
  teamName:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  win:             { color: '#4caf50', fontWeight: '700' },
  loss:            { color: '#e05a5a' },
  divisionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1a1a1a' },
  divisionDot:     { width: 8, height: 8, borderRadius: 4 },
  divisionTitle:   { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const modal = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#1c1c1e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  header:        { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  photoRing:     { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', borderWidth: 3, backgroundColor: '#333' },
  photo:         { width: '100%', height: '100%' },
  photoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photoInitials: { color: '#fff', fontSize: 22, fontWeight: '800' },
  info:          { flex: 1, marginLeft: 14 },
  playerName:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  playerMeta:    { color: '#888', fontSize: 13, marginTop: 2 },
  ratingBadge:   { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  ratingText:    { color: '#000', fontSize: 12, fontWeight: '800' },
  closeBtn:      { padding: 8 },
  closeText:     { color: '#666', fontSize: 18 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap' },
  statCell:      { width: '33.33%', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  statVal:       { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel:     { color: '#666', fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
});

const statsTab = StyleSheet.create({
  headerRow:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  row:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  starter:    { backgroundColor: '#1e1e1e' },
  nameCol:    { width: 140, color: '#fff', fontSize: 12, fontWeight: '500' },
  statCol:    { width: 46, color: '#aaa', fontSize: 12, textAlign: 'center' },
  pos:        { color: '#4caf50', fontWeight: '700' },
  neg:        { color: '#e05a5a' },
});
