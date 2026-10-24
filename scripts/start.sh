#!/bin/sh
# Entrada do container: aplica as migrações pendentes e sobe o servidor.
# `set -e`: se a migração falhar, o container não sobe (melhor do que servir
# com o esquema desatualizado).
set -e

echo "Aplicando migrações..."
node dist/migrate.mjs

echo "Iniciando o servidor na porta ${PORT:-3000}..."
exec node server.js
