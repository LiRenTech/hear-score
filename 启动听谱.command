#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
fi
if ! command -v npm >/dev/null 2>&1; then
  print "请先安装 Node.js 22 LTS，再重新打开此文件。"
  read -k 1
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
print "听谱正在启动。关闭本窗口或按 Control+C 可停止。"
npm run dev -- --open
