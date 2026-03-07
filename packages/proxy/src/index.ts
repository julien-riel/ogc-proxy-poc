import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;

const app = await createApp();
app.listen(PORT, () => {
  console.log(`OGC Proxy running on port ${PORT}`);
});
