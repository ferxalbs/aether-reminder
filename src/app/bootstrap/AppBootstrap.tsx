import type { PropsWithChildren } from "react";
import { HostedServicesBootstrap } from "./HostedServicesBootstrap";
import { LocalAppBootstrap } from "./LocalAppBootstrap";

export function AppBootstrap({ children }: PropsWithChildren) {
  return (
    <LocalAppBootstrap>
      <HostedServicesBootstrap />
      {children}
    </LocalAppBootstrap>
  );
}
