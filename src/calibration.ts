import { CalibrationConsole, type TestPatternMode } from './ui/CalibrationConsole';
import { syncChannel } from './core/SyncChannel';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.querySelector<HTMLCanvasElement>('#matrix-canvas');
  const guiContainer = document.querySelector<HTMLElement>('#gui-panel');

  if (!canvas || !guiContainer) {
    console.error('[v-feed] Missing required calibration DOM elements');
    return;
  }

  // Set crisp canvas dimensions matching display aspect ratio (9:16)
  const resizeCanvas = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const parentW = parent.clientWidth;
    const parentH = parent.clientHeight;
    
    // Fit 9:16 box inside parent with margin
    const targetAspect = 9 / 16;
    let w = parentW - 32;
    let h = w / targetAspect;
    if (h > parentH - 32) {
      h = parentH - 32;
      w = h * targetAspect;
    }
    
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
    canvas.width = 540;
    canvas.height = 960;
  };

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const consoleApp = new CalibrationConsole(canvas, guiContainer);

  // Connection indicator status poller
  const statusBadge = document.querySelector<HTMLElement>('#conn-status');
  const updateConnStatus = () => {
    if (!statusBadge) return;
    const connected = syncChannel.isPeerConnected();
    if (connected) {
      statusBadge.textContent = '● MAIN STAGE CONNECTED';
      statusBadge.className = 'badge online';
    } else {
      statusBadge.textContent = '○ WAITING FOR MAIN STAGE...';
      statusBadge.className = 'badge standby';
    }
  };
  setInterval(updateConnStatus, 1000);
  updateConnStatus();

  // Pattern Selector Buttons
  const patternButtons = document.querySelectorAll<HTMLButtonElement>('[data-pattern]');
  patternButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      patternButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const pattern = btn.getAttribute('data-pattern') as TestPatternMode;
      consoleApp.setTestPattern(pattern);
    });
  });

  // Screen Selector Buttons (CRT 01 - 06)
  const screenButtons = document.querySelectorAll<HTMLButtonElement>('[data-screen]');
  screenButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      screenButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const scr = Number(btn.getAttribute('data-screen'));
      consoleApp.setSelectedScreen(scr);
    });
  });

  // Top Bar Action Buttons
  document.querySelector('#btn-open-main')?.addEventListener('click', () => {
    window.open('/', '_blank');
  });

  document.querySelector('#btn-popout')?.addEventListener('click', () => {
    window.open(window.location.href, 'vfeed_calib_window', 'width=1200,height=880');
  });

  document.querySelector('#btn-save-all')?.addEventListener('click', () => {
    void consoleApp.saveToBrowserAndServer();
  });

  document.querySelector('#btn-export-json')?.addEventListener('click', () => {
    consoleApp.exportCalibrationJson();
  });

  document.querySelector('#btn-import-json')?.addEventListener('click', () => {
    consoleApp.importCalibrationJson();
  });
});
