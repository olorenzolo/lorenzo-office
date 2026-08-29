#!/bin/zsh
# Duplo-clique para abrir o escritório.
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

PORT=4141

if curl -s -o /dev/null "http://localhost:$PORT"; then
  echo "Office já está rodando."
else
  [ -d node_modules ] || npm install
  [ -d .next ] || npm run build
  nohup npm run start > .office.log 2>&1 &
  printf "Abrindo o escritório"
  for i in $(seq 1 40); do
    curl -s -o /dev/null "http://localhost:$PORT" && break
    printf "."
    sleep 1
  done
  echo
fi

open "http://localhost:$PORT"
echo "Office em http://localhost:$PORT — pode fechar esta janela."
