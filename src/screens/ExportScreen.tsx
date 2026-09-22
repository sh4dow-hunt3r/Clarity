import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { exportTransactionsCsv, exportMonthlySummaryCsv } from '../utils/exportData';
import { showAlert } from '../utils/alert';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                 'Jul','Aug','Sep','Oct','Nov','Dec'];
const now = new Date();

export default function ExportScreen() {
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const doExport = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); }
    catch { showAlert('Export failed', 'Could not generate export file.'); }
    finally { setLoading(false); }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Year</Text>
      <View style={styles.row}>
        {years.map(y => (
          <TouchableOpacity
            key={y}
            style={[styles.chip, selectedYear === y && styles.chipActive]}
            onPress={() => setSelectedYear(y)}
          >
            <Text style={[styles.chipText, selectedYear === y && styles.chipTextActive]}>
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Month (optional)</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, selectedMonth === null && styles.chipActive]}
          onPress={() => setSelectedMonth(null)}
        >
          <Text style={[styles.chipText, selectedMonth === null && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {MONTHS.map((m, i) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, selectedMonth === i + 1 && styles.chipActive]}
            onPress={() => setSelectedMonth(i + 1)}
          >
            <Text style={[styles.chipText, selectedMonth === i + 1 && styles.chipTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.exportCard}>
        <MaterialCommunityIcons name="table" size={32} color="#1976D2" />
        <Text style={styles.exportTitle}>Transactions CSV</Text>
        <Text style={styles.exportDesc}>
          All transactions{selectedMonth ? ` for ${MONTHS[selectedMonth - 1]}` : ''} {selectedYear},
          with category, shop, and amount.
        </Text>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => doExport(() => exportTransactionsCsv(selectedYear, selectedMonth ?? undefined))}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <MaterialCommunityIcons name="download" size={18} color="#fff" />
                <Text style={styles.exportBtnText}>Export</Text>
              </>}
        </TouchableOpacity>
      </View>

      <View style={styles.exportCard}>
        <MaterialCommunityIcons name="chart-bar" size={32} color="#4CAF50" />
        <Text style={styles.exportTitle}>Monthly Summary CSV</Text>
        <Text style={styles.exportDesc}>
          Month-by-month totals for {selectedYear}, broken down by category.
        </Text>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: '#4CAF50' }]}
          onPress={() => doExport(() => exportMonthlySummaryCsv(selectedYear))}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <MaterialCommunityIcons name="download" size={18} color="#fff" />
                <Text style={styles.exportBtnText}>Export</Text>
              </>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 10, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#1976D2' },
  chipText: { color: '#555', fontWeight: '500', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  exportCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 20, marginBottom: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  exportTitle: { fontSize: 17, fontWeight: '700', color: '#212121', marginTop: 10 },
  exportDesc: { fontSize: 13, color: '#777', textAlign: 'center', marginTop: 6, marginBottom: 16, lineHeight: 18 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1976D2', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
