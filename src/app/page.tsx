'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Cake,
  Printer,
  DollarSign,
  Settings,
  Plus,
  Trash2,
  ChevronDown,
  User,
  Calendar,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

/* ========= Tipos ========= */
interface Flavor {
  name: string;
  pricePerKg: number;
}

interface Client {
  id: string;
  name: string;
  phone: string;
}

interface Extra {
  id: string;
  name: string;
  price: number;
}

interface AppConfig {
  id: 'config';
  decoratedSurcharge: number;
}

type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'canceled';

interface Order {
  id: string;
  type: 'ready' | 'custom';
  sizeKg: number;
  flavorName: string;
  doughColor: string;
  price: number;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  deliveryDate?: string;
  status: OrderStatus;
  createdAt: string;
  notes?: string;
  decorated?: boolean;
  decoratedSurcharge?: number;
  extras?: { id: string; name: string; price: number }[];
}

type StoreName = 'flavors' | 'clients' | 'orders' | 'extras' | 'config';
type StoreMap = {
  flavors: Flavor;
  clients: Client;
  orders: Order;
  extras: Extra;
  config: AppConfig;
};

const DEFAULT_DECORATED_SURCHARGE = 60;

const defaultFlavors: Flavor[] = [
  { name: 'Chocolate', pricePerKg: 50 },
  { name: 'Baunilha', pricePerKg: 45 },
  { name: 'Morango', pricePerKg: 55 },
  { name: 'Limão', pricePerKg: 40 },
];

const doughColors = ['Branco', 'Chocolate', 'Rosa', 'Azul', 'Verde', 'Vermelho'];

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const toNumber = (s: string) => {
  if (!s) return NaN;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/* ========= IndexedDB ========= */
const isBrowser = typeof window !== 'undefined';
const hasIndexedDB = isBrowser && typeof window.indexedDB !== 'undefined';
// Bumped para 4 — adiciona stores 'extras' e 'config' sem apagar dados existentes
const DB_VERSION = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB) throw new Error('IndexedDB não suportado neste ambiente.');
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('cakeDB', DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('flavors'))
        db.createObjectStore('flavors', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('clients'))
        db.createObjectStore('clients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('orders')) {
        const os = db.createObjectStore('orders', { keyPath: 'id' });
        try {
          os.createIndex('deliveryDate', 'deliveryDate', { unique: false });
          os.createIndex('status', 'status', { unique: false });
        } catch { /* ignore */ }
      }
      if (!db.objectStoreNames.contains('extras'))
        db.createObjectStore('extras', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config'))
        db.createObjectStore('config', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
  });

  return dbPromise;
}

async function idbGetAll<K extends StoreName>(storeName: K): Promise<StoreMap[K][]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as StoreMap[K][]);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

async function idbPut<K extends StoreName>(storeName: K, value: StoreMap[K]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbBulkPut<K extends StoreName>(storeName: K, values: StoreMap[K][]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbDelete<K extends StoreName>(storeName: K, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ========= localStorage fallback ========= */
const lsKeys: Record<StoreName, string> = {
  flavors: 'cakeFlavors',
  clients: 'cakeClients',
  orders: 'cakeOrders',
  extras: 'cakeExtras',
  config: 'cakeConfig',
};

function getKeyValue<K extends StoreName>(store: K, item: StoreMap[K]): string {
  if (store === 'flavors') return (item as Flavor).name;
  return (item as { id: string }).id;
}

function readFromLocalStorage<K extends StoreName>(store: K): StoreMap[K][] {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(lsKeys[store]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as StoreMap[K][] : [];
  } catch { return []; }
}

interface StorageAdapter {
  getAll<K extends StoreName>(store: K): Promise<StoreMap[K][]>;
  bulkPut<K extends StoreName>(store: K, values: StoreMap[K][]): Promise<void>;
  put<K extends StoreName>(store: K, value: StoreMap[K]): Promise<void>;
  delete<K extends StoreName>(store: K, key: string): Promise<void>;
}

const storage: StorageAdapter = {
  async getAll(store) {
    if (hasIndexedDB) return idbGetAll(store);
    return readFromLocalStorage(store);
  },
  async bulkPut(store, values) {
    if (hasIndexedDB) return idbBulkPut(store, values);
    if (!isBrowser) return;
    window.localStorage.setItem(lsKeys[store], JSON.stringify(values));
  },
  async put(store, value) {
    if (hasIndexedDB) return idbPut(store, value);
    if (!isBrowser) return;
    const current = readFromLocalStorage(store);
    const idx = current.findIndex((x) => getKeyValue(store, x) === getKeyValue(store, value));
    if (idx >= 0) current[idx] = value; else current.push(value);
    window.localStorage.setItem(lsKeys[store], JSON.stringify(current));
  },
  async delete(store, key) {
    if (hasIndexedDB) return idbDelete(store, key);
    if (!isBrowser) return;
    const current = readFromLocalStorage(store);
    window.localStorage.setItem(lsKeys[store], JSON.stringify(
      current.filter((x) => getKeyValue(store, x) !== key)
    ));
  },
};

/* ========= Helpers ========= */
function formatPhone(input: string) {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function buildWhatsAppLink(order: Order): string {
  const name = order.clientName || 'cliente';
  const date = order.deliveryDate
    ? new Date(order.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';
  const decorated = order.decorated ? '\n🎨 Decorado' : '';
  const extrasLine = order.extras?.length
    ? '\n➕ Adicionais: ' + order.extras.map((e) => `${e.name} (${formatBRL(e.price)})`).join(', ')
    : '';
  const notes = order.notes?.trim() ? `\n📝 Obs: ${order.notes.trim()}` : '';
  const msg = `Olá ${name}! 🎂\n\nSeu pedido está confirmado:\n• Sabor: ${order.flavorName}\n• Tamanho: ${order.sizeKg} kg\n• Cor da massa: ${order.doughColor}${decorated}${extrasLine}${notes}\n• Valor total: ${formatBRL(order.price)}${date ? `\n• Entrega: ${date}` : ''}\n\nQualquer dúvida, é só chamar! 😊`;
  const phone = order.clientPhone?.replace(/\D/g, '') || '';
  const base = phone ? `https://wa.me/55${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(msg)}`;
}

/* ========= Componente principal ========= */
export default function Home() {
  const [orderType, setOrderType] = useState<'ready' | 'custom'>('ready');
  const [size, setSize] = useState('');
  const [flavor, setFlavor] = useState('');
  const [doughColor, setDoughColor] = useState('');
  const [decorated, setDecorated] = useState(false);
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [decoratedSurcharge, setDecoratedSurcharge] = useState(DEFAULT_DECORATED_SURCHARGE);

  const [showManageFlavors, setShowManageFlavors] = useState(false);
  const [showManageClients, setShowManageClients] = useState(false);
  const [showManageExtras, setShowManageExtras] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorPrice, setNewFlavorPrice] = useState('');
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState('');
  const [editDecoratedPrice, setEditDecoratedPrice] = useState('');

  const [showNote, setShowNote] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [today, setToday] = useState('');

  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!isBrowser) return;
    setToday(new Date().toLocaleDateString('pt-BR'));
    let ignore = false;

    async function init() {
      try {
        let storedFlavors = await storage.getAll('flavors');
        if (hasIndexedDB && storedFlavors.length === 0) {
          const localRaw = window.localStorage.getItem(lsKeys.flavors);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                await storage.bulkPut('flavors', parsed as Flavor[]);
                storedFlavors = parsed as Flavor[];
              }
              window.localStorage.removeItem(lsKeys.flavors);
            } catch { /* ignore */ }
          }
        }
        if (storedFlavors.length === 0) {
          await storage.bulkPut('flavors', defaultFlavors);
          storedFlavors = defaultFlavors;
        }
        if (!ignore) setFlavors(storedFlavors);

        let storedClients = await storage.getAll('clients');
        if (hasIndexedDB && storedClients.length === 0) {
          const localRaw = window.localStorage.getItem(lsKeys.clients);
          if (localRaw) {
            try {
              const parsed = JSON.parse(localRaw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                await storage.bulkPut('clients', parsed as Client[]);
                storedClients = parsed as Client[];
              }
              window.localStorage.removeItem(lsKeys.clients);
            } catch { /* ignore */ }
          }
        }
        if (!ignore) setClients(storedClients);

        const storedExtras = await storage.getAll('extras');
        if (!ignore) setExtras(storedExtras);

        const storedConfig = await storage.getAll('config');
        const cfg = storedConfig.find((c) => c.id === 'config');
        const val = cfg?.decoratedSurcharge ?? DEFAULT_DECORATED_SURCHARGE;
        if (!ignore) {
          setDecoratedSurcharge(val);
          setEditDecoratedPrice(String(val).replace('.', ','));
        }
      } catch (err) {
        console.error('Falha ao inicializar dados', err);
        if (!ignore) setMessage({ type: 'error', text: 'Falha ao carregar dados locais.' });
      } finally {
        if (!ignore) setInitializing(false);
      }
    }

    init();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find((c) => c.id === selectedClientId);
      if (client) { setClientName(client.name); setClientPhone(client.phone); }
    }
  }, [selectedClientId, clients]);

  const selectedFlavor = useMemo(() => flavors.find((f) => f.name === flavor), [flavors, flavor]);
  const kg = useMemo(() => toNumber(size), [size]);
  const basePrice = useMemo(() => {
    if (!selectedFlavor || !Number.isFinite(kg) || kg <= 0) return 0;
    return kg * selectedFlavor.pricePerKg;
  }, [kg, selectedFlavor]);
  const decoratedExtra = useMemo(() => (decorated ? decoratedSurcharge : 0), [decorated, decoratedSurcharge]);
  const selectedExtras = useMemo(() => extras.filter((e) => selectedExtraIds.includes(e.id)), [extras, selectedExtraIds]);
  const extrasTotal = useMemo(() => selectedExtras.reduce((s, e) => s + e.price, 0), [selectedExtras]);
  const price = useMemo(() => basePrice + decoratedExtra + extrasTotal, [basePrice, decoratedExtra, extrasTotal]);

  const isFormValid = useMemo(() => {
    const basicValid = Boolean(selectedFlavor && Number.isFinite(kg) && kg > 0 && doughColor);
    if (orderType === 'ready') return basicValid;
    return basicValid && clientName.trim() && clientPhone.trim() && deliveryDate;
  }, [orderType, selectedFlavor, kg, doughColor, clientName, clientPhone, deliveryDate]);

  async function saveOrder(): Promise<Order> {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const order: Order = {
      id,
      type: orderType,
      sizeKg: Number(kg),
      flavorName: flavor,
      doughColor,
      price,
      clientId: selectedClientId || undefined,
      clientName: clientName || undefined,
      clientPhone: clientPhone || undefined,
      deliveryDate: orderType === 'custom' ? deliveryDate : undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: notes?.trim() || undefined,
      decorated: decorated || undefined,
      decoratedSurcharge: decorated ? decoratedSurcharge : undefined,
      extras: selectedExtras.length > 0 ? selectedExtras.map((e) => ({ id: e.id, name: e.name, price: e.price })) : undefined,
    };
    await storage.put('orders', order);
    try {
      if (isBrowser && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('cake_sync');
        bc.postMessage({ type: 'orders_changed', id: order.id });
        bc.close();
      }
    } catch { /* ignore */ }
    return order;
  }

  const handleGenerateNote = async () => {
    if (!isFormValid) return;
    try {
      setSaving(true);
      const order = await saveOrder();
      setCurrentOrder(order);
      setShowNote(true);
      setMessage({ type: 'success', text: 'Pedido salvo e nota gerada.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Não foi possível salvar o pedido.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDecoratedPrice = async () => {
    const val = toNumber(editDecoratedPrice);
    if (!Number.isFinite(val) || val < 0) return;
    try {
      setSaving(true);
      await storage.put('config', { id: 'config', decoratedSurcharge: val });
      setDecoratedSurcharge(val);
      setMessage({ type: 'success', text: 'Valor do decorado atualizado.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddExtra = async () => {
    const name = newExtraName.trim();
    const p = toNumber(newExtraPrice);
    if (!name || !Number.isFinite(p) || p < 0) return;
    try {
      setSaving(true);
      const extra: Extra = { id: Date.now().toString(), name, price: p };
      await storage.put('extras', extra);
      setExtras((prev) => [...prev, extra]);
      setNewExtraName(''); setNewExtraPrice('');
      setMessage({ type: 'success', text: 'Adicional salvo.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível salvar o adicional.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveExtra = async (id: string) => {
    try {
      setSaving(true);
      await storage.delete('extras', id);
      setExtras((prev) => prev.filter((e) => e.id !== id));
      setSelectedExtraIds((prev) => prev.filter((x) => x !== id));
      setMessage({ type: 'success', text: 'Adicional removido.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível remover.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddFlavor = async () => {
    const name = newFlavorName.trim();
    const parsedPrice = toNumber(newFlavorPrice);
    if (!name || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return;
    try {
      setSaving(true);
      await storage.put('flavors', { name, pricePerKg: parsedPrice });
      setFlavors((prev) => {
        const exists = prev.some((f) => f.name.toLowerCase() === name.toLowerCase());
        if (exists) return prev.map((f) => f.name.toLowerCase() === name.toLowerCase() ? { ...f, pricePerKg: parsedPrice } : f);
        return [...prev, { name, pricePerKg: parsedPrice }];
      });
      setNewFlavorName(''); setNewFlavorPrice('');
      setMessage({ type: 'success', text: 'Sabor salvo com sucesso.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível salvar o sabor.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFlavor = async (flavorName: string) => {
    try {
      setSaving(true);
      await storage.delete('flavors', flavorName);
      setFlavors((prev) => prev.filter((f) => f.name !== flavorName));
      if (flavor === flavorName) setFlavor('');
      setMessage({ type: 'success', text: 'Sabor removido.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível remover o sabor.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddClient = async () => {
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (!name || !phone) return;
    const newClient: Client = { id: Date.now().toString(), name, phone };
    try {
      setSaving(true);
      await storage.put('clients', newClient);
      setClients((prev) => [...prev, newClient]);
      setSelectedClientId(newClient.id);
      setMessage({ type: 'success', text: 'Cliente salvo.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível salvar o cliente.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveClient = async (clientId: string) => {
    try {
      setSaving(true);
      await storage.delete('clients', clientId);
      setClients((prev) => prev.filter((c) => c.id !== clientId));
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível remover o cliente.' });
    } finally {
      setSaving(false);
    }
  };

  const handleNewOrder = () => {
    setShowNote(false); setCurrentOrder(null);
    setSize(''); setFlavor(''); setDoughColor('');
    setDecorated(false); setSelectedExtraIds([]);
    setOrderType('ready');
    setSelectedClientId(''); setClientName(''); setClientPhone('');
    setDeliveryDate(''); setNotes('');
    setMessage({ type: 'success', text: 'Pronto para um novo pedido.' });
  };

  const toggleExtra = (id: string) =>
    setSelectedExtraIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50 p-4 sm:p-6">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-nota {
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 11px !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
          }
          .print-nota * {
            background: white !important;
            color: black !important;
            border-color: #ccc !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .print-nota .grid { display: block !important; }
          .print-nota .grid > div {
            display: flex !important;
            justify-content: space-between !important;
            border-bottom: 1px dashed #ccc !important;
            padding: 3px 0 !important;
            margin: 0 !important;
            background: none !important;
            border-left: none !important;
            border-right: none !important;
            border-top: none !important;
            border-radius: 0 !important;
          }
          .print-nota svg { display: none !important; }
          .print-nota .space-y-3 > * + * { margin-top: 4px !important; }
        }
      ` }} />

      {message && (
        <div role="status" aria-live="polite" className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-sm ${message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {message.text}
        </div>
      )}

      <div className="max-w-md mx-auto space-y-6 no-print">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 ring-1 ring-pink-100 shadow-sm backdrop-blur">
            <Cake className="w-4 h-4 text-pink-600" />
            <span className="text-xs font-medium text-pink-700">Sistema de Encomendas de Bolo</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-fuchsia-600">
            Pronta Entrega
          </h1>
          <p className="text-gray-600 mt-2">Crie e imprima notas rapidamente</p>
          <div className="mt-3">
            <Link href="/entregas" className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-white border border-pink-200 shadow-sm hover:bg-pink-50 transition">
              <Calendar className="w-4 h-4 text-pink-600" />
              Ver Entregas
            </Link>
          </div>
        </div>

        {/* Card principal */}
        <div className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-2xl shadow-lg ring-1 ring-pink-100 overflow-hidden">
          <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-pink-900">
              <Cake className="w-5 h-5 text-pink-600" />
              Novo Pedido
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {initializing ? (
              <div className="space-y-3 animate-pulse">
                {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-200/60 rounded-xl" />)}
              </div>
            ) : (
              <>
                {/* Tipo */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Tipo de Pedido</label>
                  <div className="flex gap-2">
                    {(['ready', 'custom'] as const).map((t) => (
                      <button key={t} onClick={() => setOrderType(t)} className={`flex-1 py-2.5 px-4 rounded-xl border transition-all ${orderType === t ? 'bg-pink-600 text-white border-pink-600 shadow' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                        {t === 'ready' ? 'Pronta Entrega' : 'Encomenda'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dados do Cliente */}
                {orderType === 'custom' && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-2xl border border-blue-200 ring-1 ring-blue-100">
                    <h3 className="font-semibold flex items-center gap-2 text-blue-900">
                      <User className="w-4 h-4" /> Dados do Cliente
                    </h3>
                    <div>
                      <label htmlFor="clientSelect" className="block text-sm font-medium mb-1">Cliente Cadastrado</label>
                      <select id="clientSelect" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white">
                        <option value="">Novo cliente ou selecione...</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="clientName" className="block text-sm font-medium mb-1">Nome do Cliente</label>
                      <input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Digite o nome" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                    </div>
                    <div>
                      <label htmlFor="clientPhone" className="block text-sm font-medium mb-1">Telefone</label>
                      <input id="clientPhone" value={clientPhone} onChange={(e) => setClientPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                    </div>
                    <div>
                      <label htmlFor="deliveryDate" className="block text-sm font-medium mb-1">Data de Entrega</label>
                      <input id="deliveryDate" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                    </div>
                    {!selectedClientId && clientName.trim() && clientPhone.trim() && (
                      <button onClick={handleAddClient} disabled={saving} className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm">
                        <Plus className="w-4 h-4" /> Salvar Cliente para Próximos Pedidos
                      </button>
                    )}
                  </div>
                )}

                {/* Bolo */}
                <div>
                  <label htmlFor="size" className="block text-sm font-medium mb-1">Tamanho (kg)</label>
                  <input id="size" type="text" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Ex: 1,5" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <div>
                  <label htmlFor="flavor" className="block text-sm font-medium mb-1">Sabor do Bolo</label>
                  <select id="flavor" value={flavor} onChange={(e) => setFlavor(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white">
                    <option value="">Selecione o sabor</option>
                    {flavors.map((f) => <option key={f.name} value={f.name}>{f.name} - {formatBRL(f.pricePerKg)}/kg</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="doughColor" className="block text-sm font-medium mb-1">Cor da Massa</label>
                  <select id="doughColor" value={doughColor} onChange={(e) => setDoughColor(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white">
                    <option value="">Selecione a cor</option>
                    {doughColors.map((color) => <option key={color} value={color}>{color}</option>)}
                  </select>
                </div>

                {/* Decorado */}
                <div className="flex items-center gap-2">
                  <input id="decorated" type="checkbox" checked={decorated} onChange={(e) => setDecorated(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                  <label htmlFor="decorated" className="text-sm text-gray-800">
                    Bolo decorado <span className="text-gray-500">(+ {formatBRL(decoratedSurcharge)})</span>
                  </label>
                </div>

                {/* Adicionais */}
                {extras.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-pink-500" /> Adicionais
                    </label>
                    <div className="space-y-1.5 p-3 bg-pink-50/60 rounded-xl border border-pink-100">
                      {extras.map((e) => (
                        <div key={e.id} className="flex items-center gap-2">
                          <input id={`extra-${e.id}`} type="checkbox" checked={selectedExtraIds.includes(e.id)} onChange={() => toggleExtra(e.id)} className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                          <label htmlFor={`extra-${e.id}`} className="text-sm text-gray-800 flex-1">{e.name}</label>
                          <span className="text-sm text-gray-500">+ {formatBRL(e.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium mb-1">Observações</label>
                  <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex: sem lactose, com morangos... (opcional)" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>

                {/* Resumo de preço */}
                {basePrice > 0 && (
                  <div className="p-3 bg-green-50 rounded-2xl border border-green-200 ring-1 ring-green-100 space-y-1">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-800">Total: {formatBRL(price)}</span>
                    </div>
                    <div className="text-xs text-green-700/80 pl-7 space-y-0.5">
                      <div>Bolo ({kg} kg × {formatBRL(selectedFlavor?.pricePerKg ?? 0)}/kg): {formatBRL(basePrice)}</div>
                      {decorated && <div>Decorado: + {formatBRL(decoratedSurcharge)}</div>}
                      {selectedExtras.map((e) => <div key={e.id}>{e.name}: + {formatBRL(e.price)}</div>)}
                    </div>
                  </div>
                )}

                <button onClick={handleGenerateNote} disabled={!isFormValid || saving} className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow">
                  Gerar Nota
                </button>
              </>
            )}
          </div>
        </div>

        {/* Configurações de Preços */}
        <button onClick={() => setShowSettings(!showSettings)} className="w-full bg-white/80 backdrop-blur border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm">
          <Settings className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Configurações de Preços</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100 overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50">
              <h3 className="text-lg font-semibold text-pink-900">Configurações de Preços</h3>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium mb-1 text-gray-700">Valor adicional — Bolo Decorado (R$)</label>
              <div className="flex gap-2">
                <input type="text" inputMode="decimal" value={editDecoratedPrice} onChange={(e) => setEditDecoratedPrice(e.target.value)} placeholder="Ex: 60,00" className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                <button onClick={handleSaveDecoratedPrice} disabled={saving || !Number.isFinite(toNumber(editDecoratedPrice))} className="px-4 py-2.5 bg-pink-600 text-white rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                  Salvar
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Valor atual: <strong>{formatBRL(decoratedSurcharge)}</strong></p>
            </div>
          </div>
        )}

        {/* Gerenciar Adicionais */}
        <button onClick={() => setShowManageExtras(!showManageExtras)} className="w-full bg-white/80 backdrop-blur border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm">
          <Sparkles className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Gerenciar Adicionais</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showManageExtras ? 'rotate-180' : ''}`} />
        </button>

        {showManageExtras && (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                <h3 className="text-lg font-semibold text-pink-900">Adicionar Novo</h3>
                <p className="text-xs text-gray-500 mt-0.5">Ex: Recheio especial, Andar extra, Fio de ovos…</p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome do Adicional</label>
                  <input value={newExtraName} onChange={(e) => setNewExtraName(e.target.value)} placeholder="Ex: Recheio especial" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                  <input type="text" inputMode="decimal" value={newExtraPrice} onChange={(e) => setNewExtraPrice(e.target.value)} placeholder="Ex: 25,00" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <button onClick={handleAddExtra} disabled={saving || !newExtraName.trim() || !Number.isFinite(toNumber(newExtraPrice)) || toNumber(newExtraPrice) < 0} className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow">
                  <Plus className="w-4 h-4" /> Salvar Adicional
                </button>
              </div>
            </div>

            {extras.length > 0 && (
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100">
                <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                  <h3 className="text-lg font-semibold text-pink-900">Adicionais Cadastrados</h3>
                </div>
                <div className="p-4 space-y-2">
                  {extras.map((e) => (
                    <div key={e.id} className="flex items-center justify-between p-2.5 border rounded-xl hover:bg-gray-50">
                      <div>
                        <div className="font-medium text-sm">{e.name}</div>
                        <div className="text-xs text-gray-500">+ {formatBRL(e.price)}</div>
                      </div>
                      <button onClick={() => handleRemoveExtra(e.id)} disabled={saving} className="bg-rose-600 text-white p-2 rounded-xl hover:bg-rose-700 disabled:bg-gray-300 transition-colors" aria-label={`Remover adicional ${e.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gerenciar Clientes */}
        <button onClick={() => setShowManageClients(!showManageClients)} className="w-full bg-white/80 backdrop-blur border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm">
          <User className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Gerenciar Clientes</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showManageClients ? 'rotate-180' : ''}`} />
        </button>

        {showManageClients && (
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100">
            <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-pink-900">Clientes Cadastrados</h3>
            </div>
            <div className="p-4 space-y-2">
              {clients.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhum cliente cadastrado</p>
              ) : (
                clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-sm text-gray-600">{c.phone}</div>
                    </div>
                    <button onClick={() => handleRemoveClient(c.id)} disabled={saving} className="bg-rose-600 text-white p-2 rounded-xl hover:bg-rose-700 disabled:bg-gray-300 transition-colors" aria-label={`Remover cliente ${c.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Gerenciar Sabores */}
        <button onClick={() => setShowManageFlavors(!showManageFlavors)} className="w-full bg-white/80 backdrop-blur border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm">
          <Settings className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Gerenciar Sabores</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showManageFlavors ? 'rotate-180' : ''}`} />
        </button>

        {showManageFlavors && (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                <h3 className="text-lg font-semibold text-pink-900">Adicionar/Atualizar Sabor</h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label htmlFor="newFlavorName" className="block text-sm font-medium mb-1">Nome do Sabor</label>
                  <input id="newFlavorName" value={newFlavorName} onChange={(e) => setNewFlavorName(e.target.value)} placeholder="Ex: Brigadeiro" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <div>
                  <label htmlFor="newFlavorPrice" className="block text-sm font-medium mb-1">Preço por kg (R$)</label>
                  <input id="newFlavorPrice" type="text" inputMode="decimal" value={newFlavorPrice} onChange={(e) => setNewFlavorPrice(e.target.value)} placeholder="Ex: 60,00" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500" />
                </div>
                <button onClick={handleAddFlavor} disabled={saving || !newFlavorName.trim() || !Number.isFinite(toNumber(newFlavorPrice)) || toNumber(newFlavorPrice) <= 0} className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow">
                  <Plus className="w-4 h-4" /> Salvar Sabor
                </button>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                <h3 className="text-lg font-semibold text-pink-900">Sabores Existentes</h3>
              </div>
              <div className="p-4 space-y-2">
                {flavors.map((f) => (
                  <div key={f.name} className="flex items-center justify-between p-2.5 border rounded-xl hover:bg-gray-50">
                    <span>{f.name} - {formatBRL(f.pricePerKg)}/kg</span>
                    <button onClick={() => handleRemoveFlavor(f.name)} disabled={saving || flavors.length <= 1} className="bg-rose-600 text-white p-2 rounded-xl hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors" aria-label={`Remover sabor ${f.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== NOTA DE PEDIDO ===== */}
      {showNote && currentOrder && (
        <div className="max-w-sm mx-auto mt-6 print-content">
          <div className="print-nota bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 overflow-hidden">
            <div className="p-5 border-b-2 border-dashed border-gray-300 text-center bg-pink-50">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">🎂 Nota de Pedido</div>
              <h2 className="text-2xl font-bold text-pink-900">
                {currentOrder.type === 'ready' ? 'Pronta Entrega' : currentOrder.clientName || 'Encomenda'}
              </h2>
              {currentOrder.type === 'custom' && currentOrder.clientPhone && (
                <div className="text-sm text-gray-600 mt-1">{currentOrder.clientPhone}</div>
              )}
            </div>

            <div className="p-5 space-y-3">
              {currentOrder.type === 'custom' && currentOrder.deliveryDate && (
                <div className="flex items-center gap-2 p-2.5 bg-indigo-50 rounded-xl border border-indigo-200">
                  <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-gray-500">Entrega</div>
                    <div className="font-semibold text-indigo-900">
                      {new Date(currentOrder.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Sabor', value: currentOrder.flavorName },
                  { label: 'Tamanho', value: `${currentOrder.sizeKg} kg` },
                  { label: 'Cor da massa', value: currentOrder.doughColor },
                  { label: 'Valor', value: formatBRL(currentOrder.price) },
                ].map((item) => (
                  <div key={item.label} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-400">{item.label}</div>
                    <div className="font-semibold text-gray-900 mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>

              {currentOrder.decorated && (
                <div className="p-2.5 bg-pink-50 rounded-xl border border-pink-200 text-sm text-pink-800">
                  🎨 <strong>Decorado</strong> (+ {formatBRL(currentOrder.decoratedSurcharge ?? decoratedSurcharge)})
                </div>
              )}

              {currentOrder.extras && currentOrder.extras.length > 0 && (
                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="text-xs text-purple-600 font-medium mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Adicionais
                  </div>
                  <div className="space-y-1">
                    {currentOrder.extras.map((e) => (
                      <div key={e.id} className="flex justify-between text-sm text-gray-800">
                        <span>{e.name}</span>
                        <span>+ {formatBRL(e.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentOrder.notes?.trim() && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="text-xs text-amber-600 font-medium mb-0.5">📝 Observações</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{currentOrder.notes}</div>
                </div>
              )}

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-xs text-gray-500">Total a pagar</div>
                  <div className="text-xl font-bold text-emerald-800">{formatBRL(currentOrder.price)}</div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4 pt-1 border-t border-dashed border-gray-200 text-center">
              <div className="text-xs text-gray-400">{today} · #{currentOrder.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          <div className="no-print mt-4 space-y-2">
            <button onClick={() => window.print()} className="w-full bg-white border border-gray-300 py-2.5 px-4 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
              <Printer className="w-4 h-4" /> Imprimir Nota
            </button>
            {currentOrder.type === 'custom' && currentOrder.clientPhone && (
              <a href={buildWhatsAppLink(currentOrder)} target="_blank" rel="noopener noreferrer" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow font-medium">
                <MessageCircle className="w-4 h-4" /> Confirmar pelo WhatsApp
              </a>
            )}
            <button onClick={handleNewOrder} className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 flex items-center justify-center gap-2 transition-colors shadow">
              <Plus className="w-4 h-4" /> Novo Pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}