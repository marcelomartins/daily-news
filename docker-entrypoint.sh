#!/bin/sh
#
# Inicia como root apenas o suficiente para acertar as permissoes do volume e
# entao larga privilegios. O node (e o Chrome do Puppeteer, que renderiza
# paginas remotas nao confiaveis) nunca roda como root.
#
# Quem escolhe o usuario, nesta ordem:
#   1. PUID / PGID explicitos no ambiente
#   2. o dono atual de /app/data, para que um volume que ja pertence a um
#      usuario do host continue pertencendo a ele (nada quebra ao atualizar)
#   3. o usuario embutido na imagem (1001:1001)
#
set -eu

DATA_DIR=/app/data
APP_USER=sveltekit
APP_GROUP=nodejs
APP_HOME=/home/sveltekit
CACHE_DIR=/app/.cache

log() {
    echo "[entrypoint] $*"
}

# Compose com `user:` (ou docker run -u) ja definiu um usuario nao-root.
# Sem privilegios nao da para ajustar nada; apenas seguimos.
if [ "$(id -u)" != "0" ]; then
    log "rodando como uid $(id -u), sem ajuste de permissoes"
    exec "$@"
fi

# Adota o dono do volume quando PUID nao foi informado.
if [ -z "${PUID:-}" ] && [ -d "$DATA_DIR" ]; then
    volume_uid=$(stat -c %u "$DATA_DIR" 2>/dev/null || echo 0)
    volume_gid=$(stat -c %g "$DATA_DIR" 2>/dev/null || echo 0)

    if [ "$volume_uid" != "0" ]; then
        PUID=$volume_uid
        if [ -z "${PGID:-}" ] && [ "$volume_gid" != "0" ]; then
            PGID=$volume_gid
        fi
        log "adotando o dono atual de $DATA_DIR ($PUID:${PGID:-$PUID})"
    fi
fi

PUID=${PUID:-1001}
PGID=${PGID:-1001}

# -o permite reaproveitar um id ja usado por outra conta da imagem base.
groupmod -o -g "$PGID" "$APP_GROUP" 2>/dev/null || log "aviso: nao foi possivel ajustar o gid de $APP_GROUP"
usermod -o -u "$PUID" -g "$PGID" "$APP_USER" 2>/dev/null || log "aviso: nao foi possivel ajustar o uid de $APP_USER"

# Falhas de chown nao sao fatais: em NFS/CIFS o dono pode ser imposto pelo
# servidor, e nesses casos a escrita costuma funcionar mesmo assim.
for target in "$DATA_DIR" "$APP_HOME" "$CACHE_DIR"; do
    if [ -e "$target" ]; then
        chown -R "$PUID:$PGID" "$target" 2>/dev/null || log "aviso: chown falhou em $target"
    fi
done

# setpriv --init-groups precisa resolver o uid para um usuario existente.
if getent passwd "$PUID" >/dev/null 2>&1; then
    groups_flag=--init-groups
else
    groups_flag=--clear-groups
fi

# HOME ainda aponta para /root; o Chrome precisa de um HOME onde possa escrever.
export HOME="$APP_HOME"

log "iniciando como $PUID:$PGID"

# exec (sem fork) mantem o processo final como PID 1, para que o SIGTERM do
# `docker stop` chegue ao node e ele libere o lock de background jobs.
exec setpriv --reuid="$PUID" --regid="$PGID" "$groups_flag" "$@"
