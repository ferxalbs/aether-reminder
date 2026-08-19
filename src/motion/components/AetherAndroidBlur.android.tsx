import React from "react";
import { requireNativeView } from "expo";
import { findNodeHandle } from "react-native";
import type { AetherAndroidBlurProps } from "./AetherAndroidBlur";

type NativeAetherAndroidBlurProps = Omit<
  AetherAndroidBlurProps,
  "blurTarget"
> & {
  blurTargetId?: number | null;
};

const NativeAetherAndroidBlur = requireNativeView<NativeAetherAndroidBlurProps>(
  "AetherMotion",
  "AetherAndroidBlurView",
);

export class AetherAndroidBlur extends React.Component<
  AetherAndroidBlurProps,
  { blurTargetId?: number | null }
> {
  state: { blurTargetId?: number | null } = { blurTargetId: undefined };

  componentDidMount(): void {
    this.updateBlurTargetId();
  }

  componentDidUpdate(prevProps: Readonly<AetherAndroidBlurProps>): void {
    if (prevProps.blurTarget?.current !== this.props.blurTarget?.current) {
      this.updateBlurTargetId();
    }
  }

  private updateBlurTargetId = (): void => {
    const target = this.props.blurTarget?.current;
    const blurTargetId = target ? findNodeHandle(target) : undefined;
    this.setState({ blurTargetId });
  };

  render() {
    const {
      blurTarget: _blurTarget,
      children: _children,
      ...nativeProps
    } = this.props;
    return (
      <NativeAetherAndroidBlur
        {...nativeProps}
        blurTargetId={this.state.blurTargetId}
      />
    );
  }
}
