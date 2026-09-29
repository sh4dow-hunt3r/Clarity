import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getApiKey, setApiKey, clearApiKey } from '../utils/aiSettings';
import { identifyMerchantAI } from '../utils/aiService';
import {
  getTransactions, getMerchantAlias, setMerchantAlias, updateTransactionMerchant,
} from '../db/database';
import { useCategories } from '../hooks/useCategories';
import { showAlert } from '../utils/alert';

export default function SettingsScreen() {
  const [keyInput, setKeyInput] = useState('');
  const [savedKeyPresent, setSavedKeyPresent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupProgress, setCleanupProgress] = useState<{ done: number; total: number } | null>(null);
  const { categories } = useCategories();

  const load = useCallback(async () => {
    const existing = await getApiKey();
    setSavedKeyPresent(!!existing);
    if (existing) setKeyInput(existing);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!keyInput.trim()) {
      showAlert('Enter a key', 'Paste your Anthropic API key first, or use Remove to clear it.');
      return;
    }
    setSaving(true);
    try {
      await setApiKey(keyInput);
      setSavedKeyPresent(true);
      showAlert('Saved', 'Your API key has been saved securely on this device.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await clearApiKey();
    setKeyInput('');
    setSavedKeyPresent(false);
    showAlert('Removed', 'Your API key has been deleted from this device.');
  };

  const cleanUpMerchantNames = async () => {
    const all = await getTransactions();
    // Only transactions that still look like raw statement text are worth
    // touching — skip ones that already match their cached clean name.
    const candidates = all.filter(t => {
      const rawKey = t.raw_description ?? t.description;
      return t.source === 'statement' && rawKey !== t.description;
    });

    if (candidates.length === 0) {
      showAlert('Nothing to clean', 'All your imported transactions already look clean, or none were imported from a statement.');
      return;
    }

    const hasKey = savedKeyPresent;
    setCleaning(true);
    setCleanupProgress({ done: 0, total: candidates.length });
    let updated = 0;
    let apiCalls = 0;

    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i];
      const rawKey = t.raw_description ?? t.description;
      try {
        const cached = await getMerchantAlias(rawKey);
        if (cached) {
          await updateTransactionMerchant(t.id, cached.cleanName, cached.category ?? t.category);
          updated++;
        } else if (hasKey) {
          const result = await identifyMerchantAI(rawKey, t.amount, categories);
          apiCalls++;
          if (result) {
            await setMerchantAlias(rawKey, result.cleanName, result.category);
            await updateTransactionMerchant(t.id, result.cleanName, result.category);
            updated++;
          }
        }
      } catch {
        // Skip this one and keep going — a single failure shouldn't stop
        // the whole cleanup pass.
      }
      setCleanupProgress({ done: i + 1, total: candidates.length });
    }

    setCleaning(false);
    setCleanupProgress(null);
    const skipped = candidates.length - updated;
    showAlert(
      'Cleanup complete',
      `Updated ${updated} of ${candidates.length} transactions` +
        (apiCalls > 0 ? ` (${apiCalls} new merchant${apiCalls === 1 ? '' : 's'} looked up via AI).` : ' using the cache only — no AI calls needed.') +
        (!hasKey && skipped > 0 ? `\n\n${skipped} transactions had no cached name and were left as-is — add an API key to resolve those too.` : ''),
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons name="robot-outline" size={24} color="#1976D2" />
          <Text style={styles.cardTitle}>AI Features</Text>
        </View>
        <Text style={styles.cardDesc}>
          Add an Anthropic API key to enable AI-powered transaction categorization
          and monthly spending insights. Your key is stored securely on this device
          and is only ever sent directly to Anthropic's API.
        </Text>

        <Text style={styles.label}>Anthropic API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={styles.keyInput}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="sk-ant-..."
            placeholderTextColor="#bbb"
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} style={styles.eyeBtn}>
            <MaterialCommunityIcons name={showKey ? 'eye-off' : 'eye'} size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <MaterialCommunityIcons
            name={savedKeyPresent ? 'check-circle' : 'information-outline'}
            size={16}
            color={savedKeyPresent ? '#4CAF50' : '#999'}
          />
          <Text style={styles.statusText}>
            {savedKeyPresent ? 'A key is currently saved' : 'No key saved — AI features are disabled'}
          </Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save Key</Text>}
          </TouchableOpacity>
          {savedKeyPresent && (
            <TouchableOpacity style={styles.removeBtn} onPress={remove}>
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={() => showAlert(
            'Getting an API key',
            'Visit console.anthropic.com, sign in or create an account, and generate a new API key from the API Keys section. Usage is billed per request at a small fraction of a cent.',
          )}
        >
          <Text style={styles.helpLink}>Don't have a key? Tap here for instructions.</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons name="broom" size={24} color="#7B1FA2" />
          <Text style={styles.cardTitle}>Clean Up Merchant Names</Text>
        </View>
        <Text style={styles.cardDesc}>
          Rewrites messy imported names like "IMAGINUS CANADA LIMITE TORONTO ON" into
          readable ones like "Imaginus". Checks a local cache first — each merchant is only
          ever sent to the AI once, no matter how many transactions or future imports use it.
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: '#7B1FA2' }]}
          onPress={cleanUpMerchantNames}
          disabled={cleaning}
        >
          {cleaning
            ? <Text style={styles.saveBtnText}>
                Cleaning… {cleanupProgress ? `${cleanupProgress.done}/${cleanupProgress.total}` : ''}
              </Text>
            : <Text style={styles.saveBtnText}>Clean Up Now</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#212121' },
  cardDesc: { fontSize: 13, color: '#777', lineHeight: 19, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  keyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f5f5', borderRadius: 10,
    paddingHorizontal: 12,
  },
  keyInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#212121' },
  eyeBtn: { padding: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  statusText: { fontSize: 12, color: '#777' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  saveBtn: {
    flex: 1, backgroundColor: '#1976D2', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  removeBtn: {
    paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: '#fdecea',
  },
  removeBtnText: { color: '#E53935', fontWeight: '700', fontSize: 15 },
  helpLink: { color: '#1976D2', fontSize: 13, marginTop: 16, textAlign: 'center' },
});
