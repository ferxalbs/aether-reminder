import * as THREE from "three/webgpu";
import React, { useEffect, useRef } from "react";
import type { ReconcilerRoot, RootState } from "@react-three/fiber";
import {
  extend,
  createRoot,
  unmountComponentAtNode,
  events,
} from "@react-three/fiber";
import type { ViewProps } from "react-native";
import { PixelRatio } from "react-native";
import { Canvas, type CanvasRef } from "react-native-wgpu";

import {
  makeWebGPURenderer,
  ReactNativeCanvas,
} from "./make-webgpu-renderer";

// Extend THREE namespace for R3F - add all components you use
extend({
  AmbientLight: THREE.AmbientLight,
  DirectionalLight: THREE.DirectionalLight,
  PointLight: THREE.PointLight,
  SpotLight: THREE.SpotLight,
  Mesh: THREE.Mesh,
  Group: THREE.Group,
  Points: THREE.Points,
  BoxGeometry: THREE.BoxGeometry,
  SphereGeometry: THREE.SphereGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
  ConeGeometry: THREE.ConeGeometry,
  DodecahedronGeometry: THREE.DodecahedronGeometry,
  BufferGeometry: THREE.BufferGeometry,
  BufferAttribute: THREE.BufferAttribute,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  MeshPhysicalMaterial: THREE.MeshPhysicalMaterial,
  PointsMaterial: THREE.PointsMaterial,
  PerspectiveCamera: THREE.PerspectiveCamera,
  Scene: THREE.Scene,
});

interface FiberCanvasProps {
  children: React.ReactNode;
  style?: ViewProps["style"];
  camera?: THREE.PerspectiveCamera;
  scene?: THREE.Scene;
}

export const FiberCanvas = ({
  children,
  style,
  scene,
  camera,
}: FiberCanvasProps) => {
  const root = useRef<ReconcilerRoot<OffscreenCanvas>>(null!);
  const canvasRef = useRef<CanvasRef>(null);

  useEffect(() => {
    const context = canvasRef.current!.getContext("webgpu")!;
    const renderer = makeWebGPURenderer(context);

    // @ts-expect-error - ReactNativeCanvas wraps native canvas
    const canvas = new ReactNativeCanvas(context.canvas) as HTMLCanvasElement;
    canvas.width = canvas.clientWidth * PixelRatio.get();
    canvas.height = canvas.clientHeight * PixelRatio.get();
    const size = {
      top: 0,
      left: 0,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    };

    if (!root.current) {
      root.current = createRoot(canvas);
    }
    root.current.configure({
      size,
      events,
      scene,
      camera,
      gl: renderer,
      frameloop: "always",
      dpr: 1,
      onCreated: async (state: RootState) => {
        // @ts-expect-error - WebGPU renderer has init method
        await state.gl.init();
        const renderFrame = state.gl.render.bind(state.gl);
        state.gl.render = (s: THREE.Scene, c: THREE.Camera) => {
          renderFrame(s, c);
          context?.present();
        };
      },
    });
    root.current.render(children);
    return () => {
      if (canvas != null) {
        unmountComponentAtNode(canvas!);
      }
    };
  });

  return <Canvas ref={canvasRef} style={style} />;
};
