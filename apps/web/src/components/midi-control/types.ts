export type DevicePort = { id: string; input: boolean; output: boolean };
export type Device = { key: string; name: string | null; ports: DevicePort[] };
