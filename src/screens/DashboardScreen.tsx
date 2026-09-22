import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, RefreshControl,
} from 'react-native';
import { PieChart, BarChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getMonthlySummary, getAvailableMonths } from '../db/database';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCategories } from '../hooks/useCategories';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 32;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getMonthlySummary>> | null>(null);
  const [months, setMonths] = useState<{ year: number; month: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { categories, getCategory } = useCategories();

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      getMonthlySummary(selectedYear, selectedMonth),
      getAvailableMonths(),
    ]);
    setSummary(s);
    setMonths(m);
  }, [selectedYear, selectedMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const goToCategory = (categoryKey: string) => {
    navigation.navigate('Transactions', {
      screen: 'TransactionsList',
      params: { filterCategory: categoryKey },
    });
  };

  const pieData = summary
    ? Object.entries(summary.by_category)
        .filter(([, v]) => v > 0)
        .map(([cat, v]) => {
          const def = getCategory(cat);
          return {
            key: cat,
            name: def.label,
            amount: v,
            color: def.color,
            legendFontColor: '#333',
            legendFontSize: 12,
          };
        })
    : [];

  const topCategories = pieData
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Month selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
        {months.length === 0
          ? <TouchableOpacity style={[styles.monthChip, styles.monthChipActive]}>
              <Text style={styles.monthChipTextActive}>
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </Text>
            </TouchableOpacity>
          : months.map(m => {
              const active = m.year === selectedYear && m.month === selectedMonth;
              return (
                <TouchableOpacity
                  key={`${m.year}-${m.month}`}
                  style={[styles.monthChip, active && styles.monthChipActive]}
                  onPress={() => { setSelectedYear(m.year); setSelectedMonth(m.month); }}
                >
                  <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                    {MONTH_NAMES[m.month - 1]} {m.year}
                  </Text>
                </TouchableOpacity>
              );
            })
        }
      </ScrollView>

      {/* Total spend card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Spent</Text>
        <Text style={styles.totalAmount}>
          ${(summary?.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.totalSubLabel}>
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </Text>
      </View>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spending by Category</Text>
          <PieChart
            data={pieData}
            width={CHART_WIDTH - 32}
            height={200}
            chartConfig={chartConfig}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="0"
            absolute={false}
          />
        </View>
      )}

      {/* Top categories breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top Categories</Text>
        {topCategories.length === 0
          ? <Text style={styles.emptyText}>No transactions this month.</Text>
          : topCategories.map(item => {
              const pct = summary && summary.total > 0
                ? ((item.amount / summary.total) * 100).toFixed(1)
                : '0';
              return (
                <TouchableOpacity
                  key={item.name}
                  style={styles.categoryRow}
                  onPress={() => goToCategory(item.key)}
                >
                  <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
                  <Text style={styles.categoryName}>{item.name}</Text>
                  <Text style={styles.categoryPct}>{pct}%</Text>
                  <Text style={styles.categoryAmt}>
                    ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </TouchableOpacity>
              );
            })
        }
      </View>

      {/* All categories grid */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>All Categories</Text>
        <View style={styles.grid}>
          {categories.map(cat => {
            const amt = summary?.by_category[cat.key] ?? 0;
            return (
              <TouchableOpacity
                key={cat.key}
                style={styles.gridItem}
                onPress={() => goToCategory(cat.key)}
              >
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={24}
                  color={cat.color}
                />
                <Text style={styles.gridLabel}>{cat.label}</Text>
                <Text style={styles.gridAmt}>
                  {amt > 0 ? `$${amt.toFixed(0)}` : '—'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const chartConfig = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
  labelColor: () => '#333',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  monthScroll: { paddingHorizontal: 16, paddingVertical: 12 },
  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#e0e0e0', marginRight: 8,
  },
  monthChipActive: { backgroundColor: '#1976D2' },
  monthChipText: { color: '#555', fontWeight: '500' },
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
  totalCard: {
    margin: 16, marginTop: 4, padding: 24, borderRadius: 16,
    backgroundColor: '#1976D2', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
  totalAmount: { color: '#fff', fontSize: 40, fontWeight: '700', marginTop: 4 },
  totalSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  card: {
    margin: 16, marginTop: 0, padding: 16, borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 12 },
  emptyText: { color: '#999', textAlign: 'center', paddingVertical: 16 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  categoryDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  categoryName: { flex: 1, fontSize: 14, color: '#333' },
  categoryPct: { color: '#888', fontSize: 13, marginRight: 8 },
  categoryAmt: { fontSize: 14, fontWeight: '600', color: '#212121', width: 80, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  gridItem: {
    width: '25%', alignItems: 'center', paddingVertical: 12,
  },
  gridLabel: { fontSize: 10, color: '#666', marginTop: 4, textAlign: 'center' },
  gridAmt: { fontSize: 11, fontWeight: '600', color: '#333', marginTop: 2 },
});
