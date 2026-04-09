# 🎂 Sistema de Encomendas — Confeitaria

> Sistema web completo para gestão de pedidos de uma confeitaria real, atualmente em produção.

---

## ✨ Sobre o Projeto

Aplicação desenvolvida para uso interno de uma confeitaria, substituindo o controle manual por papel. O sistema permite cadastrar pedidos, acompanhar entregas, gerar notas impressas e confirmar pedidos pelo WhatsApp — tudo funcionando **100% offline**, sem necessidade de internet ou servidor externo.

---

## 🚀 Funcionalidades

- **Dois tipos de pedido:** Pronta Entrega e Encomenda com data de entrega
- **Cálculo automático de preço** (peso × sabor + decorado + adicionais)
- **Nota de pedido imprimível** com layout otimizado para impressão térmica
- **Integração com WhatsApp** — mensagem de confirmação pré-formatada com um clique
- **Dashboard de entregas** com calendário interativo e lista de pendências
- **Alertas inteligentes** para pedidos atrasados, de hoje e de amanhã
- **Resumo financeiro mensal** — faturamento, pedidos entregues e a entregar
- **QR Code para sincronização** entre computador e celular sem login
- **Cadastro completo** de clientes, sabores e adicionais configuráveis
- **Preço do bolo decorado** configurável separadamente
- **Sincronização entre abas** via BroadcastChannel API
- **Offline-first** — todos os dados ficam no dispositivo via IndexedDB (com fallback para localStorage)

---

## 🛠️ Stack

| Tecnologia | Uso |
|---|---|
| [Next.js 14](https://nextjs.org/) | Framework React com App Router |
| [TypeScript](https://www.typescriptlang.org/) | Tipagem estática |
| [Tailwind CSS](https://tailwindcss.com/) | Estilização |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | Persistência local offline |
| [pako](https://github.com/nodeca/pako) | Compressão de dados para QR Code |
| [qrcode](https://github.com/soldair/node-qrcode) | Geração de QR para sync entre dispositivos |
| [lucide-react](https://lucide.dev/) | Ícones |

---


## 🏗️ Arquitetura

O sistema foi projetado para rodar **sem backend e sem banco de dados externo**. Toda a persistência acontece no navegador via IndexedDB, com fallback automático para localStorage em ambientes sem suporte.

A sincronização entre dispositivos é feita via **QR Code com payload comprimido (pako/deflate)**, eliminando a necessidade de conta, login ou servidor.

```
┌─────────────────────────────────────┐
│           Next.js (Frontend)        │
│                                     │
│  ┌──────────┐    ┌────────────────┐ │
│  │ Pedidos  │    │   Entregas     │ │
│  │ (/)      │    │   (/entregas)  │ │
│  └──────────┘    └────────────────┘ │
│                                     │
│  ┌──────────────────────────────┐   │
│  │     Storage Adapter          │   │
│  │  IndexedDB → localStorage    │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## ⚙️ Como rodar localmente

```bash
# Clone o repositório
git clone https://github.com/fct651/confeitaria.git
cd confeitaria

# Instale as dependências
npm install

# Rode em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`

---

## 📦 Build para produção

```bash
npm run build
npm start
```

---

## 💡 Contexto

Este projeto foi construído com **vibe coding** para resolver um problema real: uma confeitaria que controlava tudo no papel, agilizando no atendimento. O sistema está em uso ativo.

---

## 📄 Licença

MIT
