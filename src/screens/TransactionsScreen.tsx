import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { getTransactions, deleteTransaction } from '../db/database';
import { Transaction } from '../types';
import { useCategories } from '../hooks/useCategories';
import { confirmAlert } from '../utils/alert';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TransactionsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const { categories, getCategory } = useCategories();

  const load = useCallback(async () => {
    const txns = await getTransactions(filterCat ? { category: filterCat } : undefined);
    setTransactions(txns);
  }, [filterCat]);

  // Dashboard navigates here with a `filterCategory` param to jump straight
  // into a filtered view — apply it, then clear it so it doesn't stick around
  // on subsequent visits to this tab.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.filterCategory) {
        setFilterCat(route.params.filterCategory);
        navigation.setParams({ filterCategory: undefined });
      }
    }, [route.params?.filterCategory]),
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = search
    ? transactions.filter(t =>
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        (t.shop ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : transactions;

  const confirmDelete = (id: number) => {
    confirmAlert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteTransaction(id); load(); },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#bbb"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...categories.map(c => c.key)]}
        keyExtractor={item => item ?? 'all'}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = filterCat === item;
          const def = item ? getCategory(item) : null;
          return (
            <TouchableOpacity
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilterCat(item)}
            >
              {def && (
                <MaterialCommunityIcons
                  name={def.icon as any}
                  size={14}
                  color={active ? '#fff' : def.color}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {def ? def.label : 'All'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Transaction list */}
      <FlatList
        data={filtered}
        keyExtractor={t => String(t.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No transactions yet.</Text>
            <Text style={styles.emptySubtext}>Tap + to add one.</Text>
          </View>
        }
        renderItem={({ item: t }) => {
          const def = getCategory(t.category);
          return (
            <TouchableOpacity
              style={styles.txnCard}
              onPress={() => navigation.navigate('AddTransaction', { transaction: t })}
              onLongPress={() => confirmDelete(t.id)}
            >
              <View style={[styles.iconCircle, { backgroundColor: def.color + '22' }]}>
                <MaterialCommunityIcons
                  name={def.icon as any}
                  size={22}
                  color={def.color}
                />
              </View>
              <View style={styles.txnInfo}>
                <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
                <Text style={styles.txnMeta}>
                  {t.shop ? `${t.shop} · ` : ''}{formatDate(t.date)}
                </Text>
              </View>
              <Text style={styles.txnAmt}>-${t.amount.toFixed(2)}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddTransaction', {})}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#333', padding: 0 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#e8e8e8',
  },
  filterChipActive: { backgroundColor: '#1976D2' },
  filterChipText: { fontSize: 12, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 90 },
  emptyContainer: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#bbb', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#ccc', marginTop: 4 },
  txnCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 15, fontWeight: '600', color: '#212121' },
  txnMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  txnAmt: { fontSize: 16, fontWeight: '700', color: '#E53935' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
});
