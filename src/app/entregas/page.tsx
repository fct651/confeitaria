'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import pako from 'pako';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Trash2,
  CheckCircle,
  MessageCircle,
  Cake,
  Clock,
  TrendingUp,
  Circle,
  Smartphone,
  X,
} from 'lucide-react';

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
  deliveryDate?: string;
  status: OrderStatus;
  createdAt: string;
  notes?: string;
  decorated?: boolean;
  decoratedSurcharge?: number;
}

/* ========= Ambiente ========= */
const isBrowser = typeof window !== 'undefined';
const hasIndexedDB = isBrowser && typeof window.indexedDB !== 'undefined';
const DB_VERSION = 4;

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
        } catch { /* ignore */ }
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
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as StoreMap[K][]);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function idbPut<K extends StoreName>(storeName: K, value: StoreMap[K]): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbDelete<K extends StoreName>(storeName: K, key: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const lsKeys: Record<StoreName, string> = { orders: 'cakeOrders' };

function readFromLocalStorage<K extends StoreName>(store: K): StoreMap[K][] {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(lsKeys[store]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoreMap[K][]) : [];
  } catch { return []; }
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
  } catch { /* ignore */ }
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
  } catch { /* ignore */ }
}

/* ========= Helpers ========= */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ptMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long', year: 'numeric',
  });
}

function cx(...xs: Array<string | boolean | undefined | null>) {
  return xs.filter(Boolean).join(' ');
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'canceled', label: 'Cancelado' },
];

function statusBadgeColor(s: OrderStatus) {
  switch (s) {
    case 'pending': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'delivered': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'canceled': return 'bg-rose-100 text-rose-800 border-rose-300';
  }
}

/* ========= Compressão ========= */
/**
 * Serializa e comprime um array de pedidos com pako (deflate).
 * Retorna uma string base64 pronta para uso em URL.
 */
function compressOrders(orders: Order[]): string {
  const json = JSON.stringify(orders);
  const compressed = pako.deflate(json);
  // Converte Uint8Array → string binária → base64
  let binary = '';
  const chunkSize = 8192; // evita stack overflow em arrays grandes
  for (let i = 0; i < compressed.length; i += chunkSize) {
    binary += String.fromCharCode(...compressed.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Descomprime um payload gerado por compressOrders.
 * Tem fallback para o formato legado (sem compressão) para retrocompatibilidade.
 */
function decompressOrders(b64: string): Order[] {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

  let json: string;
  try {
    // Tenta descomprimir (formato novo com pako)
    const decompressed = pako.inflate(bytes);
    json = new TextDecoder().decode(decompressed);
  } catch {
    // Fallback: formato legado sem compressão
    json = decodeURIComponent(escape(atob(b64)));
  }

  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Payload inválido');
  return parsed as Order[];
}

/* ========= WhatsApp ========= */
function buildWhatsAppLink(order: Order): string {
  const name = order.clientName || 'cliente';
  const date = order.deliveryDate
    ? new Date(order.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';
  const decorated = order.decorated ? '\n🎨 Decorado' : '';
  const notes = order.notes?.trim() ? `\n📝 Obs: ${order.notes.trim()}` : '';

  const msg = `Olá ${name}! 🎂\n\nSeu pedido está confirmado:\n• Sabor: ${order.flavorName}\n• Tamanho: ${order.sizeKg} kg\n• Cor da massa: ${order.doughColor}${decorated}${notes}\n• Valor: ${formatBRL(order.price)}${date ? `\n• Entrega: ${date}` : ''}\n\nQualquer dúvida, é só chamar! 😊`;

  const phone = order.clientPhone?.replace(/\D/g, '') || '';
  const base = phone ? `https://wa.me/55${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(msg)}`;
}

/* ========= Confirm Dialog ========= */
function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  message,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-gray-800 text-sm mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-sm"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========= OrderCard (fora do componente pai para evitar re-criação) ========= */
interface OrderCardProps {
  o: Order;
  showDateEdit?: boolean;
  todayStr: string;
  tomorrowStr: string;
  saving: boolean;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onUpdateDate: (id: string, date: string) => void;
  onDelete: (id: string) => void;
}

function OrderCard({
  o,
  showDateEdit = false,
  todayStr,
  tomorrowStr,
  saving,
  onUpdateStatus,
  onUpdateDate,
  onDelete,
}: OrderCardProps) {
  const isOverdue =
    o.deliveryDate && o.deliveryDate < todayStr && o.status !== 'delivered' && o.status !== 'canceled';
  const isToday = o.deliveryDate === todayStr;
  const isTomorrow = o.deliveryDate === tomorrowStr;

  return (
    <div
      className={cx(
        'border rounded-2xl p-4 bg-white flex flex-col gap-3 transition-all',
        o.status === 'delivered' ? 'opacity-60 border-gray-200' : 'border-pink-100 shadow-sm',
        isOverdue && 'border-rose-300 bg-rose-50/30'
      )}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onUpdateStatus(o.id, o.status === 'delivered' ? 'confirmed' : 'delivered')}
            disabled={saving}
            aria-label={o.status === 'delivered' ? 'Desmarcar entrega' : 'Marcar como entregue'}
            className="flex-shrink-0"
          >
            {o.status === 'delivered' ? (
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            ) : (
              <Circle className="w-6 h-6 text-gray-300 hover:text-emerald-400 transition-colors" />
            )}
          </button>

          <div className="min-w-0">
            <div className={cx('font-semibold text-gray-900 truncate', o.status === 'delivered' && 'line-through text-gray-400')}>
              {o.type === 'custom' ? (o.clientName || 'Cliente') : 'Pronta Entrega'}
            </div>
            {o.deliveryDate && (
              <div className={cx(
                'text-xs mt-0.5',
                isOverdue ? 'text-rose-600 font-semibold' :
                isToday ? 'text-indigo-600 font-semibold' :
                isTomorrow ? 'text-amber-600 font-medium' :
                'text-gray-500'
              )}>
                {isOverdue && '⚠️ Atrasado · '}
                {isToday && '📦 Hoje · '}
                {isTomorrow && '⏰ Amanhã · '}
                {new Date(o.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}
              </div>
            )}
          </div>
        </div>

        <span className={cx('text-[11px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0', statusBadgeColor(o.status))}>
          {statusOptions.find((s) => s.value === o.status)?.label}
        </span>
      </div>

      {/* Detalhes */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 pl-8">
        <div><span className="text-gray-400">Sabor</span> {o.flavorName}</div>
        <div><span className="text-gray-400">Tamanho</span> {o.sizeKg} kg</div>
        <div><span className="text-gray-400">Cor</span> {o.doughColor}</div>
        <div><span className="text-gray-400">Valor</span> <strong>{formatBRL(o.price)}</strong></div>
        {o.decorated && (
          <div className="col-span-2 text-pink-700 text-xs">🎨 Decorado (+{formatBRL(o.decoratedSurcharge ?? 60)})</div>
        )}
      </div>

      {o.clientPhone && (
        <div className="pl-8 text-sm text-gray-600">
          <a href={`tel:${o.clientPhone.replace(/\D/g, '')}`} className="hover:text-indigo-600 transition-colors">
            📞 {o.clientPhone}
          </a>
        </div>
      )}

      {o.notes?.trim() && (
        <div className="pl-8 text-sm text-gray-600 italic border-l-2 border-pink-200 ml-8 pl-2 whitespace-pre-wrap">
          {o.notes}
        </div>
      )}

      {/* Controles */}
      <div className="pl-8 flex flex-wrap items-center gap-2">
        <select
          value={o.status}
          onChange={(e) => onUpdateStatus(o.id, e.target.value as OrderStatus)}
          disabled={saving}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700"
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {showDateEdit && (
          <input
            type="date"
            value={o.deliveryDate || ''}
            onChange={(e) => onUpdateDate(o.id, e.target.value)}
            disabled={saving}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700"
          />
        )}

        <div className="flex-1" />

        {o.clientPhone && (
          <a
            href={buildWhatsAppLink(o)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </a>
        )}

        <button
          onClick={() => onDelete(o.id)}
          disabled={saving}
          className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-xs transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="pl-8 text-[10px] text-gray-400">
        Criado em {new Date(o.createdAt).toLocaleString('pt-BR')}
        {o.type === 'ready' ? ' · Pronta Entrega' : ' · Encomenda'}
        {` · #${o.id}`}
      </div>
    </div>
  );
}

/* ========= Aba ========= */
type Tab = 'calendar' | 'todo';

/* ========= Página ========= */
export default function DeliveriesDashboard() {
  const todayDate = useMemo(() => new Date(), []);
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(ymd(todayDate));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('todo');
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCount, setQrCount] = useState(0);

  const todayStr = ymd(todayDate);
  const tomorrowStr = ymd(new Date(todayDate.getTime() + 86400000));

  /* ---- Load ---- */
  useEffect(() => {
    let ignore = false;
    let bc: BroadcastChannel | null = null;

    const load = async () => {
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
    };

    const init = async () => {
      await load();

      // Detecta ?import= (com suporte ao novo formato comprimido e ao legado)
      const params = new URLSearchParams(window.location.search);
      const importParam = params.get('import');

      if (importParam) {
        try {
          const imported = decompressOrders(decodeURIComponent(importParam));

          if (imported.length > 0) {
            const db = await storageGetAll('orders');
            const merged = [...db];

            for (const imp of imported) {
              const idx = merged.findIndex((o) => o.id === imp.id);
              if (idx >= 0) merged[idx] = imp;
              else merged.push(imp);
            }

            await Promise.all(imported.map((o) => storagePut('orders', o)));

            if (!ignore) {
              setOrders(merged);
              setMessage({
                type: 'success',
                text: `${imported.length} pedido(s) importado(s) com sucesso!`,
              });
            }

            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch (e) {
          console.error('Falha ao importar QR', e);
          if (!ignore) setMessage({ type: 'error', text: 'QR Code inválido ou corrompido.' });
        }
      }

      // BroadcastChannel para sync entre abas
      try {
        if ('BroadcastChannel' in window) {
          bc = new BroadcastChannel('cake_sync');
          bc.onmessage = (ev) => {
            if ((ev as MessageEvent)?.data?.type === 'orders_changed') load();
          };
        }
      } catch { /* ignore */ }

      const onVisibility = () => {
        if (document.visibilityState === 'visible') load();
      };
      document.addEventListener('visibilitychange', onVisibility);

      // Retorna cleanup — mas como init é async, guardamos para o return do useEffect
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
      };
    };

    let cleanupFn: (() => void) | undefined;
    init().then((fn) => { cleanupFn = fn; });

    return () => {
      ignore = true;
      bc?.close();
      cleanupFn?.();
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(t);
  }, [message]);

  /* ---- Derived data ---- */
  const ordersByDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      if (!o.deliveryDate) continue;
      if (!map.has(o.deliveryDate)) map.set(o.deliveryDate, []);
      map.get(o.deliveryDate)!.push(o);
    }
    return map;
  }, [orders]);

  const todoOrders = useMemo(() =>
    orders
      .filter((o) =>
        o.deliveryDate &&
        o.status !== 'delivered' &&
        o.status !== 'canceled' &&
        o.deliveryDate >= todayStr
      )
      .sort((a, b) => (a.deliveryDate! > b.deliveryDate! ? 1 : -1)),
    [orders, todayStr]
  );

  const overdueOrders = useMemo(() =>
    orders.filter((o) =>
      o.deliveryDate &&
      o.deliveryDate < todayStr &&
      o.status !== 'delivered' &&
      o.status !== 'canceled'
    ),
    [orders, todayStr]
  );

  const firstDay = useMemo(() => new Date(year, month, 1), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const leading = useMemo(() => (firstDay.getDay() + 7) % 7, [firstDay]);

  const cells = useMemo(() =>
    Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - leading + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const date = inMonth ? new Date(year, month, dayNum) : null;
      return {
        key: `${year}-${month}-${i}`,
        dayNumber: inMonth ? dayNum : null,
        dateStr: date ? ymd(date) : null,
        inMonth,
      };
    }),
    [year, month, leading, daysInMonth]
  );

  const selectedOrders = useMemo(
    () => orders.filter((o) => o.deliveryDate === selectedDate),
    [orders, selectedDate]
  );

  const totalDoDia = useMemo(
    () => selectedOrders.reduce((s, o) => s + (Number.isFinite(o.price) ? o.price : 0), 0),
    [selectedOrders]
  );

  const monthSummary = useMemo(() => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthOrders = orders.filter((o) => o.deliveryDate?.startsWith(monthStr));
    const total = monthOrders.reduce((s, o) => s + (o.price || 0), 0);
    const delivered = monthOrders.filter((o) => o.status === 'delivered').length;
    const pending = monthOrders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
    return { total, delivered, pending, count: monthOrders.length };
  }, [orders, year, month]);

  /* ---- Ações ---- */
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
    try {
      setSaving(true);
      await storageDelete('orders', id);
      setOrders((prev) => prev.filter((x) => x.id !== id));
      setMessage({ type: 'success', text: 'Pedido removido.' });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Falha ao remover.' });
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  }

  /* ---- Navegação do calendário ---- */
  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDate(ymd(t));
  }

  /* ---- QR Code ---- */
  async function handleGenerateQR() {
    setQrLoading(true);
    setShowQR(true);
    setQrDataUrl(null);
    try {
      // Filtra apenas pedidos ativos dos próximos 30 dias
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 30);
      const cutoffStr = ymd(cutoff);

      const active = orders.filter(
        (o) =>
          o.status !== 'delivered' &&
          o.status !== 'canceled' &&
          (!o.deliveryDate || o.deliveryDate <= cutoffStr)
      );

      if (active.length === 0) {
        setMessage({ type: 'error', text: 'Nenhum pedido ativo para exportar.' });
        setShowQR(false);
        return;
      }

      setQrCount(active.length);

      // Comprime com pako — ~70% menor que o JSON puro
      const b64 = compressOrders(active);
      const importUrl = `${window.location.origin}/entregas?import=${encodeURIComponent(b64)}`;

      // Segurança: avisa se ainda exceder o limite do QR (improvável, mas defensivo)
      if (b64.length > 2800) {
        setMessage({
          type: 'error',
          text: `Payload ainda muito grande (${active.length} pedidos). Tente reduzir para menos de 100 pedidos ativos simultâneos.`,
        });
        setShowQR(false);
        return;
      }

      const dataUrl = await QRCode.toDataURL(importUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Falha ao gerar QR code.' });
      setShowQR(false);
    } finally {
      setQrLoading(false);
    }
  }

  const weekLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  /* ---- Render ---- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50 p-4 sm:p-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
            .no-print { display: none !important; }
          }
        `,
        }}
      />

      {/* Toast */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={cx(
            'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-sm',
            message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          )}
        >
          {message.text}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        message="Remover este pedido permanentemente?"
        onConfirm={() => confirmDelete && removeOrder(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Modal QR Code */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-pink-600" />
                <h3 className="font-semibold text-pink-900">Abrir no celular</h3>
              </div>
              <button onClick={() => { setShowQR(false); setQrDataUrl(null); }} className="p-1.5 rounded-lg hover:bg-pink-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 text-center space-y-4">
              {qrLoading ? (
                <div className="w-[200px] h-[200px] mx-auto bg-gray-100 rounded-xl animate-pulse" />
              ) : qrDataUrl ? (
                <>
                  <img
                    src={qrDataUrl}
                    alt="QR Code para abrir no celular"
                    className="mx-auto rounded-xl border border-gray-200"
                    width={280}
                    height={280}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-800">
                      Aponte a câmera do celular para este código
                    </p>
                    <p className="text-xs text-gray-500">
                      {qrCount} pedido(s) exportado(s) · dados comprimidos localmente
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    ⚠️ O QR expira quando você fechar esta janela. Gere um novo sempre que quiser atualizar o celular.
                  </div>
                </>
              ) : (
                <p className="text-sm text-rose-600">Falha ao gerar QR. Tente novamente.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Cake className="w-6 h-6 text-pink-600" />
            <h1 className="text-2xl font-bold text-pink-900">Entregas & Pedidos</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center px-3 py-2 rounded-xl border border-pink-200 bg-white hover:bg-pink-50 text-pink-700 text-sm"
            >
              ← Novo Pedido
            </Link>
            <button
              onClick={handleGenerateQR}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 text-sm"
            >
              <Smartphone className="w-4 h-4" /> Abrir no celular
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>
        </div>

        {/* Resumo do mês */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
          {[
            { icon: <TrendingUp className="w-4 h-4 text-emerald-600" />, label: 'Faturamento do mês', value: formatBRL(monthSummary.total), bg: 'bg-emerald-50 border-emerald-200' },
            { icon: <Cake className="w-4 h-4 text-pink-600" />, label: 'Pedidos no mês', value: String(monthSummary.count), bg: 'bg-pink-50 border-pink-200' },
            { icon: <CheckCircle className="w-4 h-4 text-indigo-600" />, label: 'Entregues', value: String(monthSummary.delivered), bg: 'bg-indigo-50 border-indigo-200' },
            { icon: <Clock className="w-4 h-4 text-amber-600" />, label: 'A entregar', value: String(monthSummary.pending), bg: 'bg-amber-50 border-amber-200' },
          ].map((card) => (
            <div key={card.label} className={cx('rounded-2xl border p-3 flex flex-col gap-1', card.bg)}>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">{card.icon}{card.label}</div>
              <div className="text-xl font-bold text-gray-900">{card.value}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div className="flex gap-1 bg-white/60 rounded-2xl p-1 ring-1 ring-pink-100 no-print w-fit">
          {([['todo', '📋 Lista de Bolos'], ['calendar', '📅 Calendário']] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cx(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                activeTab === tab ? 'bg-pink-600 text-white shadow' : 'text-gray-600 hover:bg-pink-50'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ===== ABA: LISTA DE BOLOS A FAZER ===== */}
        {activeTab === 'todo' && (
          <div className="space-y-6">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white/70 rounded-2xl" />)}
              </div>
            ) : (
              <>
                {overdueOrders.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-rose-700 mb-2">⚠️ Atrasados ({overdueOrders.length})</h2>
                    <div className="space-y-3 print-area">
                      {overdueOrders.map((o) => (
                        <OrderCard key={o.id} o={o} showDateEdit todayStr={todayStr} tomorrowStr={tomorrowStr} saving={saving} onUpdateStatus={updateStatus} onUpdateDate={updateDate} onDelete={setConfirmDelete} />
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const list = todoOrders.filter((o) => o.deliveryDate === todayStr);
                  return list.length > 0 ? (
                    <div>
                      <h2 className="text-sm font-semibold text-indigo-700 mb-2">
                        📦 Hoje — {new Date(todayStr + 'T00:00:00').toLocaleDateString('pt-BR')} ({list.length})
                      </h2>
                      <div className="space-y-3 print-area">
                        {list.map((o) => (
                          <OrderCard key={o.id} o={o} todayStr={todayStr} tomorrowStr={tomorrowStr} saving={saving} onUpdateStatus={updateStatus} onUpdateDate={updateDate} onDelete={setConfirmDelete} />
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {(() => {
                  const list = todoOrders.filter((o) => o.deliveryDate === tomorrowStr);
                  return list.length > 0 ? (
                    <div>
                      <h2 className="text-sm font-semibold text-amber-700 mb-2">⏰ Amanhã ({list.length})</h2>
                      <div className="space-y-3">
                        {list.map((o) => (
                          <OrderCard key={o.id} o={o} todayStr={todayStr} tomorrowStr={tomorrowStr} saving={saving} onUpdateStatus={updateStatus} onUpdateDate={updateDate} onDelete={setConfirmDelete} />
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {(() => {
                  const list = todoOrders.filter((o) => o.deliveryDate! > tomorrowStr);
                  return list.length > 0 ? (
                    <div>
                      <h2 className="text-sm font-semibold text-gray-600 mb-2">🗓️ Próximos ({list.length})</h2>
                      <div className="space-y-3">
                        {list.map((o) => (
                          <OrderCard key={o.id} o={o} todayStr={todayStr} tomorrowStr={tomorrowStr} saving={saving} onUpdateStatus={updateStatus} onUpdateDate={updateDate} onDelete={setConfirmDelete} />
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {todoOrders.length === 0 && overdueOrders.length === 0 && (
                  <div className="text-center py-16 text-gray-400">
                    <Cake className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum bolo pendente. Tudo em dia! 🎉</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== ABA: CALENDÁRIO ===== */}
        {activeTab === 'calendar' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100 overflow-hidden">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 flex items-center justify-between">
                <button className="p-2 rounded-lg hover:bg-white border border-pink-100" onClick={prevMonth} aria-label="Mês anterior">
                  <ChevronLeft className="w-5 h-5 text-pink-700" />
                </button>
                <div className="text-pink-900 font-semibold capitalize">{ptMonthYear(year, month)}</div>
                <button className="p-2 rounded-lg hover:bg-white border border-pink-100" onClick={nextMonth} aria-label="Próximo mês">
                  <ChevronRight className="w-5 h-5 text-pink-700" />
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-2">
                  {weekLabels.map((w, i) => <div key={i} className="py-1">{w}</div>)}
                </div>

                {loading ? (
                  <div className="animate-pulse h-64 bg-gray-100/60 rounded-xl" />
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((c) => {
                      const count = c.dateStr ? (ordersByDate.get(c.dateStr)?.length || 0) : 0;
                      const isT = c.dateStr === ymd(new Date());
                      const isSel = c.dateStr === selectedDate;
                      return (
                        <button
                          key={c.key}
                          disabled={!c.inMonth}
                          onClick={() => c.dateStr && setSelectedDate(c.dateStr)}
                          className={cx(
                            'aspect-square rounded-xl border text-xs flex flex-col items-center justify-center select-none transition-all',
                            c.inMonth ? 'bg-white hover:bg-pink-50 border-pink-100' : 'bg-gray-50 text-gray-300 border-gray-100',
                            isT && c.inMonth && 'ring-2 ring-pink-400',
                            isSel && c.inMonth && 'bg-pink-100 border-pink-300'
                          )}
                        >
                          <span className={cx('font-medium', c.inMonth ? 'text-gray-800' : 'text-gray-300')}>
                            {c.dayNumber ?? ''}
                          </span>
                          {count > 0 && (
                            <span className="mt-0.5 w-5 h-3.5 flex items-center justify-center rounded-full text-[9px] font-bold bg-pink-600 text-white">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-pink-200 bg-white hover:bg-pink-50 text-pink-700 text-sm">
                    Hoje
                  </button>
                  <span className="text-xs text-gray-400">Clique num dia para ver</span>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg ring-1 ring-pink-100 overflow-hidden print-area">
              <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-rose-50 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">Entregas do dia</div>
                  <div className="text-lg font-semibold text-pink-900">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="text-sm font-semibold text-pink-900">{formatBRL(totalDoDia)}</div>
              </div>

              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100/60 rounded-xl" />)}
                  </div>
                ) : selectedOrders.length === 0 ? (
                  <div className="text-gray-400 text-center py-8 text-sm">Nenhuma entrega nesta data.</div>
                ) : (
                  selectedOrders.map((o) => (
                    <OrderCard key={o.id} o={o} showDateEdit todayStr={todayStr} tomorrowStr={tomorrowStr} saving={saving} onUpdateStatus={updateStatus} onUpdateDate={updateDate} onDelete={setConfirmDelete} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}