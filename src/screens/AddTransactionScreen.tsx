import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { showAlert, confirmAlert } from '../utils/alert';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  insertTransaction, updateTransaction,
  insertFoodItems, getFoodItemsForTransaction,
} from '../db/database';
import {
  Transaction, FoodItem, FoodSubcategory,
  KNOWN_SHOPS, KnownShop, ICON_CHOICES, COLOR_CHOICES,
} from '../types';
import { parseReceiptText, parseCsvStatement, parsePdfStatementText } from '../utils/statementParser';
import { extractPdfText } from '../utils/pdfParser';
import { pickFileWeb, readFileAsText, readFileAsBase64 } from '../utils/webFilePicker';
import { useCategories } from '../hooks/useCategories';

const FOOD_SUBCATS: { key: FoodSubcategory; label: string }[] = [
  { key: 'fruits', label: 'Fruits' },
  { key: 'vegetables', label: 'Vegetables' },
  { key: 'grains', label: 'Grains' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'prepared', label: 'Prepared' },
  { key: 'other', label: 'Other' },
];

interface FoodItemDraft {
  name: string;
  subcategory: FoodSubcategory;
  quantity_g: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  fibre_g: string;
}

const blankFood = (): FoodItemDraft => ({
  name: '', subcategory: 'other',
  quantity_g: '', protein_g: '', fat_g: '', carbs_g: '', fibre_g: '',
});

export default function AddTransactionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const existing: Transaction | undefined = route.params?.transaction;

  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<string>(existing?.category ?? 'food');
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '');
  const [shop, setShop] = useState<string>(existing?.shop ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [foodItems, setFoodItems] = useState<FoodItemDraft[]>([]);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState(ICON_CHOICES[0]);
  const [newCatColor, setNewCatColor] = useState(COLOR_CHOICES[0]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);

  const { categories, getCategory, addCategory } = useCategories();
  const selectedCategory = getCategory(category);

  const createCategory = async () => {
    if (!newCatLabel.trim()) {
      showAlert('Name required', 'Enter a name for the category.');
      return;
    }
    const created = await addCategory(newCatLabel, newCatIcon, newCatColor);
    setCategory(created.key);
    setNewCatLabel('');
    setNewCatIcon(ICON_CHOICES[0]);
    setNewCatColor(COLOR_CHOICES[0]);
    setShowNewCatForm(false);
    setShowCatPicker(false);
  };

  useEffect(() => {
    if (existing && existing.category === 'food') {
      getFoodItemsForTransaction(existing.id).then(items => {
        setFoodItems(items.map(i => ({
          name: i.name,
          subcategory: i.subcategory,
          quantity_g: String(i.quantity_g),
          protein_g: String(i.protein_g),
          fat_g: String(i.fat_g),
          carbs_g: String(i.carbs_g),
          fibre_g: String(i.fibre_g),
        })));
      });
    }
  }, [existing]);

  const save = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      showAlert('Invalid amount', 'Enter a valid dollar amount.');
      return;
    }
    if (!description.trim()) {
      showAlert('Missing description', 'Enter a description.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date, amount: parseFloat(amount), description: description.trim(),
        category, subcategory: subcategory || null,
        shop: shop || null, source: (existing?.source ?? 'manual') as any,
        notes: notes || null,
      };
      if (existing) {
        await updateTransaction({ ...payload, id: existing.id });
        if (category === 'food' && foodItems.length > 0) {
          await insertFoodItems(foodItems.map(fi => toFoodItem(fi, existing.id)));
        }
      } else {
        const id = await insertTransaction(payload);
        if (category === 'food' && foodItems.length > 0) {
          await insertFoodItems(foodItems.map(fi => toFoodItem(fi, id)));
        }
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const scanReceipt = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { showAlert('Camera permission denied'); return; }
    setScanning(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled) return;
      // On-device OCR placeholder — replace with MLKit/Tesseract integration
      showAlert(
        'Receipt scanned',
        'On-device OCR is ready to be wired to expo-mlkit-text-recognition. For now, fill in the details manually.',
      );
    } finally {
      setScanning(false);
    }
  };

  const importStatement = async () => {
    try {
      let isPdf: boolean;
      let parsed;

      if (Platform.OS === 'web') {
        // expo-document-picker's web implementation has a known Chrome bug where
        // it reports canceled:true even after a real file selection — bypass it
        // with our own picker on web.
        const file = await pickFileWeb('.csv,.pdf,text/csv,application/pdf');
        if (!file) return;

        isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          setImporting(true);
          const base64 = await readFileAsBase64(file);
          const text = await extractPdfText(base64);
          parsed = parsePdfStatementText(text);
        } else {
          const text = await readFileAsText(file);
          parsed = parseCsvStatement(text);
        }
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['text/csv', 'application/csv', 'text/comma-separated-values', 'application/pdf'],
        });
        if (result.canceled) return;

        const file = result.assets[0];
        isPdf = file.mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          setImporting(true);
          const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
          const text = await extractPdfText(base64);
          parsed = parsePdfStatementText(text);
        } else {
          const text = await FileSystem.readAsStringAsync(file.uri);
          parsed = parseCsvStatement(text);
        }
      }

      if (parsed.length === 0) {
        showAlert(
          'Could not parse statement',
          isPdf
            ? "We couldn't find transaction lines in this PDF. Its layout may differ from what we support yet, or it may be a scanned image rather than text. Try entering transactions manually, or let us know the bank so we can adjust."
            : undefined,
        );
        return;
      }
      confirmAlert(
        `Import ${parsed.length} transactions?`,
        `Found ${parsed.length} transactions in the file.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import', onPress: async () => {
              for (const p of parsed) {
                await insertTransaction({ ...p, subcategory: null, notes: null, source: 'statement' });
              }
              navigation.goBack();
            },
          },
        ],
      );
    } catch (e: any) {
      showAlert('Error', 'Could not read file: ' + (e?.message ?? 'unknown'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Scan / Import buttons */}
      <View style={styles.sourceRow}>
        <TouchableOpacity style={styles.sourceBtn} onPress={scanReceipt} disabled={scanning}>
          {scanning
            ? <ActivityIndicator size="small" color="#1976D2" />
            : <MaterialCommunityIcons name="camera" size={20} color="#1976D2" />}
          <Text style={styles.sourceBtnText}>Scan Bill</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sourceBtn} onPress={importStatement} disabled={importing}>
          {importing
            ? <ActivityIndicator size="small" color="#1976D2" />
            : <MaterialCommunityIcons name="file-import" size={20} color="#1976D2" />}
          <Text style={styles.sourceBtnText}>Import Statement</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.importHint}>Accepts PDF or CSV bank statements</Text>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or enter manually</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Category */}
      <Text style={styles.label}>Category</Text>
      <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowCatPicker(true)}>
        <MaterialCommunityIcons
          name={selectedCategory.icon as any}
          size={20}
          color={selectedCategory.color}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.selectorText}>{selectedCategory.label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color="#999" />
      </TouchableOpacity>

      {/* Date */}
      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#bbb"
      />

      {/* Amount */}
      <Text style={styles.label}>Amount ($)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="#bbb"
      />

      {/* Description */}
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Weekly grocery run"
        placeholderTextColor="#bbb"
      />

      {/* Shop */}
      <Text style={styles.label}>Shop</Text>
      <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowShopPicker(true)}>
        <Text style={[styles.selectorText, !shop && { color: '#bbb' }]}>
          {shop || 'Select shop…'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color="#999" />
      </TouchableOpacity>

      {/* Subcategory (food only) */}
      {category === 'food' && (
        <>
          <Text style={styles.label}>Food Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {FOOD_SUBCATS.map(s => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, subcategory === s.key && styles.chipActive]}
                onPress={() => setSubcategory(s.key)}
              >
                <Text style={[styles.chipText, subcategory === s.key && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Food items / macros */}
          <Text style={styles.sectionTitle}>Food Items & Macros</Text>
          {foodItems.map((fi, idx) => (
            <FoodItemRow
              key={idx}
              item={fi}
              onChange={updated => setFoodItems(prev => prev.map((x, i) => i === idx ? updated : x))}
              onDelete={() => setFoodItems(prev => prev.filter((_, i) => i !== idx))}
            />
          ))}
          <TouchableOpacity
            style={styles.addItemBtn}
            onPress={() => setFoodItems(prev => [...prev, blankFood()])}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#1976D2" />
            <Text style={styles.addItemText}>Add food item</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Notes */}
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Any notes…"
        multiline
        placeholderTextColor="#bbb"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>{existing ? 'Update' : 'Save Transaction'}</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Category picker modal */}
      <Modal visible={showCatPicker} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => { setShowCatPicker(false); setShowNewCatForm(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Choose Category</Text>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.modalRow}
                  onPress={() => { setCategory(cat.key); setShowCatPicker(false); }}
                >
                  <MaterialCommunityIcons
                    name={cat.icon as any}
                    size={22}
                    color={cat.color}
                    style={{ marginRight: 12 }}
                  />
                  <Text style={styles.modalRowText}>{cat.label}</Text>
                  {category === cat.key && <MaterialCommunityIcons name="check" size={18} color="#1976D2" />}
                </TouchableOpacity>
              ))}

              {!showNewCatForm ? (
                <TouchableOpacity style={styles.modalRow} onPress={() => setShowNewCatForm(true)}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#1976D2" style={{ marginRight: 12 }} />
                  <Text style={[styles.modalRowText, { color: '#1976D2', fontWeight: '600' }]}>
                    Add new category
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.newCatForm}>
                  <TextInput
                    style={styles.input}
                    value={newCatLabel}
                    onChangeText={setNewCatLabel}
                    placeholder="Category name"
                    placeholderTextColor="#bbb"
                  />
                  <Text style={styles.label}>Icon</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {ICON_CHOICES.map(icon => (
                      <TouchableOpacity
                        key={icon}
                        style={[styles.iconSwatch, newCatIcon === icon && styles.iconSwatchActive]}
                        onPress={() => setNewCatIcon(icon)}
                      >
                        <MaterialCommunityIcons name={icon as any} size={20} color={newCatIcon === icon ? '#fff' : '#555'} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.label}>Color</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {COLOR_CHOICES.map(color => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: color },
                          newCatColor === color && styles.colorSwatchActive,
                        ]}
                        onPress={() => setNewCatColor(color)}
                      >
                        {newCatColor === color && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1, marginTop: 0, backgroundColor: '#e0e0e0' }]}
                      onPress={() => setShowNewCatForm(false)}
                    >
                      <Text style={[styles.saveBtnText, { color: '#555' }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1, marginTop: 0 }]}
                      onPress={createCategory}
                    >
                      <Text style={styles.saveBtnText}>Create</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Shop picker modal */}
      <Modal visible={showShopPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowShopPicker(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose Shop</Text>
            {KNOWN_SHOPS.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.modalRow}
                onPress={() => { setShop(s); setShowShopPicker(false); }}
              >
                <Text style={styles.modalRowText}>{s}</Text>
                {shop === s && <MaterialCommunityIcons name="check" size={18} color="#1976D2" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalRow}
              onPress={() => setShowShopPicker(false)}
            >
              <Text style={[styles.modalRowText, { color: '#999' }]}>Enter manually above</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function FoodItemRow({
  item, onChange, onDelete,
}: {
  item: FoodItemDraft;
  onChange: (updated: FoodItemDraft) => void;
  onDelete: () => void;
}) {
  const field = (key: keyof FoodItemDraft, placeholder: string, keyboard: any = 'default') => (
    <TextInput
      style={styles.macroInput}
      value={item[key]}
      onChangeText={v => onChange({ ...item, [key]: v })}
      placeholder={placeholder}
      placeholderTextColor="#ccc"
      keyboardType={keyboard}
    />
  );

  return (
    <View style={styles.foodRow}>
      <View style={styles.foodRowHeader}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={item.name}
          onChangeText={v => onChange({ ...item, name: v })}
          placeholder="Item name"
          placeholderTextColor="#bbb"
        />
        <TouchableOpacity onPress={onDelete} style={{ marginLeft: 8, padding: 4 }}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#E53935" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        {FOOD_SUBCATS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.chip, styles.chipSm, item.subcategory === s.key && styles.chipActive]}
            onPress={() => onChange({ ...item, subcategory: s.key })}
          >
            <Text style={[styles.chipText, item.subcategory === s.key && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.macroRow}>
        {field('quantity_g', 'g', 'decimal-pad')}
        {field('protein_g', 'Protein g', 'decimal-pad')}
        {field('fat_g', 'Fat g', 'decimal-pad')}
        {field('carbs_g', 'Carbs g', 'decimal-pad')}
        {field('fibre_g', 'Fibre g', 'decimal-pad')}
      </View>
      <Text style={styles.macroHint}>qty · protein · fat · carbs · fibre</Text>
    </View>
  );
}

function toFoodItem(fi: FoodItemDraft, transaction_id: number): Omit<FoodItem, 'id'> {
  return {
    transaction_id,
    name: fi.name,
    subcategory: fi.subcategory,
    quantity_g: parseFloat(fi.quantity_g) || 0,
    protein_g: parseFloat(fi.protein_g) || 0,
    fat_g: parseFloat(fi.fat_g) || 0,
    carbs_g: parseFloat(fi.carbs_g) || 0,
    fibre_g: parseFloat(fi.fibre_g) || 0,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  sourceRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  sourceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  sourceBtnText: { color: '#1976D2', fontWeight: '600', fontSize: 14 },
  importHint: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: -8, marginBottom: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#ddd' },
  dividerText: { marginHorizontal: 12, color: '#bbb', fontSize: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: '#212121', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  selectorText: { flex: 1, fontSize: 15, color: '#212121' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#e8e8e8', marginRight: 8,
  },
  chipSm: { paddingHorizontal: 10, paddingVertical: 4 },
  chipActive: { backgroundColor: '#1976D2' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10 },
  foodRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  foodRowHeader: { flexDirection: 'row', alignItems: 'center' },
  macroRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  macroInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, color: '#333',
    textAlign: 'center',
  },
  macroHint: { fontSize: 10, color: '#bbb', textAlign: 'center', marginTop: 4 },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6, marginBottom: 16,
  },
  addItemText: { color: '#1976D2', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    backgroundColor: '#1976D2', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#212121', marginBottom: 16 },
  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  modalRowText: { flex: 1, fontSize: 15, color: '#333' },
  newCatForm: { paddingTop: 12 },
  iconSwatch: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  iconSwatchActive: { backgroundColor: '#1976D2' },
  colorSwatch: {
    width: 32, height: 32, borderRadius: 16, marginRight: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchActive: { borderWidth: 2, borderColor: '#212121' },
});
