# DevCentral 2.1 — Cockpit de Projetos (GitHub, GitLab, 2 Contas Vercel & Neon DB)

Painel centralizado desenvolvido em **Next.js 15 + Tailwind CSS + Neon PostgreSQL** para visualizar, interagir e gerenciar seus repositórios do **GitHub**, **GitLab** e aplicações publicadas nas suas **duas contas da Vercel**, combinando **sincronização automática via API** e **cadastro/edição manual** persistidos na nuvem.

## ✨ O que foi implementado

- **4 Fontes Automáticas Independentes (`POST /api/sync`)**:
  - **GitHub API**: Importa até 500 repositórios públicos e privados (via `GITHUB_TOKEN`) ou públicos (via `GITHUB_USERNAME`).
  - **GitLab API**: Importa até 500 projetos públicos e privados (via `GITLAB_TOKEN`, escopo `read_api`) ou públicos (via `GITLAB_USERNAME`), detectando também a linguagem principal dos projetos recentes.
  - **Vercel — Conta 1 (`VERCEL_TOKEN_1`)**: Importa projetos e links de produção da sua primeira conta Vercel (pessoal ou equipe via `VERCEL_TEAM_ID_1`).
  - **Vercel — Conta 2 (`VERCEL_TOKEN_2`)**: Importa projetos e links de produção da sua segunda conta Vercel (pessoal ou equipe via `VERCEL_TEAM_ID_2`).
- **Associação Inteligente Multi-Contas**:
  - Cruza automaticamente os projetos das duas contas Vercel com os repositórios do GitHub e GitLab.
  - Se um mesmo repositório estiver publicado nas duas contas Vercel, o card exibe as etiquetas das duas contas e os links diretos para ambos os deploys.
  - Permite filtrar os projetos especificamente por **Conta Vercel** (`Todas as contas Vercel`, `Minha Vercel Pessoal`, `Minha Segunda Vercel`).
- **Persistência na Nuvem com Neon PostgreSQL**:
  - Ao contrário da versão em `localStorage`, todos os projetos importados, projetos cadastrados manualmente, edições personalizadas (`custom_override`), projetos fixados (`is_pinned`) e ocultos (`is_hidden`) ficam salvos no banco **Neon PostgreSQL** (`aws-sa-east-1`), sincronizados entre qualquer computador ou celular.

## 🚀 Como usar

1. Preencha seus tokens no arquivo [`.env.local`](file:///D:/Projetos%20Vs%20Code/DevCentral/.env.local) (o `DATABASE_URL` do Neon já está configurado e pronto):
   ```env
   GITHUB_TOKEN="seu_token_github"
   GITLAB_TOKEN="seu_token_gitlab"

   VERCEL_ACCOUNT_1_NAME="Minha Vercel Pessoal"
   VERCEL_TOKEN_1="token_da_primeira_conta"
   VERCEL_TEAM_ID_1=""

   VERCEL_ACCOUNT_2_NAME="Minha Segunda Vercel"
   VERCEL_TOKEN_2="token_da_segunda_conta"
   VERCEL_TEAM_ID_2=""
   ```
2. Inicie o servidor:
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000` e clique em **↻ Sincronizar fontes**.
