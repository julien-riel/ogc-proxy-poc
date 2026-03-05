import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
createApp().listen(PORT, () => {
  console.log(`Mock API running on port ${PORT}`);
});
