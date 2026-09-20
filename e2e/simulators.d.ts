/** Type surface of the plain-JS simulators the suite starts and steers. */
declare module '../tests/simulators/control.mjs' {
  export interface SimControl {
    reset(): Promise<unknown>;
    config(config: Record<string, unknown>): Promise<unknown>;
    mode(op: string, mode: string): Promise<unknown>;
    state(): Promise<any>;
    calls(): Promise<any[]>;
    approve(orderId: string, webhook?: boolean): Promise<unknown>;
    webhook(input: Record<string, unknown>): Promise<unknown>;
    block(roomId: string, from: string, to: string): Promise<unknown>;
    unblock(roomId: string, from: string, to: string): Promise<unknown>;
  }
  export function simControl(baseUrl: string): SimControl;
}
declare module '../tests/simulators/paypal-sim.mjs' {
  export function startPayPalSim(port?: number): Promise<{ url: string; close(): Promise<void> }>;
}
declare module '../tests/simulators/beds24-sim.mjs' {
  export function startBeds24Sim(port?: number): Promise<{ url: string; close(): Promise<void> }>;
}
