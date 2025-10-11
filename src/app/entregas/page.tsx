'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Printer, Trash2, CheckCircle } from 'lucide-react';

/* ========= Tipos ========= */
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
}

/* ========= Ambiente ========= */
const isBrowser = typeof window !== 'undefined';
const hasIndexedDB = isBrowser && typeof window.indexedDB !== 'undefined';
const DB_VERSION = 3;

/* ========= IndexedDB + fallback ========= */
type StoreName = 'orders';
type StoreMap = { orders: Order };

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB) throw new Error('IndexedDB não suportado');
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('cakeDB', DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;

      // Garanta que todos os stores existam nesta versão
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
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
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
      req.onsuccess = () => resolve((req.result ?? []) as StoreMap[K][]);
      req.onerror = () => reject(req.error ?? new Error('Falha ao ler IndexedDB'));
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
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao escrever IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });
}

async function idbDelete<K extends StoreName>(storeName: K, key: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao remover IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });
}

// Fallback localStorage
const lsKeys: Record<StoreName, string> = {
  orders: 'cakeOrders',
};
function readFromLocalStorage<K extends StoreName>(store: K): StoreMap[K][] {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(lsKeys[store]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoreMap[K][]) : [];
  } catch {
    return [];
  }
}
async function storageGetAll<K extends StoreName>(store: K) {
  if (hasIndexedDB) return idbGetAll(store);
  return readFromLocalStorage(store);
}
async function storagePut<K extends StoreName>(store: K, value: StoreMap[K]) {
  if (hasIndexedDB) return idbPut(store, value);
  if (!isBrowser) return;

  type ItemWithId = StoreMap[K] & { id: string };

  const current = readFromLocalStorage(store) as ItemWithId[];
  const idx = current.findIndex((x) => x.id === (value as ItemWithId).id);
  if (idx >= 0) current[idx] = value as ItemWithId;
  else current.push(value as ItemWithId);
  window.localStorage.setItem(lsKeys[store], JSON.stringify(current));
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('cake_sync');
      bc.postMessage({ type: 'orders_changed', id: (value as ItemWithId).id });
      bc.close();
    }
  } catch {
    // ignore
  }
}
async function storageDelete<K extends StoreName>(store: K, key: string) {
  if (hasIndexedDB) return idbDelete(store, key);
  if (!isBrowser) return;

  type ItemWithId = StoreMap[K] & { id: string };

  const current = readFromLocalStorage(store) as ItemWithId[];
  const next = current.filter((x) => x.id !== key);
  window.localStorage.setItem(lsKeys[store], JSON.stringify(next));
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('cake_sync');
      bc.postMessage({ type: 'orders_changed', id: key });
      bc.close();
    }
  } catch {
    // ignore
  }
}

/* ========= Helpers ========= */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function ptMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}
function classNames(...xs: Array<string | boolean | undefined>) {
  return xs.filter(Boolean).join(' ');
}
const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'canceled', label: 'Cancelado' },
];
function statusBadgeColor(s: OrderStatus) {
  switch (s) {
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'canceled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
  }
}

/* ========= Página ========= */
export default function DeliveriesDashboard() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(ymd(today));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isBrowser) return;
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const all = await storageGetAll('orders');
        if (!ignore) setOrders(all);
      } catch (e) {
        console.error(e);
        if (!ignore) setMessage({ type: 'error', text: 'Falha ao carregar pedidos.' });
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();

    // Escuta alterações (entre abas ou página de pedidos)
    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('cake_sync');
        bc.onmessage = (ev) => {
          if ((ev as MessageEvent)?.data?.type === 'orders_changed') {
            load();
          }
        };
      }
    } catch {
      // ignore
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        bc?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(t);
  }, [message]);

  // Mapa por data
  const ordersByDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      if (!o.deliveryDate) continue;
      const k = o.deliveryDate;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    }
    return map;
  }, [orders]);

  // Dias do mês corrente (grid de 6x7)
  const firstDay = useMemo(() => new Date(year, month, 1), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const leading = useMemo(() => (firstDay.getDay() + 7) % 7, [firstDay]); // 0=Dom
  const totalCells = 42;
  const cells = useMemo(() => {
    const arr: {
      key: string;
      dayNumber: number | null;
      dateStr: string | null;
      inMonth: boolean;
    }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - leading + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const date = inMonth ? new Date(year, month, dayNum) : null;
      arr.push({
        key: `${year}-${month}-${i}`,
        dayNumber: inMonth ? dayNum : null,
        dateStr: date ? ymd(date) : null,
        inMonth,
      });
    }
    return arr;
  }, [year, month, leading, daysInMonth]);

  const selectedOrders = useMemo(() => {
    return orders.filter((o) => o.deliveryDate === selectedDate);
  }, [orders, selectedDate]);

  const totalDoDia = useMemo(
    () => selectedOrders.reduce((sum, o) => sum + (Number.isFinite(o.price) ? o.price : 0), 0),
    [selectedOrders]
  );

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }
  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDate(ymd(t));
  }

  async function updateStatus(id: string, status: OrderStatus) {
    try {
      setSaving(true);
      const o = orders.find((x) => x.id === id);
      if (!o) return;
      const updated = { ...o, status };
      await storagePut('orders', updated);
      setOrders((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setMessage({ type: 'success', text: 'Status atualizado.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Falha ao atualizar status.' });
    } finally {
      setSaving(false);
    }
  }

  async function updateDate(id: string, newDate: string) {
    try {
      setSaving(true);
      const o = orders.find((x) => x.id === id);
      if (!o) return;
      const updated = { ...o, deliveryDate: newDate || undefined };
      await storagePut('orders', updated);
      setOrders((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setMessage({ type: 'success', text: 'Data atualizada.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Falha ao atualizar data.' });
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(id: string) {
    if (!confirm('Remover este pedido?')) return;
    try {
      setSaving(true);
      await idbDelete('orders', id);
      setOrders((prev) => prev.filter((x) => x.id !== id));
      setMessage({ type: 'success', text: 'Pedido removido.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Falha ao remover.' });
    } finally {
      setSaving(false);
    }
  }

  function printDay() {
    if (!isBrowser) return;
    window.print();
  }

  const weekLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    return dateStr === ymd(new Date());
  };
  const isSelected = (dateStr: string | null) => {
    if (!dateStr) return false;
    return dateStr === selectedDate;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-indigo-50 to-fuchsia-50 p-4 sm:p-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 16px;
            }
            .no-print { display: none !important; }
          }
        `,
        }}
      />
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

      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-indigo-900">Dashboard de Entregas</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="no-print inline-flex items-center px-3 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-sm"
            >
              Voltar aos Pedidos
            </Link>
            <button
              onClick={printDay}
              className="no-print inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir Lista
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Calendário mensal */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-indigo-100 overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-sky-50 flex items-center justify-between">
              <button
                className="p-2 rounded-lg hover:bg-white border border-indigo-100"
                onClick={prevMonth}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-5 h-5 text-indigo-700" />
              </button>
              <div className="text-indigo-900 font-semibold">
                {ptMonthYear(year, month)}
              </div>
              <button
                className="p-2 rounded-lg hover:bg-white border border-indigo-100"
                onClick={nextMonth}
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-5 h-5 text-indigo-700" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-600 mb-2">
                {weekLabels.map((w, i) => (
                  <div key={i} className="py-1">{w}</div>
                ))}
              </div>

              {loading ? (
                <div className="animate-pulse h-80 bg-gray-100/60 rounded-xl" />
              ) : (
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {cells.map((c) => {
                    const count = c.dateStr ? (ordersByDate.get(c.dateStr)?.length || 0) : 0;
                    const has = count > 0;
                    return (
                      <button
                        key={c.key}
                        disabled={!c.inMonth}
                        onClick={() => c.dateStr && setSelectedDate(c.dateStr)}
                        className={classNames(
                          'aspect-[1/1] rounded-xl border text-sm flex flex-col items-center justify-center select-none',
                          c.inMonth ? 'bg-white hover:bg-indigo-50 border-indigo-100' : 'bg-gray-50 text-gray-400 border-gray-200',
                          isToday(c.dateStr) && c.inMonth && 'ring-2 ring-indigo-300',
                          isSelected(c.dateStr) && c.inMonth && 'bg-indigo-100 border-indigo-300'
                        )}
                      >
                        <div className={classNames('font-semibold', c.inMonth ? 'text-gray-800' : 'text-gray-400')}>
                          {c.dayNumber ?? ''}
                        </div>
                        {has && (
                          <div className="mt-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-600 text-white">
                            {count} entrega{count > 1 ? 's' : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={goToday}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-sm"
                >
                  Hoje
                </button>
                <div className="text-xs text-gray-600">
                  Clique em um dia para ver as entregas
                </div>
              </div>
            </div>
          </div>

          {/* Lista do dia */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-indigo-100 overflow-hidden print-area">
            <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-sky-50 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Entregas do dia</div>
                <div className="text-xl font-semibold text-indigo-900">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div className="text-sm text-indigo-900">
                Total do dia: <span className="font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                    .format(totalDoDia)}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-gray-100/70 rounded-xl animate-pulse" />
                  <div className="h-10 bg-gray-100/70 rounded-xl animate-pulse" />
                  <div className="h-10 bg-gray-100/70 rounded-xl animate-pulse" />
                </div>
              ) : selectedOrders.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Nenhuma entrega agendada para esta data.
                </div>
              ) : (
                selectedOrders.map((o) => (
                  <div
                    key={o.id}
                    className="border border-indigo-100 rounded-xl p-3 bg-white flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className={classNames(
                          'w-4 h-4',
                          o.status === 'delivered' ? 'text-emerald-600' : 'text-indigo-400'
                        )} />
                        <div className="text-sm font-semibold text-indigo-900">
                          {o.type === 'custom' ? (o.clientName || 'Cliente') : 'Pronta Entrega'}
                        </div>
                      </div>
                      <div
                        className={classNames(
                          'text-[11px] px-2 py-0.5 rounded-full border',
                          statusBadgeColor(o.status)
                        )}
                      >
                        {statusOptions.find(s => s.value === o.status)?.label || o.status}
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                      <div><strong>Sabor:</strong> {o.flavorName}</div>
                      <div><strong>Tam.:</strong> {o.sizeKg} kg</div>
                      <div><strong>Cor:</strong> {o.doughColor}</div>
                      <div><strong>Preço:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.price)}</div>
                    </div>

                    {(o.clientPhone || o.clientName) && (
                      <div className="text-sm text-gray-600">
                        {o.clientName ? <span><strong>Cliente:</strong> {o.clientName} </span> : null}
                        {o.clientPhone ? (
                          <a className="underline hover:text-indigo-700" href={`tel:${o.clientPhone.replace(/\D/g, '')}`}>
                            {o.clientPhone}
                          </a>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">Status:</label>
                        <select
                          value={o.status}
                          onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                          disabled={saving}
                          className="text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white"
                        >
                          {statusOptions.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">Data:</label>
                        <input
                          type="date"
                          value={o.deliveryDate || ''}
                          onChange={(e) => updateDate(o.id, e.target.value)}
                          disabled={saving}
                          className="text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white"
                        />
                      </div>

                      <div className="flex-1" />

                      <button
                        onClick={() => removeOrder(o.id)}
                        disabled={saving}
                        className="no-print inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-sm"
                      >
                        <Trash2 className="w-4 h-4" /> Remover
                      </button>
                    </div>

                    <div className="text-xs text-gray-500">
                      Criado em {new Date(o.createdAt).toLocaleString('pt-BR')}
                      {o.type === 'ready' ? ' • Pronta Entrega' : ' • Encomenda'}
                      {o.id ? ` • #${o.id}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}