import * as THREE from 'three';
import {
  DEFAULT_VIDEO_ASPECT,
  getViewportAspect,
  getViewportSize,
  MAX_DEVICE_PIXEL_RATIO,
} from '../core/constants';
import { useAppStore } from '../core/StateManager';
import {
  computeAllScreenCorners,
  createDefaultCornerOffsets,
} from './MatrixSplitter';
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
  readonly videoPass: VideoTexturePass;
  readonly procedural: ProceduralFeed;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private noiseTexture: THREE.Texture;
  private clock = new THREE.Clock();
  private useProcedural = false;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    const { width, height } = getViewportSize();
    this.procedural = new ProceduralFeed(width, height);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.noiseTexture = new THREE.TextureLoader().load(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );

    const initialCorners = computeAllScreenCorners(
      0.024,
      0.024,
      0.018,
      createDefaultCornerOffsets(),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null as unknown as THREE.Texture },
        tNoise: { value: this.noiseTexture },
        uTime: { value: 0 },
        uMatrixSplit: { value: 1.0 },
        uBezelWidthX: { value: 0.024 },
        uBezelWidthY: { value: 0.024 },
        uBezelOuter: { value: 0.018 },
        uBezelComp: { value: 0.65 },
        uCornerRounding: { value: 0.08 },
        uBezelChassis: { value: 1.0 },
        uPerScreenVariance: { value: 0.35 },
        uGlobalFlipH: { value: 0.0 },
        uGlobalFlipV: { value: 0.0 },
        uGlobalRotation: { value: 0.0 },
        uScreenFlips: {
          value: Array.from({ length: 6 }, () => new THREE.Vector2(0, 0)),
        },
        uScreenRotations: {
          value: new Float32Array(6),
        },
        uCorners: { value: initialCorners },
        uShowCornerHandles: { value: 0.0 },
        uCurvature: { value: 0.18 },
        uTubeCurve: { value: 1.0 },
        uScanline: { value: 0.45 },
        uPhosphor: { value: 0.3 },
        uVignette: { value: 0.4 },
        uRgbSplit: { value: 0 },
        uVHold: { value: 0 },
        uHJitter: { value: 0 },
        uNoiseGain: { value: 1 },
        uSignalLock: { value: 0 },
        uRippleStrength: { value: 0 },
        uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uGridMode: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uVideoAspect: { value: DEFAULT_VIDEO_ASPECT },
        uViewportAspect: { value: getViewportAspect() },
        uCoverSample: { value: 0 },
      },
      vertexShader: compositeVertexShader,
      fragmentShader: compositeFragmentShader,
    });

    this.videoPass = new VideoTexturePass(video, (aspect) => {
      this.material.uniforms.uVideoAspect.value = aspect;
    });
    this.material.uniforms.tDiffuse.value = this.videoPass.texture;

    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.scene.add(this.mesh);

    this.resize();
    window.addEventListener('resize', this.resize);
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

  readonly resize = (): void => {
    const { width, height } = getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.procedural.resize(width, height);
    this.material.uniforms.uResolution.value.set(width * dpr, height * dpr);
    this.material.uniforms.uViewportAspect.value = width / Math.max(height, 1);
  };

  render(): void {
    const state = useAppStore.getState();
    const sh = state.shaders;
    const t = this.clock.getElapsedTime();

    const hand = state.tracking.rightHand.active
      ? state.tracking.rightHand
      : state.tracking.leftHand;
    const center = hand.active
      ? { x: hand.x, y: 1.0 - hand.y }
      : { x: 0.5, y: 0.5 };

    const gridMode = state.videoMode === 'grid';
    let diffuse: THREE.Texture;
    let coverSample = 0;
    if (gridMode) {
      diffuse = this.videoPass.enableGrid(true);
    } else if (this.useProcedural) {
      this.videoPass.enableGrid(false);
      diffuse = this.procedural.texture;
    } else {
      this.videoPass.enableGrid(false);
      diffuse = this.videoPass.texture;
      coverSample = 1;
    }

    const updatedCorners = computeAllScreenCorners(
      sh.bezelWidthX,
      sh.bezelWidthY,
      sh.bezelOuter,
      sh.cornerOffsets,
    );
    (window as any).__vfeed_last_corners = updatedCorners;
    const cornerUniform = this.material.uniforms.uCorners.value as THREE.Vector2[];
    for (let i = 0; i < 24; i++) {
      cornerUniform[i].copy(updatedCorners[i]);
    }
    this.material.uniforms.uShowCornerHandles.value = sh.showCornerHandles ? 1.0 : 0.0;

    this.material.uniforms.uGlobalFlipH.value = sh.globalFlipH ? 1.0 : 0.0;
    this.material.uniforms.uGlobalFlipV.value = sh.globalFlipV ? 1.0 : 0.0;
    const deg2rad = Math.PI / 180.0;
    this.material.uniforms.uGlobalRotation.value = ((sh.globalRotation || 0) + (sh.globalFineRotation || 0)) * deg2rad;

    const screenFlipsUniform = this.material.uniforms.uScreenFlips.value as THREE.Vector2[];
    const screenRotUniform = this.material.uniforms.uScreenRotations.value as Float32Array;
    for (let i = 0; i < 6; i++) {
      const sf = sh.screenFlips[i] ?? { flipH: false, flipV: false, rotation: 0, fineRotation: 0 };
      screenFlipsUniform[i].set(sf.flipH ? 1.0 : 0.0, sf.flipV ? 1.0 : 0.0);
      screenRotUniform[i] = ((sf.rotation || 0) + (sf.fineRotation || 0)) * deg2rad;
    }

    this.material.uniforms.tDiffuse.value = diffuse;
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uMatrixSplit.value = sh.matrixSplit ? 1.0 : 0.0;
    this.material.uniforms.uBezelWidthX.value = sh.bezelWidthX;
    this.material.uniforms.uBezelWidthY.value = sh.bezelWidthY;
    this.material.uniforms.uBezelOuter.value = sh.bezelOuter;
    this.material.uniforms.uBezelComp.value = sh.bezelComp;
    this.material.uniforms.uCornerRounding.value = sh.cornerRounding;
    this.material.uniforms.uBezelChassis.value = sh.bezelChassis ? 1.0 : 0.0;
    this.material.uniforms.uPerScreenVariance.value = sh.perScreenVariance;
    this.material.uniforms.uCurvature.value = sh.curvature;
    this.material.uniforms.uTubeCurve.value = sh.tubeCurve ? 1.0 : 0.0;
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
    this.material.uniforms.uGridMode.value = gridMode ? 1 : 0;
    this.material.uniforms.uCoverSample.value = coverSample;

    if (!this.useProcedural && !gridMode) {
      this.videoPass.texture.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    useAppStore.getState().patchShaders({ time: t });
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.procedural.dispose();
    this.videoPass.dispose();
    this.noiseTexture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.renderer.dispose();
  }
}
