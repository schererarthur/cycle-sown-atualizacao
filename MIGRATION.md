# MIGRATION.md — Cycle Sown

## 1. O que foi feito nesta task

O site tinha um bug de vazamento de dados entre contas: `login.html`/`register.html`
já autenticam de verdade contra o backend (MySQL + JWT), mas todo o resto do site
(`index.html`, `calendar.html`, `catalogo.html`, `recommendations.html`,
`relatorios.html`, `profile.html`) continuava lendo/escrevendo direto no
`localStorage` do navegador, em chaves globais (`soilAnalysisReports`,
`soilAnalysisData`, `cropCorrectionReports`, `userProfile`, `userSettings`).
Como o `localStorage` é compartilhado por todas as contas que já logaram
naquele navegador, um usuário novo via os dados do usuário anterior.

Isolamos isso com um módulo novo, `userStorage.js`, que:

- Descobre o usuário logado a partir do que `auth.js` já salva
  (`cycleSownUser`/`cycleSownToken`) — não criou nenhuma chave nova de sessão.
- Prefixa toda chave de dado de usuário com `user:<id>:`, então
  `soilAnalysisReports` de duas contas diferentes nunca colidem.
- Sem usuário logado, `getItem` retorna `null` e `setItem` não grava nada
  (em vez de vazar dado pra uma chave sem dono).
- Migra uma única vez os dados antigos sem prefixo para a conta do primeiro
  usuário que logar após o deploy (`user:<id>:_migrated_v1` evita repetir).

Todas as páginas passaram a chamar `userStorage.getItem/setItem` em vez de
`localStorage.getItem/setItem` para esses dados, e ganharam uma guarda de
rota no `<head>` que redireciona para `login.html` se ninguém estiver
logado. `profile.html` ganhou um botão "Sair da Conta" (não existia nenhum
logout implementado antes) e o botão "Limpar Todos os Dados" foi corrigido
para apagar só `user:<id>:*` da conta atual, em vez de `localStorage.clear()`
inteiro (que também apagaria os dados de outras contas guardadas no mesmo
navegador).

## 2. Por que isso é um paliativo, não a solução final

- Os dados continuam presos ao navegador/dispositivo. Um usuário que logar
  no celular não vê as análises que fez no computador.
- Não há sincronização real nem backup — se o usuário limpar os dados do
  navegador, perde tudo (mesmo estando com conta ativa no backend).
- `soil_reports`, `crop_correction_reports`, `user_settings` etc. já existem
  como tabelas no MySQL (`schema.sql`) especificamente para isso, e hoje
  ficam vazias — o backend sabe guardar esses dados, o frontend é que não
  fala com ele fora do login/cadastro.
- É "menos destrutivo para agora", não "correto para sempre": a estratégia
  de prefixo por `user:<id>:` é um remendo em cima do localStorage, não uma
  fonte de verdade real como um banco de dados.

## 3. Próximo passo real: migrar cada página para consumir a API

Endpoints que precisarão existir (nenhum foi criado nesta task):

| Página                                    | Endpoints necessários                                   | Tabelas já existentes no schema         |
|--------------------------------------------|----------------------------------------------------------|------------------------------------------|
| `index.html` (gerar análise)                | `POST /api/soil-reports`                                  | `soil_reports`, `soil_report_nutrients`, `soil_report_crop_compatibility` |
| `relatorios.html` / `recommendations.html`   | `GET /api/soil-reports`, `GET /api/soil-reports/:id`      | idem                                      |
| `recommendations.html` (correção de cultura)| `GET /api/crop-correction-reports`, `POST /api/crop-correction-reports` | `crop_correction_reports`, `crop_correction_report_items` |
| `profile.html` (dados da conta)             | `GET /api/me` (já existe), `PATCH /api/me`                | `users`                                   |
| `profile.html` (configurações)              | `GET /api/settings`, `PUT /api/settings`                  | `user_settings`                           |
| `calendar.html`                             | `GET /api/calendar` (dado de referência, não por usuário) | `planting_calendar_months/crops/activities` |
| `catalogo.html`                             | `GET /api/products` (dado de referência, não por usuário) | `products`                                |

Cada uma dessas trocas segue o mesmo padrão de `js/auth.js`: enviar o
`cycleSownToken` salvo como `Authorization: Bearer <token>` e usar a resposta
da API em vez do `localStorage`. Depois que essas rotas existirem, dá para
apagar `userStorage.js` inteiro — ele deixa de ser necessário porque os dados
passam a ficar isolados no banco (por `user_id`, com foreign key), não mais
por convenção de nome de chave no navegador.
