import { App } from './core/App';
import { useAppStore } from './core/StateManager';

const app = new App();
(window as any).__VFEED_APP__ = app;
(window as any).__VFEED_STORE__ = useAppStore;

void app.start().catch((err) => {
  console.error('[v-feed] failed to start', err);
});

window.addEventListener('beforeunload', () => {
  app.dispose();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
