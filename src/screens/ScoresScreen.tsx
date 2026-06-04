import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NBAService, NBAGame } from '../api/nbaService';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function GameCard({ game, onPress }: { game: NBAGame; onPress: () => void }) {
  const away = game.teams.find((t) => game.matchup.startsWith(t.team_abbreviation)) ?? game.teams[1];
  const home = game.teams.find((t) => !game.matchup.startsWith(t.team_abbreviation)) ?? game.teams[0];
  const status = NBAService.getGameStatus(game);
  const isFinal = status === 'Final';
  const isScheduled = status === 'Scheduled';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.teamRow}>
        <Text style={styles.teamAbbr}>{away.team_abbreviation}</Text>
        <Text style={styles.teamName} numberOfLines={1}>{away.team_name}</Text>
        {isFinal && <Text style={[styles.score, away.wl === 'W' && styles.winnerScore]}>{away.pts}</Text>}
      </View>
      <View style={styles.teamRow}>
        <Text style={styles.teamAbbr}>{home.team_abbreviation}</Text>
        <Text style={styles.teamName} numberOfLines={1}>{home.team_name}</Text>
        {isFinal && <Text style={[styles.score, home.wl === 'W' && styles.winnerScore]}>{home.pts}</Text>}
      </View>
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, status === 'Live' && styles.liveText]}>
          {isScheduled ? (game.game_time ?? 'TBD') : status}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ScoresScreen() {
  const navigation = useNavigation<Nav>();
  const [gamesByDate, setGamesByDate] = useState<{ date: string; games: NBAGame[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { games } = await NBAService.fetchAllGames();
      const map = new Map<string, NBAGame[]>();
      for (const g of games) {
        const date = g.game_date.split('T')[0];
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(g);
      }
      const sorted = Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, gs]) => ({ date, games: gs }));
      setGamesByDate(sorted);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load games');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>BallHub</Text>
      <FlatList
        data={gamesByDate}
        keyExtractor={(item) => item.date}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        renderItem={({ item }) => (
          <View>
            <Text style={styles.dateLabel}>{formatDateLabel(item.date)}</Text>
            {item.games.map((game) => (
              <GameCard
                key={game.game_id}
                game={game}
                onPress={() => navigation.navigate('Game', { gameId: game.game_id, gameDate: game.game_date })}
              />
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { color: '#fff', fontSize: 24, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 12 },
  dateLabel: { color: '#888', fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#222' },
  card: { backgroundColor: '#2a2a2a', marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 12 },
  teamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  teamAbbr: { color: '#fff', fontWeight: '700', fontSize: 15, width: 40 },
  teamName: { color: '#ccc', fontSize: 14, flex: 1 },
  score: { color: '#ccc', fontSize: 17, fontWeight: '600', minWidth: 30, textAlign: 'right' },
  winnerScore: { color: '#fff', fontWeight: '800' },
  statusRow: { marginTop: 6, alignItems: 'flex-end' },
  statusText: { color: '#888', fontSize: 12 },
  liveText: { color: '#4caf50', fontWeight: '700' },
  errorText: { color: '#ff5555', textAlign: 'center', marginTop: 40, fontSize: 15 },
  retryBtn: { alignSelf: 'center', marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#333', borderRadius: 8 },
  retryText: { color: '#fff', fontSize: 14 },
});
