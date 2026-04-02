cd 3rd-party/mcp-whatsapp-web/
npm install
npm run build
cd ../..
rm -rf frontend/public
npx vite build
npx tsx src/index.ts
