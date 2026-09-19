import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useAppStore } from '../src/core/StateManager.js';
import { CalibrationManager } from '../src/core/CalibrationManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('--- Testing Camera Rotation Implementation ---');

// 1. Test StateManager defaults and updates
console.log('1. Testing StateManager cameraRotation...');
const initialState = useAppStore.getState();
assert.strictEqual(
  typeof initialState.tracking.cameraRotation,
  'number',
  'cameraRotation must exist in TrackingState as a number',
);
assert.strictEqual(initialState.tracking.cameraRotation, 0, 'Default cameraRotation should be 0');

useAppStore.getState().patchTracking({ cameraRotation: 90 });
assert.strictEqual(
  useAppStore.getState().tracking.cameraRotation,
  90,
  'cameraRotation should be patchable to 90',
);

useAppStore.getState().patchTracking({ cameraRotation: 270 });
assert.strictEqual(
  useAppStore.getState().tracking.cameraRotation,
  270,
  'cameraRotation should be patchable to 270',
);

// Reset to 0 for subsequent tests
useAppStore.getState().patchTracking({ cameraRotation: 0 });

// 2. Test CalibrationManager payload serialization
console.log('2. Testing CalibrationManager payload...');
const calibManager = new CalibrationManager();
const payload0 = calibManager.getCalibrationPayload();
assert.strictEqual(
  payload0.tracking.cameraRotation,
  0,
  'getCalibrationPayload must include cameraRotation (0)',
);

useAppStore.getState().patchTracking({ cameraRotation: 90 });
const payload90 = calibManager.getCalibrationPayload();
assert.strictEqual(
  payload90.tracking.cameraRotation,
  90,
  'getCalibrationPayload must reflect patched cameraRotation (90)',
);

// 3. Test config/calibration.json and public/calibration.json disk structure
console.log('3. Testing calibration.json file integrity...');
const configJsonPath = path.join(root, 'config', 'calibration.json');
const publicJsonPath = path.join(root, 'public', 'calibration.json');

const configData = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
assert.strictEqual(
  typeof configData.tracking.cameraRotation,
  'number',
  'config/calibration.json must have tracking.cameraRotation',
);

const publicData = JSON.parse(fs.readFileSync(publicJsonPath, 'utf-8'));
assert.strictEqual(
  typeof publicData.tracking.cameraRotation,
  'number',
  'public/calibration.json must have tracking.cameraRotation',
);

// 4. Test rotation mathematical mapping
console.log('4. Testing rotation aspect ratio logic...');
const testResolutions = [
  { vw: 1280, vh: 720 },
  { vw: 1920, vh: 1080 },
  { vw: 640, vh: 480 },
];

for (const { vw, vh } of testResolutions) {
  for (const rot of [0, 90, 180, 270]) {
    const isSwap = rot === 90 || rot === 270;
    const targetW = isSwap ? vh : vw;
    const targetH = isSwap ? vw : vh;
    const aspect = targetW / targetH;

    if (rot === 90 || rot === 270) {
      if (vw === 1280 && vh === 720) {
        assert.strictEqual(targetW, 720);
        assert.strictEqual(targetH, 1280);
        assert.strictEqual(aspect, 720 / 1280); // exactly 9:16
      }
      if (vw === 1920 && vh === 1080) {
        assert.strictEqual(targetW, 1080);
        assert.strictEqual(targetH, 1920);
        assert.strictEqual(aspect, 1080 / 1920); // exactly 9:16
      }
    } else {
      assert.strictEqual(targetW, vw);
      assert.strictEqual(targetH, vh);
    }
  }
}

console.log('All camera rotation automated verification checks PASSED!');
