import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export default function TeamsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Teams</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Teams page coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { color: '#fff', fontSize: 24, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 12 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#555', fontSize: 15 },
});
