import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, RefreshControl,
  Image, Modal, Pressable, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { NBAService, Game } from '../api/nbaService';
import { teamFullNames, teamColors, teamLogoUri } from '../utils/teamMappings';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Date helpers ──────────────────────────────────────────────────────────────

// Always parse as LOCAL date to avoid UTC shift bugs
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayYMD(): string { return toYMD(new Date()); }

function shiftDate(dateStr: string, delta: number): string {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + delta);
  return toYMD(d);
}

function daysFromToday(dateStr: string): number {
  const today = parseLocal(todayYMD());
  const target = parseLocal(dateStr);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateLabel(dateStr: string): string {
  const diff = daysFromToday(dateStr);
  if (diff === 0)  return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1)  return 'Tomorrow';
  return parseLocal(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const STRIP_RADIUS = 5;    // days before and after selected date
const CHIP_WIDTH   = 110;
const CHIP_MARGIN  = 6;
const CHIP_STEP    = CHIP_WIDTH + CHIP_MARGIN;

function getDateStrip(center: string): string[] {
  return Array.from({ length: STRIP_RADIUS * 2 + 1 }, (_, i) =>
    shiftDate(center, i - STRIP_RADIUS)
  );
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DOW_SHORT = ['S','M','T','W','T','F','S'];

// ── Calendar modal ────────────────────────────────────────────────────────────

function CalendarModal({
  visible, selected, onClose, onSelect,
}: {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const initial = parseLocal(selected);
  const [viewYear, setViewYear]   = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    if (visible) {
      const d = parseLocal(selected);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, selected]);

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function buildDays() {
    const firstDow     = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevTotal    = new Date(viewYear, viewMonth, 0).getDate();
    const cells: { dateStr: string; current: boolean }[] = [];

    for (let i = firstDow - 1; i >= 0; i--)
      cells.push({ dateStr: toYMD(new Date(viewYear, viewMonth - 1, prevTotal - i)), current: false });
    for (let i = 1; i <= daysInMonth; i++)
      cells.push({ dateStr: toYMD(new Date(viewYear, viewMonth, i)), current: true });
    while (cells.length < 42)
      cells.push({ dateStr: toYMD(new Date(viewYear, viewMonth + 1, cells.length - daysInMonth - firstDow + 1)), current: false });

    return cells;
  }

  const todayStr = todayYMD();
  const cells    = buildDays();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cal.backdrop} onPress={onClose}>
        <Pressable style={cal.sheet} onPress={() => {}}>

          {/* Header */}
          <View style={cal.header}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={cal.navBtn}>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
            <View style={cal.headerCenter}>
              <Text style={cal.monthText}>{MONTHS[viewMonth]}</Text>
              <Text style={cal.yearText}>{viewYear}</Text>
            </View>
            <TouchableOpacity onPress={() => changeMonth(1)} style={cal.navBtn}>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Day-of-week row */}
          <View style={cal.dowRow}>
            {DOW_SHORT.map((d, i) => (
              <Text key={i} style={cal.dowText}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={cal.grid}>
            {cells.map(({ dateStr, current }) => {
              const isSelected = dateStr === selected;
              const isToday    = dateStr === todayStr;
              const dayNum     = parseInt(dateStr.split('-')[2]);
              return (
                <TouchableOpacity
                  key={dateStr}
                  onPress={() => { onSelect(dateStr); onClose(); }}
                  style={cal.cellWrap}
                  activeOpacity={0.7}
                >
                  <View style={[
                    cal.cell,
                    isToday    && !isSelected && cal.cellToday,
                    isSelected && cal.cellSelected,
                  ]}>
                    <Text style={[
                      cal.cellText,
                      !current   && cal.cellTextFaded,
                      isToday    && !isSelected && cal.cellTextToday,
                      isSelected && cal.cellTextSelected,
                    ]}>
                      {dayNum}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer buttons */}
          <View style={cal.footer}>
            <TouchableOpacity
              style={cal.footerBtn}
              onPress={() => { onSelect(todayStr); onClose(); }}
            >
              <Ionicons name="today-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={cal.footerBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[cal.footerBtn, cal.footerBtnClose]} onPress={onClose}>
              <Text style={cal.footerBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Team logo ─────────────────────────────────────────────────────────────────

function TeamLogo({ abbrev, size = 36 }: { abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const color = teamColors[abbrev] ?? '#555';
  if (failed) {
    return (
      <View style={[styles.logoFallback, { width: size, height: size, backgroundColor: color }]}>
        <Text style={[styles.logoFallbackText, { fontSize: size * 0.33 }]}>{abbrev.slice(0, 3)}</Text>
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

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ game, onPress }: { game: Game; onPress: () => void }) {
  const isLive      = NBAService.isLive(game);
  const isFinal     = NBAService.isFinal(game);
  const isScheduled = NBAService.isScheduled(game);
  const awayWon     = isFinal && game.AwayTeamScore > game.HomeTeamScore;
  const homeWon     = isFinal && game.HomeTeamScore > game.AwayTeamScore;

  const statusLabel = isLive
    ? `Q${game.Quarter ?? ''} ${game.TimeRemainingMinutes ?? ''}:${String(game.TimeRemainingSeconds ?? 0).padStart(2, '0')}`
    : isFinal ? 'Final'
    : game.DateTime
      ? new Date(game.DateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : 'TBD';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.teamRow}>
        <TeamLogo abbrev={game.AwayTeam} size={32} />
        <View style={styles.teamNameWrap}>
          <Text style={styles.teamAbbr}>{game.AwayTeam}</Text>
          <Text style={[styles.teamName, !awayWon && isFinal && styles.loserText]}>
            {teamFullNames[game.AwayTeam] ?? game.AwayTeam}
          </Text>
        </View>
        {!isScheduled && (
          <Text style={[styles.scoreText, awayWon && styles.winnerText]}>{game.AwayTeamScore}</Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.teamRow}>
        <TeamLogo abbrev={game.HomeTeam} size={32} />
        <View style={styles.teamNameWrap}>
          <Text style={styles.teamAbbr}>{game.HomeTeam}</Text>
          <Text style={[styles.teamName, !homeWon && isFinal && styles.loserText]}>
            {teamFullNames[game.HomeTeam] ?? game.HomeTeam}
          </Text>
        </View>
        {!isScheduled && (
          <Text style={[styles.scoreText, homeWon && styles.winnerText]}>{game.HomeTeamScore}</Text>
        )}
      </View>

      <View style={styles.statusRow}>
        {isLive && <View style={styles.liveDot} />}
        <Text style={[styles.statusLabel, isLive && styles.liveLabel]}>{statusLabel}</Text>
        {game.Channel ? <Text style={styles.channelText}>{game.Channel}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ScoresScreen() {
  const navigation  = useNavigation<Nav>();
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const dates = getDateStrip(selectedDate);
  const [games,        setGames]        = useState<Game[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const stripRef = useRef<FlatList>(null);

  const loadGames = useCallback(async (date: string) => {
    try {
      setError(null);
      setLoading(true);
      const res = await NBAService.getGamesByDate(date);
      setGames(res.games ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load games');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadGames(selectedDate); }, [selectedDate]);

  // Selected date is always at index STRIP_RADIUS — scroll to centre it
  useEffect(() => {
    const screenW = Dimensions.get('window').width;
    const offset  = Math.max(0, STRIP_RADIUS * CHIP_STEP - screenW / 2 + CHIP_WIDTH / 2);
    setTimeout(() => {
      stripRef.current?.scrollToOffset({ offset, animated: false });
    }, 50);
  }, [selectedDate]);

  const farFromToday = Math.abs(daysFromToday(selectedDate)) >= 5;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BallHub</Text>
        <TouchableOpacity onPress={() => setCalendarOpen(true)} style={styles.calBtn}>
          <Ionicons name="calendar-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Date strip */}
      <FlatList
        ref={stripRef}
        data={dates}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(d) => d}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        getItemLayout={(_, index) => ({
          length: CHIP_STEP, offset: CHIP_STEP * index, index,
        })}
        renderItem={({ item: date }) => {
          const active = date === selectedDate;
          return (
            <TouchableOpacity
              onPress={() => setSelectedDate(date)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {dateLabel(date)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />


      {/* Games list */}
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#fff" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadGames(selectedDate)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : games.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No games scheduled</Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(g) => String(g.GameID)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadGames(selectedDate); }}
              tintColor="#fff"
            />
          }
          contentContainerStyle={styles.list}

          renderItem={({ item }) => (
            <GameCard
              game={item}
              onPress={() => navigation.navigate('Game', { gameId: item.GameID, gameDate: item.Day })}
            />
          )}
        />
      )}

      {/* Floating "Back to Today" — appears when 5+ days away */}
      {farFromToday && (
        <TouchableOpacity
          style={styles.backToToday}
          onPress={() => setSelectedDate(todayYMD())}
          activeOpacity={0.85}
        >
          <Ionicons name="today-outline" size={15} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.backToTodayText}>Back to Today</Text>
        </TouchableOpacity>
      )}

      {/* Calendar */}
      <CalendarModal
        visible={calendarOpen}
        selected={selectedDate}
        onClose={() => setCalendarOpen(false)}
        onSelect={setSelectedDate}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#141414' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, backgroundColor: '#141414' },
  headerTitle:      { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  calBtn:           { padding: 6 },

  strip:            { maxHeight: 44, backgroundColor: '#141414', overflow: 'visible', paddingBottom: 10 },
  stripContent:     { paddingHorizontal: 16 },
  chip:             { width: CHIP_WIDTH, marginRight: CHIP_MARGIN, height: 34, borderRadius: 17, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  chipActive:       { backgroundColor: '#fff' },
  chipText:         { color: '#777', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  chipTextActive:   { color: '#000', fontWeight: '700', textAlign: 'center' },


  list:             { paddingHorizontal: 12, paddingBottom: 140 },
  card:             { backgroundColor: '#1e1e1e', borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, marginBottom: 10 },
  teamRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  teamNameWrap:     { flex: 1, marginLeft: 10 },
  teamAbbr:         { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  teamName:         { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 1 },
  loserText:        { color: '#555' },
  scoreText:        { color: '#888', fontSize: 22, fontWeight: '600', minWidth: 36, textAlign: 'right' },
  winnerText:       { color: '#fff', fontWeight: '800' },
  divider:          { height: 1, backgroundColor: '#2a2a2a', marginVertical: 4 },
  statusRow:        { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  liveDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4caf50' },
  statusLabel:      { color: '#555', fontSize: 12, fontWeight: '500', flex: 1 },
  liveLabel:        { color: '#4caf50', fontWeight: '700' },
  channelText:      { color: '#444', fontSize: 11 },
  logoFallback:     { borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: '#fff', fontWeight: '800' },

  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  errorText:        { color: '#ff5555', fontSize: 15, marginBottom: 12 },
  retryBtn:         { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#2a2a2a', borderRadius: 10 },
  retryText:        { color: '#fff', fontSize: 14, fontWeight: '600' },
  emptyText:        { color: '#444', fontSize: 15 },

  backToToday: {
    position: 'absolute', bottom: 20, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 8,
  },
  backToTodayText:  { color: '#000', fontWeight: '700', fontSize: 14 },
});

const cal = StyleSheet.create({
  backdrop:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  sheet:             { backgroundColor: '#1c1c1e', borderRadius: 24, padding: 20, width: 340, shadowColor: '#000', shadowOpacity: 0.5, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24 },

  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  navBtn:            { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' },
  headerCenter:      { alignItems: 'center' },
  monthText:         { color: '#fff', fontSize: 18, fontWeight: '700' },
  yearText:          { color: '#888', fontSize: 13, fontWeight: '500', marginTop: 1 },

  dowRow:            { flexDirection: 'row', marginBottom: 10 },
  dowText:           { flex: 1, textAlign: 'center', color: '#555', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  grid:              { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap:          { width: `${100/7}%`, aspectRatio: 1, padding: 2 },
  cell:              { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  cellToday:         { borderWidth: 1.5, borderColor: '#555' },
  cellSelected:      { backgroundColor: '#fff' },
  cellText:          { color: '#fff', fontSize: 14, fontWeight: '500' },
  cellTextFaded:     { color: '#3a3a3a' },
  cellTextToday:     { color: '#fff', fontWeight: '800' },
  cellTextSelected:  { color: '#000', fontWeight: '800' },

  footer:            { flexDirection: 'row', gap: 10, marginTop: 18 },
  footerBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#2c2c2e', borderRadius: 14 },
  footerBtnClose:    { backgroundColor: '#2c2c2e' },
  footerBtnText:     { color: '#fff', fontSize: 14, fontWeight: '600' },
});
