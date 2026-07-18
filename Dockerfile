# Imagem Node.js super leve (sem Chrome, sem Puppeteer!)
FROM node:22-alpine

WORKDIR /app

# Copia e instala as dependências (ultra rápido sem Puppeteer)
COPY package*.json ./
RUN npm install --production

# Copia o código da aplicação
COPY . .

EXPOSE 3000

# Inicia a API
CMD ["npm", "start"]
