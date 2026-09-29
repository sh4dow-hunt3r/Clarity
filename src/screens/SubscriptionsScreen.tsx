import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  getTransactions, getIgnoredSubscriptionKeys,
  ignoreSubscription, unignoreSubscription,
} from '../db/database';
import { detectSubscriptions, DetectedSubscription } from '../utils/subscriptionDetector';
import { useCategories } from '../hooks/useCategories';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function SubscriptionsScreen() {
  const [active, setActive] = useState<DetectedSubscription[]>([]);
  const [ignored, setIgnored] = useState<DetectedSubscription[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { getCategory } = useCategories();

  const load = useCallback(async () => {
    const [allTxns, ignoredKeys] = await Promise.all([
      getTransactions(),
      getIgnoredSubscriptionKeys(),
    ]);
    const detected = detectSubscriptions(allTxns);
    setActive(detected.filter(s => !ignoredKeys.has(s.key)));
    setIgnored(detected.filter(s => ignoredKeys.has(s.key)));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const monthlyTotal = active.reduce((s, sub) => s + sub.averageAmount, 0);
  const list = showIgnored ? ignored : active;

  return (
    <View style={styles.container}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Estimated Monthly Subscriptions</Text>
        <Text style={styles.totalAmount}>${monthlyTotal.toFixed(2)}</Text>
        <Text style={styles.totalSubLabel}>
          {active.length} detected {active.length === 1 ? 'subscription' : 'subscriptions'}
        </Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, !showIgnored && styles.toggleBtnActive]}
          onPress={() => setShowIgnored(false)}
        >
          <Text style={[styles.toggleText, !showIgnored && styles.toggleTextActive]}>
            Active ({active.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, showIgnored && styles.toggleBtnActive]}
          onPress={() => setShowIgnored(true)}
        >
          <Text style={[styles.toggleText, showIgnored && styles.toggleTextActive]}>
            Ignored ({ignored.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={styles.list}
        data={list}
        keyExtractor={s => s.key}
        contentContainerStyle={list.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-sync" size={48} color="#ddd" />
            <Text style={styles.emptyText}>
              {showIgnored ? 'No ignored subscriptions.' : 'No subscriptions detected yet.'}
            </Text>
            {!showIgnored && (
              <Text style={styles.emptySubtext}>
                Import or add a few months of transactions from the same merchant to detect recurring charges.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const def = getCategory(item.category);
          return (
            <View style={styles.card}>
              <View style={[styles.iconCircle, { backgroundColor: def.color + '22' }]}>
                <MaterialCommunityIcons name={def.icon as any} size={22} color={def.color} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  ~every {item.intervalDays} days · {item.occurrences} charges seen
                </Text>
                <Text style={styles.cardMeta}>
                  Last: {formatDate(item.lastDate)} · Next est.: {formatDate(item.estimatedNextDate)}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.cardAmt}>${item.averageAmount.toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.ignoreBtn}
                  onPress={async () => {
                    if (showIgnored) await unignoreSubscription(item.key);
                    else await ignoreSubscription(item.key);
                    load();
                  }}
                >
                  <Text style={styles.ignoreBtnText}>{showIgnored ? 'Restore' : 'Not a subscription'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  totalCard: {
    margin: 16, marginBottom: 8, padding: 24, borderRadius: 16,
    backgroundColor: '#7B1FA2', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  totalAmount: { color: '#fff', fontSize: 36, fontWeight: '700', marginTop: 4 },
  totalSubLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  toggleRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#e8e8e8', alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#7B1FA2' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#666' },
  toggleTextActive: { color: '#fff' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: '#bbb', marginTop: 12, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: '#ccc', marginTop: 8, textAlign: 'center', lineHeight: 18 },
  card: {
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
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#212121' },
  cardMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardAmt: { fontSize: 16, fontWeight: '700', color: '#7B1FA2' },
  ignoreBtn: { marginTop: 8 },
  ignoreBtnText: { fontSize: 11, color: '#1976D2', fontWeight: '600' },
});
