import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json());

// Verified real coordinates for Hong Kong landmarks
const LANDMARKS_CACHE = [
  {
    name: '觀塘官立小學',
    address: '九龍觀塘牛頭角道240號 (近牛頭角下邨)',
    lat: 22.31632,
    lng: 114.21788,
  },
  {
    name: '九龍灣學生健康服務中心',
    address: '九龍九龍灣啟仁街9號九龍灣健康中心 (近啟業邨 / 麗晶花園)',
    lat: 22.32835,
    lng: 114.20825,
  },
  {
    name: '觀塘站 (APM)',
    address: '九龍觀塘觀塘道418號',
    lat: 22.31255,
    lng: 114.22565,
  },
  {
    name: '九龍灣站 (德福廣場)',
    address: '九龍九龍灣觀塘道德福廣場',
    lat: 22.32285,
    lng: 114.21415,
  },
  {
    name: '牛頭角下邨',
    address: '九龍牛頭角牛頭角道120號',
    lat: 22.32025,
    lng: 114.21520,
  },
  {
    name: '牛頭角站',
    address: '九龍觀塘道牛頭角站',
    lat: 22.31538,
    lng: 114.21915,
  },
  {
    name: '裕民坊 (YM2)',
    address: '九龍觀塘協和街33號',
    lat: 22.31420,
    lng: 114.22410,
  },
  {
    name: '啟業邨',
    address: '九龍九龍灣觀塘道啟業邨',
    lat: 22.32862,
    lng: 114.20928,
  },
  {
    name: '麗晶花園',
    address: '九龍九龍灣宏照道麗晶花園',
    lat: 22.32825,
    lng: 114.20672,
  },
];

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', landmarks: LANDMARKS_CACHE.length });
});

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (dev=${isDev})`);
  });
}

startServer();
