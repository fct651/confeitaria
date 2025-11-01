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
} from 'lucide-react';
import Link from 'next/link';

interface Flavor {
  name: string;
  pricePerKg: number;
}

interface Client {
  id: string;
  name: string;
  phone: string;
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
  deliveryDate?: string; // YYYY-MM-DD
  status: OrderStatus;
  createdAt: string; // ISO
  notes?: string; // Observações
  // Campos adicionados para bolo decorado
  decorated?: boolean;
  decoratedSurcharge?: number; // valor adicional aplicado no momento da venda
}

type StoreName = 'flavors' | 'clients' | 'orders';

type StoreMap = {
  flavors: Flavor;
  clients: Client;
  orders: Order;
};

// Ajuste este valor futuramente, se necessário
const DECORATED_SURCHARGE = 60; // R$ 60,00 de adicional para bolo decorado

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
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

/* =========================
   Ambiente/feature detection seguro para SSR
   ========================= */
const isBrowser = typeof window !== 'undefined';
const hasIndexedDB = isBrowser && typeof window.indexedDB !== 'undefined';
const DB_VERSION = 3;

/* =========================
   IndexedDB Helper (com fallback)
   ========================= */
let dbPromise: Promise<IDBDatabase> | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB) {
    throw new Error('IndexedDB não suportado neste ambiente.');
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('cakeDB', DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('flavors')) {
        db.createObjectStore('flavors', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('orders')) {
        const os = db.createObjectStore('orders', { keyPath: 'id' });
        try {
          os.createIndex('deliveryDate', 'deliveryDate', { unique: false });
          os.createIndex('status', 'status', { unique: false });
        } catch {
          // ignore
        }
      }
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
  return new Promise<StoreMap[K][]>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = (req.result ?? []) as StoreMap[K][];
        resolve(result);
      };
      req.onerror = () => reject(req.error ?? new Error('Falha ao ler IndexedDB.'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Falha no acesso ao ObjectStore.'));
    }
  });
}

async function idbPut<K extends StoreName>(storeName: K, value: StoreMap[K]): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao escrever no IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada no IndexedDB.'));
  });
}

async function idbBulkPut<K extends StoreName>(
  storeName: K,
  values: StoreMap[K][]
): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha no bulkPut do IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada no bulkPut.'));
  });
}

async function idbDelete<K extends StoreName>(storeName: K, key: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao remover do IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada no delete.'));
  });
}

// Fallback simples para localStorage se IndexedDB não existir
const lsKeys: Record<StoreName, string> = {
  flavors: 'cakeFlavors',
  clients: 'cakeClients',
  orders: 'cakeOrders',
};

function getKeyValue<K extends StoreName>(store: K, item: StoreMap[K]): string {
  if (store === 'flavors') return (item as Flavor).name;
  if (store === 'clients') return (item as Client).id;
  return (item as Order).id;
}

function readFromLocalStorage<K extends StoreName>(store: K): StoreMap[K][] {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(lsKeys[store]);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as StoreMap[K][];
    }
    return [];
  } catch {
    return [];
  }
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
    if (idx >= 0) current[idx] = value;
    else current.push(value);
    window.localStorage.setItem(lsKeys[store], JSON.stringify(current));
  },
  async delete(store, key) {
    if (hasIndexedDB) return idbDelete(store, key);
    if (!isBrowser) return;
    const current = readFromLocalStorage(store);
    const next = current.filter((x) => getKeyValue(store, x) !== key);
    window.localStorage.setItem(lsKeys[store], JSON.stringify(next));
  },
};

/* =========================
   Utils visuais
   ========================= */
function formatPhone(input: string) {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Home() {
  // Estados do pedido
  const [orderType, setOrderType] = useState<'ready' | 'custom'>('ready');
  const [size, setSize] = useState('');
  const [flavor, setFlavor] = useState('');
  const [doughColor, setDoughColor] = useState('');
  const [decorated, setDecorated] = useState(false); // Bolo decorado
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [showNote, setShowNote] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [notes, setNotes] = useState(''); // Observações

  // Estados do cliente
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  // Estados de gerenciamento
  const [showManageFlavors, setShowManageFlavors] = useState(false);
  const [showManageClients, setShowManageClients] = useState(false);
  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorPrice, setNewFlavorPrice] = useState('');
  const [today, setToday] = useState('');

  // Carregamento e feedback
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-dismiss do toast
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
        // Carrega sabores
        let storedFlavors = await storage.getAll('flavors');

        // Migra do localStorage para IDB, se necessário
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
            } catch {
              // ignore
            }
          }
        }
        if (storedFlavors.length === 0) {
          await storage.bulkPut('flavors', defaultFlavors);
          storedFlavors = defaultFlavors;
        }
        if (!ignore) setFlavors(storedFlavors);

        // Carrega clientes
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
            } catch {
              // ignore
            }
          }
        }
        if (!ignore) setClients(storedClients);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Falha ao inicializar dados', err);
        if (!ignore) setMessage({ type: 'error', text: 'Falha ao carregar dados locais.' });
      } finally {
        if (!ignore) setInitializing(false);
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Quando seleciona um cliente, preenche os dados
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find((c) => c.id === selectedClientId);
      if (client) {
        setClientName(client.name);
        setClientPhone(client.phone);
      }
    }
  }, [selectedClientId, clients]);

  const selectedFlavor = useMemo(
    () => flavors.find((f) => f.name === flavor),
    [flavors, flavor]
  );

  const kg = useMemo(() => toNumber(size), [size]);

  const basePrice = useMemo(() => {
    if (!selectedFlavor || !Number.isFinite(kg) || kg <= 0) return 0;
    return kg * selectedFlavor.pricePerKg;
  }, [kg, selectedFlavor]);

  const decoratedExtra = useMemo(
    () => (decorated ? DECORATED_SURCHARGE : 0),
    [decorated]
  );

  const price = useMemo(() => basePrice + decoratedExtra, [basePrice, decoratedExtra]);

  const isFormValid = useMemo(() => {
    const basicValid = Boolean(selectedFlavor && Number.isFinite(kg) && kg > 0 && doughColor);
    if (orderType === 'ready') return basicValid;
    return basicValid && clientName.trim() && clientPhone.trim() && deliveryDate;
  }, [orderType, selectedFlavor, kg, doughColor, clientName, clientPhone, deliveryDate]);

  async function saveOrder(): Promise<Order> {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const notesValue = notes?.trim() || undefined;
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
      notes: notesValue,
      decorated: decorated || undefined,
      decoratedSurcharge: decorated ? DECORATED_SURCHARGE : undefined,
    };
    await storage.put('orders', order);
    try {
      if (isBrowser && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('cake_sync');
        bc.postMessage({ type: 'orders_changed', id: order.id });
        bc.close();
      }
    } catch {
      // ignore
    }
    return order;
  }

  const handleGenerateNote = async () => {
    if (!isFormValid) return;
    try {
      setSaving(true);
      const order = await saveOrder();
      setCurrentOrderId(order.id);
      setShowNote(true);
      setMessage({ type: 'success', text: 'Pedido salvo e nota gerada.' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setMessage({ type: 'error', text: 'Não foi possível salvar o pedido.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!isBrowser) return;
    window.print();
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
        if (exists) {
          return prev.map((f) =>
            f.name.toLowerCase() === name.toLowerCase()
              ? { ...f, pricePerKg: parsedPrice }
              : f
          );
        }
        return [...prev, { name, pricePerKg: parsedPrice }];
      });

      setNewFlavorName('');
      setNewFlavorPrice('');
      setMessage({ type: 'success', text: 'Sabor salvo com sucesso.' });
    } catch (err) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error(err);
      setMessage({ type: 'error', text: 'Não foi possível remover o cliente.' });
    } finally {
      setSaving(false);
    }
  };

  const handleNewOrder = () => {
    setShowNote(false);
    setCurrentOrderId(null);
    setSize('');
    setFlavor('');
    setDoughColor('');
    setDecorated(false);
    setOrderType('ready');
    setSelectedClientId('');
    setClientName('');
    setClientPhone('');
    setDeliveryDate('');
    setNotes('');
    setMessage({ type: 'success', text: 'Pronto para um novo pedido.' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50 p-4 sm:p-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
        }
      `,
        }}
      />

      {/* Toast simples */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-sm ${
            message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="max-w-md mx-auto space-y-6 no-print">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 ring-1 ring-pink-100 shadow-sm backdrop-blur">
            <Cake className="w-4 h-4 text-pink-600" />
            <span className="text-xs font-medium text-pink-700">
              Sistema de Encomendas de Bolo
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-fuchsia-600 flex items-center justify-center gap-2">
            Pronta Entrega
          </h1>
          <p className="text-gray-600 mt-2">
            Crie e imprima notas rapidamente
          </p>
          <div className="mt-3">
            <Link
              href="/entregas"
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-white border border-pink-200 shadow-sm hover:bg-pink-50 transition"
            >
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
            {/* Loading skeleton */}
            {initializing ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-gray-200/60 rounded-xl" />
                <div className="h-10 bg-gray-200/60 rounded-xl" />
                <div className="h-10 bg-gray-200/60 rounded-xl" />
                <div className="h-10 bg-gray-200/60 rounded-xl" />
              </div>
            ) : (
              <>
                {/* Tipo de Pedido */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Tipo de Pedido
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOrderType('ready')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border transition-all ${
                        orderType === 'ready'
                          ? 'bg-pink-600 text-white border-pink-600 shadow'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Pronta Entrega
                    </button>
                    <button
                      onClick={() => setOrderType('custom')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border transition-all ${
                        orderType === 'custom'
                          ? 'bg-pink-600 text-white border-pink-600 shadow'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Encomenda
                    </button>
                  </div>
                </div>

                {/* Informações do Cliente (apenas para encomenda) */}
                {orderType === 'custom' && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-2xl border border-blue-200 ring-1 ring-blue-100">
                    <h3 className="font-semibold flex items-center gap-2 text-blue-900">
                      <User className="w-4 h-4" />
                      Dados do Cliente
                    </h3>

                    <div>
                      <label htmlFor="clientSelect" className="block text-sm font-medium mb-1">
                        Cliente Cadastrado
                      </label>
                      <select
                        id="clientSelect"
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                      >
                        <option value="">Novo cliente ou selecione...</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} - {c.phone}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="clientName" className="block text-sm font-medium mb-1">
                        Nome do Cliente
                      </label>
                      <input
                        id="clientName"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Digite o nome"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="clientPhone" className="block text-sm font-medium mb-1">
                        Telefone
                      </label>
                      <input
                        id="clientPhone"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="deliveryDate" className="block text-sm font-medium mb-1">
                        Data de Entrega
                      </label>
                      <input
                        id="deliveryDate"
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>

                    {!selectedClientId && clientName.trim() && clientPhone.trim() && (
                      <button
                        onClick={handleAddClient}
                        disabled={saving}
                        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Salvar Cliente para Próximos Pedidos
                      </button>
                    )}
                  </div>
                )}

                {/* Dados do Bolo */}
                <div>
                  <label htmlFor="size" className="block text-sm font-medium mb-1">
                    Tamanho (kg)
                  </label>
                  <input
                    id="size"
                    type="text"
                    inputMode="decimal"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="Ex: 1,5"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label htmlFor="flavor" className="block text-sm font-medium mb-1">
                    Sabor do Bolo
                  </label>
                  <select
                    id="flavor"
                    value={flavor}
                    onChange={(e) => setFlavor(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                  >
                    <option value="">Selecione o sabor</option>
                    {flavors.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name} - {formatBRL(f.pricePerKg)}/kg
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doughColor" className="block text-sm font-medium mb-1">
                    Cor da Massa
                  </label>
                  <select
                    id="doughColor"
                    value={doughColor}
                    onChange={(e) => setDoughColor(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                  >
                    <option value="">Selecione a cor</option>
                    {doughColors.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bolo decorado */}
                <div className="flex items-center gap-2">
                  <input
                    id="decorated"
                    type="checkbox"
                    checked={decorated}
                    onChange={(e) => setDecorated(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                  />
                  <label htmlFor="decorated" className="text-sm text-gray-800">
                    Bolo decorado
                    <span className="text-gray-500"> (+ {formatBRL(DECORATED_SURCHARGE)})</span>
                  </label>
                </div>

                {/* Observações */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium mb-1">
                    Observações
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Ex: sem lactose, com morangos, entregar na portaria... (opcional)"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                {basePrice > 0 && (
                  <div className="p-3 bg-green-50 rounded-2xl border border-green-200 ring-1 ring-green-100">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-800">
                        Preço Total: {formatBRL(price)}
                      </span>
                    </div>
                    {decorated && (
                      <div className="mt-1 text-xs text-green-800/80">
                        Inclui decoração: {formatBRL(decoratedExtra)}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleGenerateNote}
                  disabled={!isFormValid || saving}
                  className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow"
                >
                  Gerar Nota
                </button>
              </>
            )}
          </div>
        </div>

        {/* Gerenciar Clientes */}
        <button
          onClick={() => setShowManageClients(!showManageClients)}
          className="w-full bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <User className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Gerenciar Clientes</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showManageClients ? 'rotate-180' : ''}`}
          />
        </button>

        {showManageClients && (
          <div className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-2xl shadow-lg ring-1 ring-pink-100">
            <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-pink-900">Clientes Cadastrados</h3>
            </div>
            <div className="p-4 space-y-2">
              {clients.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhum cliente cadastrado</p>
              ) : (
                clients.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-sm text-gray-600">{c.phone}</div>
                    </div>
                    <button
                      onClick={() => handleRemoveClient(c.id)}
                      disabled={saving}
                      className="bg-rose-600 text-white p-2 rounded-xl hover:bg-rose-700 disabled:bg-gray-300 transition-colors"
                      aria-label={`Remover cliente ${c.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Gerenciar Sabores */}
        <button
          onClick={() => setShowManageFlavors(!showManageFlavors)}
          className="w-full bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border border-gray-200 py-2.5 px-4 rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Settings className="w-4 h-4 text-pink-600" />
          <span className="font-medium">Gerenciar Sabores</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showManageFlavors ? 'rotate-180' : ''}`}
          />
        </button>

        {showManageFlavors && (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-2xl shadow-lg ring-1 ring-pink-100">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                <h3 className="text-lg font-semibold text-pink-900">Adicionar/Atualizar Sabor</h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label htmlFor="newFlavorName" className="block text-sm font-medium mb-1">
                    Nome do Sabor
                  </label>
                  <input
                    id="newFlavorName"
                    value={newFlavorName}
                    onChange={(e) => setNewFlavorName(e.target.value)}
                    placeholder="Ex: Brigadeiro"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <div>
                  <label htmlFor="newFlavorPrice" className="block text-sm font-medium mb-1">
                    Preço por kg (R$)
                  </label>
                  <input
                    id="newFlavorPrice"
                    type="text"
                    inputMode="decimal"
                    value={newFlavorPrice}
                    onChange={(e) => setNewFlavorPrice(e.target.value)}
                    placeholder="Ex: 60,00"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <button
                  onClick={handleAddFlavor}
                  disabled={
                    saving ||
                    !newFlavorName.trim() ||
                    !Number.isFinite(toNumber(newFlavorPrice)) ||
                    toNumber(newFlavorPrice) <= 0
                  }
                  className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow"
                >
                  <Plus className="w-4 h-4" />
                  Salvar Sabor
                </button>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-2xl shadow-lg ring-1 ring-pink-100">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-2xl">
                <h3 className="text-lg font-semibold text-pink-900">Sabores Existentes</h3>
              </div>
              <div className="p-4 space-y-2">
                {flavors.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between p-2.5 border rounded-xl hover:bg-gray-50"
                  >
                    <span>
                      {f.name} - {formatBRL(f.pricePerKg)}/kg
                    </span>
                    <button
                      onClick={() => handleRemoveFlavor(f.name)}
                      disabled={saving || flavors.length <= 1}
                      className="bg-rose-600 text-white p-2 rounded-xl hover:bg-rose-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      aria-label={`Remover sabor ${f.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nota de pedido */}
      {showNote && (
        <div className="max-w-md mx-auto mt-6 print-content">
          <div className="bg-white rounded-2xl shadow-lg ring-1 ring-gray-100 overflow-hidden">
            <div className="p-6 border-b text-center bg-gradient-to-r from-pink-50 to-rose-50">
              <h2 className="text-3xl font-bold text-pink-900">
                {orderType === 'ready' ? 'Pronta Entrega' : clientName || 'Encomenda'}
              </h2>
              <p className="text-gray-600 mt-1">Nota de Pedido</p>
            </div>
            <div className="p-6 space-y-4">
              {orderType === 'custom' && (
                <div className="pb-4 border-b space-y-2">
                  <div>
                    <strong>Cliente:</strong> {clientName}
                  </div>
                  <div>
                    <strong>Telefone:</strong> {clientPhone}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <strong>Data de Entrega:</strong>{' '}
                    {deliveryDate
                      ? new Date(deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <strong>Tamanho:</strong> {Number.isFinite(kg) ? kg : size} kg
                </div>
                <div>
                  <strong>Sabor:</strong> {flavor}
                </div>
                <div>
                  <strong>Cor da Massa:</strong> {doughColor}
                </div>
                {decorated ? (
                  <div>
                    <strong>Decorado:</strong> Sim (+ {formatBRL(DECORATED_SURCHARGE)})
                  </div>
                ) : null}
                {notes?.trim() ? (
                  <div className="whitespace-pre-wrap">
                    <strong>Observações:</strong> {notes}
                  </div>
                ) : null}
                <div className="text-lg">
                  <strong>Preço Total:</strong> {formatBRL(price)}
                </div>
              </div>

              <div className="text-center text-sm text-gray-600 pt-4 border-t">
                Data do Pedido: {today || '—'}
                {currentOrderId ? ` • Pedido #${currentOrderId}` : ''}
              </div>
            </div>
            <div className="p-4 no-print space-y-2">
              <button
                onClick={handlePrint}
                className="w-full bg-white border border-gray-300 py-2.5 px-4 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir Nota
              </button>
              <button
                onClick={handleNewOrder}
                className="w-full bg-pink-600 text-white py-2.5 px-4 rounded-xl hover:bg-pink-700 flex items-center justify-center gap-2 transition-colors shadow"
              >
                <Plus className="w-4 h-4" />
                Novo Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}