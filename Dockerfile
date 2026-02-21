# Use Node.js LTS como base
FROM node:24-bookworm-slim AS builder

# Instalar pnpm
RUN npm install -g pnpm

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build da aplicação
RUN pnpm run build

# Estágio de produção
FROM node:24-bookworm-slim AS runtime

# Instalar pnpm
RUN npm install -g pnpm

# Criar usuário não-root
RUN groupadd -g 1001 nodejs
RUN useradd -u 1001 -g nodejs -m sveltekit

# Dependências do Chrome para o Puppeteer
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Cache do Puppeteer
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar apenas dependências de produção
RUN pnpm install --prod --frozen-lockfile

# Instalar Chrome para o Puppeteer
RUN mkdir -p /app/.cache/puppeteer \
    && npx puppeteer browsers install chrome \
    && chown -R sveltekit:nodejs /app/.cache

# Copiar build da aplicação do estágio anterior
COPY --from=builder --chown=sveltekit:nodejs /app/build build/

# Criar diretório data vazio (será mapeado como volume)
RUN mkdir -p data && chown sveltekit:nodejs data

# Não mudar para usuário não-root ainda para manter permissões de escrita
# USER sveltekit

# Expor porta
EXPOSE 3000

# Definir variáveis de ambiente
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Comando para iniciar a aplicação
CMD ["node", "build"]
