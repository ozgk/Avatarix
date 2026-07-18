# Usa a imagem oficial do Puppeteer que já vem com Node.js e Google Chrome pré-instalados
FROM ghcr.io/puppeteer/puppeteer:latest

# Define a variável de ambiente para que o Puppeteer saiba onde achar o Chrome dentro do container
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# O usuário 'pptruser' vem por padrão na imagem por segurança. Mudamos temporariamente para root para instalar pacotes.
USER root

# Copia e instala as dependências
COPY package*.json ./
RUN npm install

# Copia o resto do código da aplicação
COPY . .

# Devolve a permissão dos arquivos para o usuário seguro
RUN chown -R pptruser:pptruser /app

# Volta para o usuário seguro para rodar o app
USER pptruser

EXPOSE 3000

# Comando para iniciar a API
CMD ["npm", "start"]
