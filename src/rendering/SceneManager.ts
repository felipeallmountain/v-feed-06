import * as THREE from 'three';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../core/constants';
import { useAppStore } from '../core/StateManager';
import { MatrixSplitter } from './MatrixSplitter';
import { ProceduralFeed } from './ProceduralFeed';
import { VideoTexturePass } from './VideoTexturePass';
import {
  compositeFragmentShader,
  compositeVertexShader,
} from './shaders/CompositeShader';

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly matrix: MatrixSplitter;
  readonly videoPass: VideoTexturePass;
  readonly procedural: ProceduralFeed;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private noiseTexture: THREE.Texture;
  private clock = new THREE.Clock();
  private canvas: HTMLCanvasElement;
  private useProcedural = false;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.canvas = canvas;
    this.matrix = new MatrixSplitter();
    this.videoPass = new VideoTexturePass(video);
    this.procedural = new ProceduralFeed();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.noiseTexture = new THREE.TextureLoader().load(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.videoPass.texture },
        tNoise: { value: this.noiseTexture },
        uTime: { value: 0 },
        uCurvature: { value: 0.18 },
        uScanline: { value: 0.55 },
        uPhosphor: { value: 0.35 },
        uVignette: { value: 0.45 },
        uRgbSplit: { value: 0 },
        uVHold: { value: 0 },
        uHJitter: { value: 0 },
        uNoiseGain: { value: 1 },
        uSignalLock: { value: 0 },
        uRippleStrength: { value: 0 },
        uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uBezelOffset: { value: new THREE.Vector2(8, 10) },
        uBezelGap: { value: new THREE.Vector2(12, 14) },
        uGridMode: { value: 0 },
        uResolution: { value: new THREE.Vector2(CANVAS_WIDTH, CANVAS_HEIGHT) },
      },
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.scene.add(this.mesh);

    this.fitToWindow();
    window.addEventListener('resize', this.fitToWindow);
  }

  setProcedural(enabled: boolean): void {
    this.useProcedural = enabled;
    if (enabled) this.procedural.start();
    else this.procedural.stop();
  }

  setNoiseTexture(url: string): void {
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      this.noiseTexture.dispose();
      this.noiseTexture = tex;
      this.material.uniforms.tNoise.value = tex;
    });
  }

  setGridTexture(texture: THREE.Texture): void {
    this.videoPass.setGridTexture(texture);
  }

  readonly fitToWindow = (): void => {
    const fit = useAppStore.getState().debugFit;
    const stage = this.canvas;
    if (!fit) {
      stage.style.width = `${CANVAS_WIDTH}px`;
      stage.style.height = `${CANVAS_HEIGHT}px`;
      stage.style.transform = 'none';
      return;
    }
    const scale = Math.min(
      window.innerWidth / CANVAS_WIDTH,
      window.innerHeight / CANVAS_HEIGHT,
    );
    stage.style.width = `${CANVAS_WIDTH}px`;
    stage.style.height = `${CANVAS_HEIGHT}px`;
    stage.style.transform = `scale(${scale})`;
  };

  render(): void {
    const state = useAppStore.getState();
    const sh = state.shaders;
    const bezel = state.bezel;
    const t = this.clock.getElapsedTime();

    const hand = state.tracking.rightHand.active
      ? state.tracking.rightHand
      : state.tracking.leftHand;
    const cell = hand.active
      ? this.matrix.cellFromHand(hand.x, hand.y)
      : -1;
    const center =
      cell >= 0 ? this.matrix.cellUvCenter(cell) : { x: 0.5, y: 0.5 };

    const gridMode = state.videoMode === 'grid';
    let diffuse: THREE.Texture;
    if (gridMode) {
      diffuse = this.videoPass.enableGrid(true);
    } else if (this.useProcedural) {
      this.videoPass.enableGrid(false);
      diffuse = this.procedural.texture;
    } else {
      diffuse = this.videoPass.enableGrid(false);
    }

    this.material.uniforms.tDiffuse.value = diffuse;
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uCurvature.value = sh.curvature;
    this.material.uniforms.uScanline.value = sh.scanlineIntensity;
    this.material.uniforms.uPhosphor.value = sh.phosphorMask;
    this.material.uniforms.uVignette.value = sh.vignette;
    this.material.uniforms.uRgbSplit.value = sh.rgbSplit;
    this.material.uniforms.uVHold.value = sh.vHold;
    this.material.uniforms.uHJitter.value = sh.hJitter;
    this.material.uniforms.uNoiseGain.value = sh.noiseGain;
    this.material.uniforms.uSignalLock.value = sh.signalLock;
    this.material.uniforms.uRippleStrength.value = sh.rippleStrength;
    this.material.uniforms.uRippleCenter.value.set(center.x, center.y);
    this.material.uniforms.uBezelOffset.value.set(bezel.offsetX, bezel.offsetY);
    this.material.uniforms.uBezelGap.value.set(bezel.gapX, bezel.gapY);
    this.material.uniforms.uGridMode.value = gridMode ? 1 : 0;

    if (!this.useProcedural && !gridMode) {
      this.videoPass.texture.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    useAppStore.getState().patchShaders({ time: t });
  }

  dispose(): void {
    window.removeEventListener('resize', this.fitToWindow);
    this.procedural.dispose();
    this.videoPass.dispose();
    this.noiseTexture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.renderer.dispose();
  }
}
