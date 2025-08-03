# Use Node.js LTS como base
FROM node:24-alpine AS builder

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
FROM node:24-alpine AS runtime

# Instalar pnpm
RUN npm install -g pnpm

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S sveltekit -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./

# Instalar apenas dependências de produção
RUN pnpm install --prod --frozen-lockfile

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
