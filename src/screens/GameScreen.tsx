import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Game'>;

export default function GameScreen({ route }: Props) {
  const { gameId, gameDate } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Game Detail</Text>
        <Text style={styles.subtitle}>Game ID: {gameId}</Text>
        <Text style={styles.subtitle}>Date: {gameDate}</Text>
        <Text style={styles.placeholder}>Full game detail coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#aaa', fontSize: 14, marginBottom: 4 },
  placeholder: { color: '#555', fontSize: 13, marginTop: 24 },
});
