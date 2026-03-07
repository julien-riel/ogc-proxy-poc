import { createApp } from './app.js';
import { initLogging, logger } from './logger.js';

const PORT = process.env.PORT || 3000;

initLogging();
const log = logger.app();

const app = await createApp();
app.listen(PORT, () => {
  log.info(`OGC Proxy running on port ${PORT}`);
});
