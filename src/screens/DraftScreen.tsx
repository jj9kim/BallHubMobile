import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  Image, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService } from '../api/nbaService';
import { teamLogoUri } from '../utils/teamMappings';

type Props = NativeStackScreenProps<RootStackParamList, 'Draft'>;

function fmt(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toFixed(1);
}

function DraftPickRow({ pick, index }: { pick: any; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isR2 = pick.Round === 2;
  const st = pick.Stats;

  return (
    <View style={[s.row, index % 2 === 1 && { backgroundColor: '#191919' }]}>
      {/* Left: pick # + photo */}
      <View style={s.pickCell}>
        <Text style={[s.overall, isR2 && { color: '#555' }]}>{pick.Overall}</Text>
      </View>
      <View style={s.photoWrap}>
        {!imgFailed && pick.PhotoUrl ? (
          <Image source={{ uri: pick.PhotoUrl }} style={s.photo} resizeMode="cover"
            onError={() => setImgFailed(true)} />
        ) : (
          <View style={s.photoFallback}>
            <Text style={s.photoInitials}>{pick.Name?.split(' ').pop()?.slice(0, 2)}</Text>
          </View>
        )}
      </View>

      {/* Middle: name + meta */}
      <View style={s.infoCell}>
        <Text style={s.name} numberOfLines={1}>{pick.Name}</Text>
        <View style={s.metaGroup}>
          {pick.Team
            ? <Image source={{ uri: teamLogoUri(pick.Team) }} style={s.teamLogo} resizeMode="contain" />
            : <View style={s.teamLogo} />}
          <Text style={s.meta} numberOfLines={1}>
            {` ·  ${pick.Position}${pick.College ? `  ·  ${pick.College}` : ''}`}
          </Text>
        </View>
      </View>

      {/* Right: stats — vertically centered */}
      <View style={s.statsRow}>
        {(['GP', 'PTS', 'REB', 'AST'] as const).map((lbl) => {
          const val = lbl === 'GP' ? (st?.GP ?? '—') : fmt(st?.[lbl as keyof typeof st]);
          return (
            <View key={lbl} style={s.statCell}>
              <Text style={s.statVal}>{val}</Text>
              <Text style={s.statLbl}>{lbl}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function DraftScreen({ route }: Props) {
  const { year } = route.params;
  const [picks, setPicks]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [round, setRound]     = useState<0 | 1 | 2>(0);

  useEffect(() => {
    NBAService.getDraftClass(year)
      .then(res => { setPicks(res.picks ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year]);

  type SortKey = 'pick' | 'GP' | 'PTS' | 'REB' | 'AST';
  const [sortBy, setSortBy] = useState<SortKey>('pick');

  const sorted = (() => {
    const base = round === 0 ? picks : picks.filter(p => p.Round === round);
    if (sortBy === 'pick') return base;
    return [...base].sort((a, b) => (b.Stats?.[sortBy] ?? -1) - (a.Stats?.[sortBy] ?? -1));
  })();

  return (
    <SafeAreaView style={s.container}>
      {/* Round filter */}
      <View style={s.filterBar}>
        {([['All', 0], ['Round 1', 1], ['Round 2', 2]] as [string, 0|1|2][]).map(([label, val]) => (
          <TouchableOpacity
            key={val}
            style={[s.filterChip, round === val && s.filterChipActive]}
            onPress={() => setRound(val)}
          >
            <Text style={[s.filterText, round === val && s.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sort bar */}
      <View style={s.filterBar}>
        {([['Pick #', 'pick'], ['GP', 'GP'], ['PTS', 'PTS'], ['REB', 'REB'], ['AST', 'AST']] as [string, SortKey][]).map(([label, key]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterChip, sortBy === key && s.filterChipActive]}
            onPress={() => setSortBy(key)}
          >
            <Text style={[s.filterText, sortBy === key && s.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => <DraftPickRow pick={item} index={index} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>No draft data available</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#141414' },
  empty:        { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },

  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  pickCell:     { width: 26, alignItems: 'center', marginRight: 6 },
  overall:      { color: '#fff', fontSize: 13, fontWeight: '800' },

  photoWrap:    { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: '#2a2a2a' },
  photo:        { width: '100%', height: '100%' },
  photoFallback:{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2a2a' },
  photoInitials:{ color: '#555', fontSize: 11, fontWeight: '800' },

  infoCell:     { flex: 1, marginLeft: 8, justifyContent: 'center' },
  name:         { color: '#fff', fontSize: 13, fontWeight: '700' },
  metaGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  teamLogo:     { width: 20, height: 20 },
  meta:         { color: '#555', fontSize: 10, flexShrink: 1 },

  statsRow:     { flexDirection: 'row', alignItems: 'center' },
  statCell:     { width: 34, alignItems: 'center' },
  statVal:      { color: '#aaa', fontSize: 11, fontWeight: '600' },
  statLbl:      { color: '#555', fontSize: 9, fontWeight: '600' },

  filterBar:        { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#242424' },
  filterChipActive: { backgroundColor: '#fff' },
  filterText:       { color: '#777', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#000', fontWeight: '700' },
});
