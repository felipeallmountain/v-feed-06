import { App } from './core/App';

const app = new App();

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
