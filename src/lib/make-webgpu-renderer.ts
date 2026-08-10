import type { NativeCanvas } from "react-native-wgpu";
import * as THREE from "three/webgpu";

export class ReactNativeCanvas {
  constructor(private canvas: NativeCanvas) {}

  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }
  set width(width: number) {
    this.canvas.width = width;
  }
  set height(height: number) {
    this.canvas.height = height;
  }
  get clientWidth() {
    return this.canvas.width;
  }
  get clientHeight() {
    return this.canvas.height;
  }
  set clientWidth(width: number) {
    this.canvas.width = width;
  }
  set clientHeight(height: number) {
    this.canvas.height = height;
  }

  addEventListener(_type: string, _listener: EventListener) {}
  removeEventListener(_type: string, _listener: EventListener) {}
  dispatchEvent(_event: Event) {}
  setPointerCapture() {}
  releasePointerCapture() {}
}

export const makeWebGPURenderer = (
  context: GPUCanvasContext,
  { antialias = true }: { antialias?: boolean } = {}
) =>
  new THREE.WebGPURenderer({
    antialias,
    // @ts-expect-error
    canvas: new ReactNativeCanvas(context.canvas),
    context,
  });
