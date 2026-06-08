import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  Image, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { NBAService } from '../api/nbaService';
import { teamLogoUri } from '../utils/teamMappings';

type Props = NativeStackScreenProps<RootStackParamList, 'Draft'>;

function DraftPickRow({ pick, index }: { pick: any; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isR2 = pick.Round === 2;

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

      {/* Name + details */}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.name} numberOfLines={1}>{pick.Name}</Text>
        <Text style={s.meta}>
          {pick.Position}{pick.College ? ` · ${pick.College}` : ''}
        </Text>
      </View>

      {/* Team logo */}
      {pick.Team ? (
        <Image source={{ uri: teamLogoUri(pick.Team) }} style={s.teamLogo} resizeMode="contain" />
      ) : (
        <View style={s.teamLogo} />
      )}

      {/* Round/pick badge */}
      <View style={s.roundBadge}>
        <Text style={[s.roundText, isR2 && { color: '#555' }]}>
          R{pick.Round}P{pick.Pick}
        </Text>
      </View>
    </View>
  );
}

export default function DraftScreen({ route }: Props) {
  const { year } = route.params;
  const [picks, setPicks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    NBAService.getDraftClass(year)
      .then(res => { setPicks(res.picks ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year]);

  return (
    <SafeAreaView style={s.container}>
      {loading ? (
        <ActivityIndicator color="#fff" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={picks}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => <DraftPickRow pick={item} index={index} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={s.empty}>No draft data available</Text>
          }
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

  roundBadge:   { minWidth: 46, alignItems: 'flex-end' },
  roundText:    { color: '#888', fontSize: 10, fontWeight: '700' },
});
