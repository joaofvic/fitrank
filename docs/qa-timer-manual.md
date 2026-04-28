# QA manual — Timer de treino e descanso (Epic E)

Pré-requisitos: app com `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` válidos, usuário logado, abas **Cronômetro** e **Descanso** visíveis.

Marque **OK** / **Falha** e anote build/data.

## Matriz de cenários (E.1)

| # | Cenário | Passos resumidos | Resultado esperado | OK |
|---|---------|------------------|---------------------|-----|
| 1 | Treino rodando → descanso → voltar | Iniciar cronômetro; aguardar alguns segundos; aba **Descanso**; voltar **Cronômetro** | Tempo de treino **não diminui** ao ir/voltar; se estava rodando, treino fica **pausado** ao trocar (mensagem de status opcional) | |
| 2 | Descanso até o fim | Aba Descanso; preset (ex. 30s); iniciar; aguardar zerar | Contagem chega a 0; feedback de conclusão (som/vibra conforme dispositivo) | |
| 3 | Plano → timer em descanso com treino pré-existente | Com tempo de treino > 0 no cronômetro, abrir fluxo do **plano** que navega ao timer em descanso (se existir no produto) | Treino acumulado **preservado**; descanso conforme plano | |
| 4 | Finalizar com treino > 0 (aba Cronômetro) | Acumular tempo no cronômetro; **Finalizar treino** | Check-in (ou fluxo seguinte) recebe **duração = tempo de treino**, não o countdown | |
| 5 | Finalizar com treino > 0 (aba Descanso) | Mesmo com aba Descanso ativa e treino já acumulado; **Finalizar** | Mesmo critério: **só tempo de treino** no check-in | |
| 6 | Reset por trilha | No cronômetro com tempo > 0: reset → só treino zera. No descanso: reset → só countdown volta ao alvo | Sem apagar a outra trilha involuntariamente | |
| 7 | Mini timer | Iniciar sessão; minimizar (sair da view timer) | Mini mostra modo relevante; **não some** com descanso pausado / sessão ativa | |
| 8 | A11y rápido | Teclado: foco nas abas e botões Play/Pausa/Reset/Finalizar | Foco visível; leitor de tela anuncia abas e rótulos dos ícones | |

## E.2 — Automação

- Script: `pnpm test:e2e` (todos os testes) ou `pnpm test:e2e e2e/timer.spec.js`.
- O `playwright.config.js` sobe `pnpm dev` na porta **3000** quando nenhum servidor está ativo.
- A chave de sessão fake em `e2e/helpers/supabase-e2e-setup.js` deve bater com o **project ref** da sua `VITE_SUPABASE_URL` (`E2E_SUPABASE_PROJECT_REF`, padrão `pjlmemvwqhmpchiiqtol`).
- `setupE2EAuthAndMocks` também registra mocks vazios de **checkins** e **notifications** para a home carregar rápido.
