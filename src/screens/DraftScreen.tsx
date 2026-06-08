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
      {/* Pick number */}
      <View style={s.pickCell}>
        <Text style={[s.overall, isR2 && { color: '#555' }]}>{pick.Overall}</Text>
      </View>

      {/* Player photo */}
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

      {/* Name + position */}
      <View style={s.nameCell}>
        <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{pick.Name}</Text>
        <Text style={s.meta}>{pick.Position}{pick.College ? ` · ${pick.College}` : ''}</Text>
      </View>

      {/* Team logo */}
      {pick.Team ? (
        <Image source={{ uri: teamLogoUri(pick.Team) }} style={s.teamLogo} resizeMode="contain" />
      ) : (
        <View style={s.teamLogo} />
      )}

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCell}>
          <Text style={s.statVal}>{st?.GP ?? '—'}</Text>
          <Text style={s.statLbl}>GP</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statVal}>{fmt(st?.PTS)}</Text>
          <Text style={s.statLbl}>PTS</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statVal}>{fmt(st?.REB)}</Text>
          <Text style={s.statLbl}>REB</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statVal}>{fmt(st?.AST)}</Text>
          <Text style={s.statLbl}>AST</Text>
        </View>
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

  const filtered = round === 0 ? picks : picks.filter(p => p.Round === round);

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

      {loading ? (
        <ActivityIndicator color="#fff" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
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

  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  pickCell:     { width: 34, alignItems: 'center' },
  overall:      { color: '#fff', fontSize: 15, fontWeight: '800' },

  photoWrap:    { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', backgroundColor: '#2a2a2a' },
  photo:        { width: '100%', height: '100%' },
  photoFallback:{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a2a2a' },
  photoInitials:{ color: '#555', fontSize: 13, fontWeight: '800' },

  name:         { color: '#fff', fontSize: 14, fontWeight: '700' },
  meta:         { color: '#555', fontSize: 11, marginTop: 2 },

  teamLogo:     { width: 30, height: 30, marginHorizontal: 8 },

  nameCell:     { flex: 1, marginLeft: 10 },

  statsRow:     { flexDirection: 'row', gap: 2 },
  statCell:     { width: 36, alignItems: 'center' },
  statVal:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  statLbl:      { color: '#555', fontSize: 9, fontWeight: '600', marginTop: 1 },

  filterBar:        { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#242424' },
  filterChipActive: { backgroundColor: '#fff' },
  filterText:       { color: '#777', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#000', fontWeight: '700' },
});
