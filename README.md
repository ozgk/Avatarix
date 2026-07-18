# Avatar API Pro

Um SaaS de nível empresarial capaz de receber qualquer URL de perfil (Instagram, LinkedIn, Twitter, GitHub, Fóruns, etc.) e extrair a foto de perfil do usuário, driblando ferramentas modernas de detecção anti-bot através de técnicas de Stealth Scraping.

## 🚀 Arquitetura e Tech Stack

* **Backend:** Node.js com Express.js
* **Motor de Web Scraping:** `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
* **Camada de Caching:** Redis
* **Frontend:** Interface estática rica (Glassmorphism) com HTML Puro + Tailwind CSS via CDN.

## 🧠 A Cascata de Extração

Ao realizar um Request `POST /api/extract`, os seguintes passos são executados na arquitetura:

1. **Cache Layer**: Verifica se a URL foi pesquisada nas últimas 24 horas no Redis (Resposta imediata, sem custo computacional).
2. **Stealth Headless Browser**: A API lança um Chromium não-sandboxado que mascara impressões digitais de bot (User-Agent de iPhone 14 emulado) capaz de cruzar firewalls de CDN (Cloudflare/Datadome).
3. **Extração Nível 1 (Open Graph)**: Extrai instantaneamente de Metadados Sociais (OG/Twitter).
4. **Extração Nível 2 (Seletores Dedicados)**: Aplica seletores manuais específicos se o domínio for reconhecido (ex: GitHub, LinkedIn).
5. **Extração Nível 3 (Heurística de DOM Engine)**: Escaneamento inteligente com fallback. Varre todo o DOM atrás de tags de imagens (>50px) com base em palavras-chave em classes, IDs, links e descrições (ex: `avatar`, `profile`, `user`).
6. O browser é **imediatamente fechado (Memory Leak Prevented)** e o resultado passa para a camada de cache, retornando a URL pro Cliente via JSON. Em caso de restrições de bloqueio totais, a API trata via *Graceful Fallback* devolvendo HTTP 404 e erro customizado (não crasha).

## 📦 Como rodar este projeto:

**Requisitos**: Possuir `node`, `npm` e `redis` (ou docker p/ rodar container Redis).

1. Clone ou baixe este repositório
2. Suba o Redis (Por exemplo: `docker run -d -p 6379:6379 redis`)
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o servidor:
   ```bash
   npm run dev
   ```
5. Acesse `http://localhost:3000` pelo seu navegador para usar a interface interativa.
