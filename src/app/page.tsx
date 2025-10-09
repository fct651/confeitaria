'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Cake, Printer, DollarSign, Settings, Plus, Trash2 } from 'lucide-react';

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
  // Normaliza vírgula para ponto
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

export default function Home() {
  const [size, setSize] = useState<string>('');
  const [flavor, setFlavor] = useState<string>('');
  const [doughColor, setDoughColor] = useState<string>('');
  const [flavors, setFlavors] = useState<Flavor[]>(defaultFlavors);
  const [showNote, setShowNote] = useState<boolean>(false);
  const [showManageFlavors, setShowManageFlavors] = useState<boolean>(false);
  const [newFlavorName, setNewFlavorName] = useState<string>('');
  const [newFlavorPrice, setNewFlavorPrice] = useState<string>('');
  const [today, setToday] = useState<string>('');

  // Evita mismatch de hidratação com data
  useEffect(() => {
    setToday(new Date().toLocaleDateString('pt-BR'));
  }, []);

  // Carrega sabores do localStorage
  useEffect(() => {
    try {
      const storedFlavors = localStorage.getItem('cakeFlavors');
      if (storedFlavors) {
        const parsed: unknown = JSON.parse(storedFlavors);
        if (
          Array.isArray(parsed) &&
          parsed.every((p) => p && typeof (p as any).name === 'string' && typeof (p as any).pricePerKg === 'number')
        ) {
          setFlavors(parsed as Flavor[]);
        }
      }
    } catch (err) {
      console.error('Falha ao carregar sabores do localStorage', err);
    }
  }, []);

  // Salva sabores no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cakeFlavors', JSON.stringify(flavors));
    } catch (err) {
      console.error('Falha ao salvar sabores no localStorage', err);
    }
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

    // Se já existir, atualiza o preço. Caso contrário, adiciona novo.
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

  const handleRemoveFlavor = (flavorName: string) => {
    setFlavors((prev) => prev.filter((f) => f.name !== flavorName));
    if (flavor === flavorName) {
      setFlavor('');
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Tudo acima da nota fica oculto na impressão */}
      <div className="max-w-md mx-auto space-y-6 print:hidden">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary flex items-center justify-center gap-2">
            <Cake className="w-8 h-8" />
            Pronta Entrega
          </h1>
          <p className="text-muted-foreground mt-2">Sistema de Encomendas de Bolo</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="w-5 h-5" />
              Novo Pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="size">Tamanho (kg)</Label>
              <Input
                id="size"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="Ex: 1,5"
              />
            </div>

            <div>
              <Label htmlFor="flavor">Sabor do Bolo</Label>
              <Select value={flavor} onValueChange={setFlavor}>
                <SelectTrigger id="flavor">
                  <SelectValue placeholder="Selecione o sabor" />
                </SelectTrigger>
                <SelectContent>
                  {flavors.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name} - {formatBRL(f.pricePerKg)}/kg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="doughColor">Cor da Massa</Label>
              <Select value={doughColor} onValueChange={setDoughColor}>
                <SelectTrigger id="doughColor">
                  <SelectValue placeholder="Selecione a cor" />
                </SelectTrigger>
                <SelectContent>
                  {doughColors.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {price > 0 && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Preço Total: {formatBRL(price)}</span>
              </div>
            )}

            <Button onClick={handleGenerateNote} className="w-full" disabled={!isFormValid}>
              Gerar Nota
            </Button>
          </CardContent>
        </Card>

        <Collapsible open={showManageFlavors} onOpenChange={setShowManageFlavors}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              Gerenciar Sabores
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Adicionar/Atualizar Sabor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="newFlavorName">Nome do Sabor</Label>
                  <Input
                    id="newFlavorName"
                    value={newFlavorName}
                    onChange={(e) => setNewFlavorName(e.target.value)}
                    placeholder="Ex: Brigadeiro"
                  />
                </div>
                <div>
                  <Label htmlFor="newFlavorPrice">Preço por kg (R$)</Label>
                  <Input
                    id="newFlavorPrice"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={newFlavorPrice}
                    onChange={(e) => setNewFlavorPrice(e.target.value)}
                    placeholder="Ex: 60,00"
                  />
                </div>
                <Button
                  onClick={handleAddFlavor}
                  className="w-full"
                  disabled={
                    !newFlavorName.trim() ||
                    !Number.isFinite(toNumber(newFlavorPrice)) ||
                    toNumber(newFlavorPrice) <= 0
                  }
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Salvar Sabor
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sabores Existentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {flavors.map((f) => (
                  <div key={f.name} className="flex items-center justify-between p-2 border rounded">
                    <span>
                      {f.name} - {formatBRL(f.pricePerKg)}/kg
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveFlavor(f.name)}
                      disabled={flavors.length <= 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Nota de pedido (mostrada na tela e impressa sozinha) */}
      {showNote && (
        <div className="max-w-md mx-auto">
          <Card className="print:shadow-none print:border-none">
            <CardHeader className="print:text-center">
              <CardTitle className="text-2xl print:text-3xl">Pronta Entrega</CardTitle>
              <p className="text-sm text-muted-foreground print:text-base">Nota de Pedido</p>
            </CardHeader>
            <CardContent className="space-y-3 print:space-y-4">
              <div className="grid grid-cols-2 gap-4 print:grid-cols-1">
                <div>
                  <strong>Tamanho:</strong> {Number.isFinite(kg) ? `${kg}` : size} kg
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
              <div className="text-center text-sm text-muted-foreground print:text-base">
                Data: {today || '—'}
              </div>
            </CardContent>
            <div className="p-4 print:hidden">
              <Button onClick={handlePrint} variant="outline" className="w-full">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Nota
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}