# 📄 PRD — FitRank (SaaS Fitness Gamificado Local)

## 🧠 1. VISÃO DO PRODUTO

### 🎯 Objetivo
Criar uma plataforma fitness gamificada onde usuários competem entre si através de check-ins diários, com foco em:
* **Consistência:** Criar o hábito do treino.
* **Competição:** Rankings locais e globais.
* **Engajamento:** Gamificação da rotina.
* **Monetização direta:** Receita sem dependência de parceiros.

> **💡 Proposta de Valor:** “Transformar treino em um jogo competitivo e viciante”

### 👥 Público-alvo
* Adolescentes, jovens e adultos (14–60 anos).
* Praticantes de academia, crossfit, calistenia ou corrida.
* Usuários motivados por status, ranking e competição.

---

## 👤 2. PERSONAS E USUÁRIOS

* **Admin Master (`role: master`):** Gerencia a plataforma, controla desafios e ajusta regras do jogo.
* **Usuário (`role: user`):** Realiza check-ins, sobe no ranking e consome funcionalidades pagas.

---

## 🚀 3. ESCOPO DO PRODUTO

### ⚙️ 3.1 FUNCIONALIDADES CORE (MVP)
* **Cadastro:** Fluxo simples (E-mail/Senha) com opcional de Academia.
* **🏆 Ranking Geral:** Lista ordenada por pontos com atualização em tempo real.
* **✔️ Check-in:** * Regra: Máximo de 1 por dia por esporte.
    * Pontuação: **+10 pontos**.
    * Extras: Foto opcional e tipo de treino.
* **📅 Histórico:** Log visual das atividades e pontos acumulados.
* **🎯 Desafio Mensal:** Competição phjaralela (ex: "30 dias de foco") com ranking próprio.

### 💰 3.2 MONETIZAÇÃO
1.  **Desafios Pagos:** Inscrição via Pix para acesso a premiações.
2.  **Plano PRO:** Badges exclusivas e estatísticas avançadas, vantagem em desafios pagos.
3.  **🔥 Streak:** Opção paga para "recuperar" a sequência caso o usuário esqueça um dia.
4.  **Boost:** Compra limitada de pontos extras.
5.  **Ligas:** Sistema de divisões (Bronze a Diamante) com acesso pago.

---

## 🧩 4. LÓGICA E DADOS

### 🧮 Regras de Negócio
* **Pontos:** Incremento via check-in ou boost comprado.
* **Streak:** Reseta se houver quebra de 24h sem check-in (a menos que seja pago o "recovery").

### 🗄️ Modelo de Dados (Simplified)
| Tabela | Campos Principais |
| :--- | :--- |
| **users** | `id, nome, whatsapp, academia, pontos, streak, is_pro` |
| **checkins** | `id, user_id, data, foto_url, tipo_treino` |
| **desafios** | `id, nome, ativo (boolean)` |
| **pagamentos** | `id, user_id, tipo, valor, status` |

---

## 🎨 5. UI/UX DIRETRIZES
* **Mobile-first:** Uso predominante no celular dentro da academia.
* **Fricção Zero:** O botão "Treinei hoje" deve estar sempre acessível.
* **Visual Gamificado:** Uso de barras de progresso e cores vibrantes para o ranking.

---

## 🚀 6. ROADMAP
1.  **V1 (MVP):** Cadastro + Ranking + Check-in.
2.  **V2:** Monetização (PRO, Streak, Boost).
3.  **V3:** Ligas competitivas e Feed Social.

---

## 📊 7. MÉTRICAS DE SUCESSO
* **DAU:** Usuários ativos diariamente.
* **Retenção:** Taxa de usuários que mantêm o streak após 7 dias.
* **MRR:** Receita mensal proveniente de assinaturas e microtransações.