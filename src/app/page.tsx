'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cake, Printer, DollarSign, Settings, Plus, Trash2, ChevronDown } from 'lucide-react';

interface Flavor {
  name: string;
  pricePerKg: number;
}

const defaultFlavors: Flavor[] = [
  { name: 'Chocolate', pricePerKg: 50 },
  { name: 'Baunilha', pricePerKg: 45 },
  { name: 'Morango', pricePerKg: 55 },
  { name: 'Limão', pricePerKg: 40 },
];

const doughColors = ['Branco', 'Chocolate', 'Rosa', 'Azul', 'Verde'];

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const toNumber = (s: string) => {
  if (!s) return NaN;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

export default function Home() {
  const [size, setSize] = useState('');
  const [flavor, setFlavor] = useState('');
  const [doughColor, setDoughColor] = useState('');
  const [flavors, setFlavors] = useState(defaultFlavors);
  const [showNote, setShowNote] = useState(false);
  const [showManageFlavors, setShowManageFlavors] = useState(false);
  const [newFlavorName, setNewFlavorName] = useState('');
  const [newFlavorPrice, setNewFlavorPrice] = useState('');
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(new Date().toLocaleDateString('pt-BR'));
    
    const storedFlavors = window.localStorage.getItem('cakeFlavors');
    if (storedFlavors) {
      try {
        const parsed = JSON.parse(storedFlavors);
        if (Array.isArray(parsed)) {
          setFlavors(parsed);
        }
      } catch (err) {
        console.error('Falha ao carregar sabores', err);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('cakeFlavors', JSON.stringify(flavors));
  }, [flavors]);

  const selectedFlavor = useMemo(
    () => flavors.find((f) => f.name === flavor),
    [flavors, flavor]
  );

  const kg = useMemo(() => toNumber(size), [size]);

  const price = useMemo(() => {
    if (!selectedFlavor || !Number.isFinite(kg) || kg <= 0) return 0;
    return kg * selectedFlavor.pricePerKg;
  }, [kg, selectedFlavor]);

  const isFormValid = Boolean(selectedFlavor && Number.isFinite(kg) && kg > 0 && doughColor);

  const handleGenerateNote = () => {
    if (isFormValid) {
      setShowNote(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddFlavor = () => {
    const name = newFlavorName.trim();
    const parsedPrice = toNumber(newFlavorPrice);

    if (!name || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return;

    setFlavors((prev) => {
      const exists = prev.some((f) => f.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.map((f) =>
          f.name.toLowerCase() === name.toLowerCase() ? { ...f, pricePerKg: parsedPrice } : f
        );
      }
      return [...prev, { name, pricePerKg: parsedPrice }];
    });

    setNewFlavorName('');
    setNewFlavorPrice('');
  };

  const handleRemoveFlavor = (flavorName) => {
    setFlavors((prev) => prev.filter((f) => f.name !== flavorName));
    if (flavor === flavorName) {
      setFlavor('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      <div className="max-w-md mx-auto space-y-6 no-print">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-pink-600 flex items-center justify-center gap-2">
            <Cake className="w-8 h-8" />
            Pronta Entrega
          </h1>
          <p className="text-gray-600 mt-2">Sistema de Encomendas de Bolo</p>
        </div>

        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4 border-b">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Cake className="w-5 h-5" />
              Novo Pedido
            </h2>
          </div>
          <div className="p-4 space-y-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              >
                <option value="">Selecione a cor</option>
                {doughColors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </div>

            {price > 0 && (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-800">Preço Total: {formatBRL(price)}</span>
              </div>
            )}

            <button
              onClick={handleGenerateNote}
              disabled={!isFormValid}
              className="w-full bg-pink-600 text-white py-2 px-4 rounded-md hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Gerar Nota
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowManageFlavors(!showManageFlavors)}
          className="w-full bg-white border border-gray-300 py-2 px-4 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Gerenciar Sabores
          <ChevronDown className={`w-4 h-4 transition-transform ${showManageFlavors ? 'rotate-180' : ''}`} />
        </button>

        {showManageFlavors && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold">Adicionar/Atualizar Sabor</h3>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <button
                  onClick={handleAddFlavor}
                  disabled={!newFlavorName.trim() || !Number.isFinite(toNumber(newFlavorPrice)) || toNumber(newFlavorPrice) <= 0}
                  className="w-full bg-pink-600 text-white py-2 px-4 rounded-md hover:bg-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Salvar Sabor
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold">Sabores Existentes</h3>
              </div>
              <div className="p-4 space-y-2">
                {flavors.map((f) => (
                  <div key={f.name} className="flex items-center justify-between p-2 border rounded">
                    <span>
                      {f.name} - {formatBRL(f.pricePerKg)}/kg
                    </span>
                    <button
                      onClick={() => handleRemoveFlavor(f.name)}
                      disabled={flavors.length <= 1}
                      className="bg-red-600 text-white p-2 rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
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

      {showNote && (
        <div className="max-w-md mx-auto print-content">
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b text-center">
              <h2 className="text-3xl font-bold">Pronta Entrega</h2>
              <p className="text-gray-600 mt-1">Nota de Pedido</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Tamanho:</strong> {Number.isFinite(kg) ? kg : size} kg
                </div>
                <div>
                  <strong>Sabor:</strong> {flavor}
                </div>
                <div>
                  <strong>Cor da Massa:</strong> {doughColor}
                </div>
                <div>
                  <strong>Preço Total:</strong> {formatBRL(price)}
                </div>
              </div>
              <div className="text-center text-sm text-gray-600">
                Data: {today || '—'}
              </div>
            </div>
            <div className="p-4 no-print">
              <button
                onClick={handlePrint}
                className="w-full bg-white border border-gray-300 py-2 px-4 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir Nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}