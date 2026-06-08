import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, Dimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { NBAService } from '../api/nbaService';
import { teamColors, teamLogoUri } from '../utils/teamMappings';

// ── Team Logo ─────────────────────────────────────────────────────────────────

function TeamLogo({ abbrev, size = 15 }: { abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: 2, backgroundColor: teamColors[abbrev] ?? '#555', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: size * 0.3, fontWeight: '700' }}>{abbrev?.slice(0,3)}</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri: teamLogoUri(abbrev) }} style={{ width: size, height: size }}
      resizeMode="contain" onError={() => setFailed(true)} />
  );
}

// ── Bracket constants ─────────────────────────────────────────────────────────

const EAST_TEAMS = new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NY','ORL','PHI','TOR','WAS']);
const CONN   = '#3a3a3a';
const BKT_G  = 4;
const CONN_H = 18;

export function isEastSeries(s: any) {
  return EAST_TEAMS.has(s.teams[0]) || EAST_TEAMS.has(s.teams[1]);
}

function calcChipW(usableW: number) { return (usableW - BKT_G * 3) / 4; }
function r1Centers(cw: number)   { const G = BKT_G; return [cw/2, 3*cw/2+G, 5*cw/2+2*G, 7*cw/2+3*G]; }
function semiCenters(cw: number) { const G = BKT_G; return [cw+G/2, 3*cw+5*G/2]; }
function cfCenter(cw: number)    { const G = BKT_G; return 2*cw+3*G/2; }
const R1_BRACKET_ORDER = [1, 4, 3, 2];

function topSeed(series: any): number {
  const vals = Object.values(series.seeds ?? {}) as number[];
  return vals.length ? Math.min(...vals) : 99;
}
function sortR1(series: any[]): any[] {
  return [...series].sort((a, b) => {
    const ia = R1_BRACKET_ORDER.indexOf(topSeed(a));
    const ib = R1_BRACKET_ORDER.indexOf(topSeed(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}
function sortBySeed(series: any[]): any[] {
  return [...series].sort((a, b) => topSeed(a) - topSeed(b));
}

// ── BracketChip ───────────────────────────────────────────────────────────────

function BracketChip({ series, highlightTeams, width }: { series: any; highlightTeams: string[]; width: number }) {
  if (!series) {
    return (
      <View style={[bkt.chip, { width }]}>
        <View style={bkt.teamRow}><Text style={bkt.tbd}>TBD</Text></View>
        <View style={bkt.divider} />
        <View style={bkt.teamRow}><Text style={bkt.tbd}>TBD</Text></View>
      </View>
    );
  }
  const seeds: Record<string, number> = series.seeds ?? {};
  const [t1raw, t2raw] = series.teams as string[];
  const s1 = seeds[t1raw] ?? 99, s2 = seeds[t2raw] ?? 99;
  const [t1, t2] = s1 <= s2 ? [t1raw, t2raw] : [t2raw, t1raw];
  const w1 = series.wins[t1] ?? 0, w2 = series.wins[t2] ?? 0;
  const highlighted = highlightTeams.includes(t1) || highlightTeams.includes(t2);
  const elim    = (t: string) => series.isComplete && t !== series.leader;
  const leading = (t: string) => !series.isComplete && ((t === t1 && w1 > w2) || (t === t2 && w2 > w1));

  return (
    <View style={[bkt.chip, { width }, highlighted && bkt.chipHighlighted]}>
      {[t1, t2].map((team, i) => (
        <View key={team}>
          {i === 1 && <View style={bkt.divider} />}
          <View style={bkt.teamRow}>
            {seeds[team] != null && <Text style={[bkt.seed, elim(team) && bkt.eliminated]}>{seeds[team]}</Text>}
            <TeamLogo abbrev={team} size={15} />
            <Text style={[bkt.teamAbbr, elim(team) && bkt.eliminated]}>{team}</Text>
            <Text style={[bkt.wins, series.isComplete && team === series.leader && bkt.winsWon, leading(team) && bkt.winsLeading]}>
              {series.wins[team] ?? 0}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── BracketRow ────────────────────────────────────────────────────────────────

function BracketRow({ series, count, chipW, usableW, highlightTeams, label, labelColor, labelBelow }: {
  series: any[]; count: number; chipW: number; usableW: number;
  highlightTeams: string[]; label: string; labelColor?: string; labelBelow?: boolean;
}) {
  const G = BKT_G;
  const chips = Array.from({ length: count }, (_, i) => series[i] ?? null);
  let inner: React.ReactNode;
  if (count === 4) {
    inner = <View style={{ flexDirection: 'row', gap: G }}>{chips.map((s, i) => <BracketChip key={i} series={s} highlightTeams={highlightTeams} width={chipW} />)}</View>;
  } else if (count === 2) {
    const spacer = chipW / 2 + G / 2, inner2 = chipW + 2 * G;
    inner = (
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: spacer }} />
        <BracketChip series={chips[0]} highlightTeams={highlightTeams} width={chipW} />
        <View style={{ width: inner2 }} />
        <BracketChip series={chips[1]} highlightTeams={highlightTeams} width={chipW} />
        <View style={{ width: spacer }} />
      </View>
    );
  } else {
    const spacer = 3 * chipW / 2 + 3 * G / 2;
    inner = (
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: spacer }} />
        <BracketChip series={chips[0]} highlightTeams={highlightTeams} width={chipW} />
        <View style={{ width: spacer }} />
      </View>
    );
  }
  const labelEl = label ? <Text style={[bkt.roundLabel, labelColor ? { color: labelColor } : {}, labelBelow && { marginTop: 4 }]}>{label}</Text> : null;
  return <View>{!labelBelow && labelEl}{inner}{labelBelow && labelEl}</View>;
}

// ── Connectors ────────────────────────────────────────────────────────────────

function MergeConnector({ usableW, fromCenters, toCenters }: { usableW: number; fromCenters: number[]; toCenters: number[] }) {
  const H = CONN_H, pairSize = fromCenters.length / toCenters.length, lines: React.ReactNode[] = [];
  toCenters.forEach((tc, ti) => {
    const pair = fromCenters.slice(ti * pairSize, (ti + 1) * pairSize);
    pair.forEach((fc, fi) => lines.push(<Line key={`fv${ti}-${fi}`} x1={fc} y1={0} x2={fc} y2={H/2} stroke={CONN} strokeWidth={1.5} />));
    lines.push(<Line key={`fh${ti}`} x1={pair[0]} y1={H/2} x2={pair[pair.length-1]} y2={H/2} stroke={CONN} strokeWidth={1.5} />);
    lines.push(<Line key={`fd${ti}`} x1={tc} y1={H/2} x2={tc} y2={H} stroke={CONN} strokeWidth={1.5} />);
  });
  return <Svg width={usableW} height={H}>{lines}</Svg>;
}

function SplitConnector({ usableW, fromCenters, toCenters }: { usableW: number; fromCenters: number[]; toCenters: number[] }) {
  const H = CONN_H, pairSize = toCenters.length / fromCenters.length, lines: React.ReactNode[] = [];
  fromCenters.forEach((fc, fi) => {
    const pair = toCenters.slice(fi * pairSize, (fi + 1) * pairSize);
    lines.push(<Line key={`fd${fi}`} x1={fc} y1={0} x2={fc} y2={H/2} stroke={CONN} strokeWidth={1.5} />);
    lines.push(<Line key={`fh${fi}`} x1={pair[0]} y1={H/2} x2={pair[pair.length-1]} y2={H/2} stroke={CONN} strokeWidth={1.5} />);
    pair.forEach((tc, ti) => lines.push(<Line key={`fv${fi}-${ti}`} x1={tc} y1={H/2} x2={tc} y2={H} stroke={CONN} strokeWidth={1.5} />));
  });
  return <Svg width={usableW} height={H}>{lines}</Svg>;
}

function StraightConnector({ usableW, x }: { usableW: number; x: number }) {
  return <Svg width={usableW} height={CONN_H}><Line x1={x} y1={0} x2={x} y2={CONN_H} stroke={CONN} strokeWidth={1.5} /></Svg>;
}

function c78x(usableW: number, chipW: number) { return r1Centers(chipW)[3]; }

function PlayInToR1Connector({ usableW, chipW }: { usableW: number; chipW: number }) {
  const H = CONN_H + 8, rc = r1Centers(chipW), cf = cfCenter(chipW), c78 = c78x(usableW, chipW);
  return (
    <Svg width={usableW} height={H}>
      <Line x1={c78} y1={0} x2={c78} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={H/2} x2={rc[3]} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={rc[3]} y1={H/2} x2={rc[3]} y2={H} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={0} x2={cf} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={H/2} x2={rc[0]} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={rc[0]} y1={H/2} x2={rc[0]} y2={H} stroke={CONN} strokeWidth={1.5} />
    </Svg>
  );
}

function R1ToPlayInConnector({ usableW, chipW }: { usableW: number; chipW: number }) {
  const H = CONN_H + 8, rc = r1Centers(chipW), cf = cfCenter(chipW), c78 = c78x(usableW, chipW);
  return (
    <Svg width={usableW} height={H}>
      <Line x1={rc[3]} y1={0} x2={rc[3]} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={rc[3]} y1={H/2} x2={c78} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={H/2} x2={c78} y2={H} stroke={CONN} strokeWidth={1.5} />
      <Line x1={rc[0]} y1={0} x2={rc[0]} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={rc[0]} y1={H/2} x2={cf} y2={H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={H/2} x2={cf} y2={H} stroke={CONN} strokeWidth={1.5} />
    </Svg>
  );
}

function PlayInBracket({ series, highlightTeams, chipW, usableW, inverted = false }: {
  series: any[]; highlightTeams: string[]; chipW: number; usableW: number; inverted?: boolean;
}) {
  if (!series.length) return null;
  const minSeedOf = (s: any) => { const vals = Object.values(s.seeds ?? {}) as number[]; return vals.length ? Math.min(...vals) : 99; };
  const byDate  = [...series].sort((a, b) => a.firstGameDate.localeCompare(b.firstGameDate));
  const decider = byDate[byDate.length - 1] ?? null;
  const r1games = byDate.slice(0, byDate.length - 1);
  r1games.sort((a, b) => minSeedOf(a) - minSeedOf(b));
  const game78 = r1games[0] ?? null, game910 = r1games[1] ?? null;
  const G = BKT_G, cf = cfCenter(chipW), c78 = c78x(usableW, chipW), c910 = G + chipW / 2;
  const INNER = usableW - 2 * chipW - 2 * G;
  const cfLeft = 3 * chipW / 2 + 3 * G / 2, bypassInSVG = c78 - cfLeft - chipW;

  const r1ToDeciderSVG = (
    <Svg width={usableW} height={CONN_H}>
      <Line x1={c910} y1={0} x2={c910} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c910} y1={CONN_H/2} x2={cf} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={CONN_H/2} x2={cf} y2={CONN_H} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={0} x2={c78} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={CONN_H/2} x2={cf} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={CONN_H/2} x2={c78} y2={CONN_H} stroke={CONN} strokeWidth={1.5} />
    </Svg>
  );
  const deciderToR1SVG = (
    <Svg width={usableW} height={CONN_H}>
      <Line x1={cf} y1={0} x2={cf} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={CONN_H/2} x2={c910} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c910} y1={CONN_H/2} x2={c910} y2={CONN_H} stroke={CONN} strokeWidth={1.5} />
      <Line x1={cf} y1={CONN_H/2} x2={c78} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={CONN_H/2} x2={c78} y2={CONN_H} stroke={CONN} strokeWidth={1.5} />
      <Line x1={c78} y1={0} x2={c78} y2={CONN_H/2} stroke={CONN} strokeWidth={1.5} />
    </Svg>
  );
  const r1ChipsRow = (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: G }} />
      <BracketChip series={game910} highlightTeams={highlightTeams} width={chipW} />
      <View style={{ width: INNER }} />
      <BracketChip series={game78} highlightTeams={highlightTeams} width={chipW} />
      <View style={{ width: G }} />
    </View>
  );
  const deciderChipRow = (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: cfLeft }} />
      <BracketChip series={decider} highlightTeams={highlightTeams} width={chipW} />
      <Svg width={cfLeft} height={57}><Line x1={bypassInSVG} y1={0} x2={bypassInSVG} y2={57} stroke={CONN} strokeWidth={1.5} /></Svg>
    </View>
  );

  if (!inverted) {
    return <View><Text style={[bkt.roundLabel, { color: '#a78bfa' }]}>Play-In</Text>{r1ChipsRow}{r1ToDeciderSVG}{deciderChipRow}</View>;
  } else {
    return <View>{deciderChipRow}{deciderToR1SVG}{r1ChipsRow}<Text style={[bkt.roundLabel, { color: '#a78bfa', marginTop: 4 }]}>Play-In</Text></View>;
  }
}

// ── PlayoffBracket (exported) ─────────────────────────────────────────────────

export function PlayoffBracket({ highlightTeams = [], season }: { highlightTeams?: string[]; season: number }) {
  const [rounds, setRounds] = useState<any[]>([]);
  const [playIn, setPlayIn] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const screenW = Dimensions.get('window').width;
  const usableW = screenW - 24;
  const chipW   = calcChipW(usableW);
  const rc = r1Centers(chipW), sc = semiCenters(chipW), cf = cfCenter(chipW);

  useEffect(() => {
    NBAService.getPlayoffBracket(season)
      .then(res => { setRounds(res.rounds ?? []); setPlayIn(res.playIn ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [season]);

  if (loading) return <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />;
  if (!rounds.length) return <Text style={bkt.empty}>No playoff data available</Text>;

  const r1 = rounds[0]?.series ?? [], r2 = rounds[1]?.series ?? [], r3 = rounds[2]?.series ?? [];
  const finals = rounds[3]?.series?.[0] ?? null;

  const westPI   = playIn.filter((s: any) => !isEastSeries(s));
  const eastPI   = playIn.filter(isEastSeries);
  const westR1   = sortR1(r1.filter((s: any) => !isEastSeries(s)));
  const eastR1   = sortR1(r1.filter(isEastSeries));
  const westSemi = sortBySeed(r2.filter((s: any) => !isEastSeries(s)));
  const eastSemi = sortBySeed(r2.filter(isEastSeries));
  const westCF   = r3.filter((s: any) => !isEastSeries(s));
  const eastCF   = r3.filter(isEastSeries);

  const pad4 = (arr: any[]) => Array.from({ length: 4 }, (_, i) => arr[i] ?? null);
  const pad2 = (arr: any[]) => Array.from({ length: 2 }, (_, i) => arr[i] ?? null);
  const pad1 = (arr: any[]) => [arr[0] ?? null];

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <Text style={bkt.confTitle}>Western Conference</Text>
      {westPI.length > 0 && <><PlayInBracket series={westPI} highlightTeams={highlightTeams} chipW={chipW} usableW={usableW} /><PlayInToR1Connector usableW={usableW} chipW={chipW} /></>}
      <BracketRow series={pad4(westR1)} count={4} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="First Round" labelBelow />
      <MergeConnector usableW={usableW} fromCenters={rc} toCenters={sc} />
      <BracketRow series={pad2(westSemi)} count={2} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="Conference Semifinals" labelBelow />
      <MergeConnector usableW={usableW} fromCenters={sc} toCenters={[cf]} />
      <BracketRow series={pad1(westCF)} count={1} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="Conference Finals" labelBelow />
      <StraightConnector usableW={usableW} x={cf} />
      <Text style={bkt.finalsTitle}>NBA Finals</Text>
      <BracketRow series={[finals]} count={1} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="" />
      <StraightConnector usableW={usableW} x={cf} />
      <BracketRow series={pad1(eastCF)} count={1} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="Conference Finals" />
      <SplitConnector usableW={usableW} fromCenters={[cf]} toCenters={sc} />
      <BracketRow series={pad2(eastSemi)} count={2} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="Conference Semifinals" />
      <SplitConnector usableW={usableW} fromCenters={sc} toCenters={rc} />
      <BracketRow series={pad4(eastR1)} count={4} chipW={chipW} usableW={usableW} highlightTeams={highlightTeams} label="First Round" />
      {eastPI.length > 0 && <><R1ToPlayInConnector usableW={usableW} chipW={chipW} /><PlayInBracket series={eastPI} highlightTeams={highlightTeams} chipW={chipW} usableW={usableW} inverted={true} /></>}
      <Text style={[bkt.confTitle, { marginTop: 4 }]}>Eastern Conference</Text>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bkt = StyleSheet.create({
  chip:            { backgroundColor: '#1e1e1e', borderRadius: 8, overflow: 'hidden' },
  chipHighlighted: { borderWidth: 1.5, borderColor: '#4caf50' },
  divider:         { height: 1, backgroundColor: '#2a2a2a' },
  teamRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 5, gap: 4 },
  seed:            { color: '#555', fontSize: 10, fontWeight: '700', width: 14, textAlign: 'right' },
  teamAbbr:        { flex: 1, color: '#fff', fontSize: 11, fontWeight: '700' },
  eliminated:      { color: '#444' },
  wins:            { color: '#555', fontSize: 12, fontWeight: '700' },
  winsLeading:     { color: '#aaa' },
  winsWon:         { color: '#fff' },
  tbd:             { color: '#333', fontSize: 10 },
  confTitle:       { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  roundLabel:      { color: '#555', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  finalsTitle:     { color: '#f59e0b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 },
  empty:           { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 15 },
});
