import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getImportBatches, deleteImportBatch, ImportBatch } from '../db/database';
import { confirmAlert } from '../utils/alert';

export default function ImportBatchesScreen() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);

  const load = useCallback(async () => {
    setBatches(await getImportBatches());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmDelete = (batch: ImportBatch) => {
    confirmAlert(
      'Delete this import?',
      `This will permanently delete all ${batch.count} transactions from "${batch.filename ?? 'this import'}". This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => { await deleteImportBatch(batch.batch); load(); },
        },
      ],
    );
  };

  return (
    <FlatList
      style={styles.container}
      data={batches}
      keyExtractor={b => b.batch}
      contentContainerStyle={batches.length === 0 ? styles.emptyContainer : styles.listContent}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-import-outline" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No imported statements yet.</Text>
          <Text style={styles.emptySubtext}>
            Statements you import via "Import Statement" will show up here, so you can undo one if it's imported twice.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="file-document-outline" size={22} color="#1976D2" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.filename ?? 'Unnamed import'}</Text>
            <Text style={styles.cardMeta}>
              {item.count} transactions · ${item.total.toFixed(2)} total
            </Text>
            <Text style={styles.cardMeta}>
              Imported {new Date(item.importedAt).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(item)}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#E53935" />
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  listContent: { padding: 16 },
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
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#E3F2FD',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#212121' },
  cardMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  deleteBtn: { padding: 8 },
});
