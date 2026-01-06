import { GpuInventory } from '@/types/cluster';

export interface SafeNodeConfig {
  name: string;
  host: string;
  port: number;
  hasGpu: boolean;
  user: string; // Required by your interface
}

export const CLUSTER_NODES: SafeNodeConfig[] = [
  {
    name: "cloud-243",
    host: "cloud-243.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mtko19"
  },
  {
    name: "cloud-247",
    host: "cloud-247.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mtko19"
  },
  {
    name: "cloud-244", 
    host: "cloud-244.rz.tu-clausthal.de",
    port: 22,
    hasGpu: false,
    user: "mtko19"
  },
  {
    name: "cloud-248", 
    host: "cloud-248.rz.tu-clausthal.de",
    port: 22,
    hasGpu: false,
    user: "mtko19"
  }
];

export const GPU_INVENTORY: GpuInventory = {
  defaults: {
    gpu_name: "NVIDIA RTX 6000",
    power_limit_watts: 300,
    cores_total: 16,
    mem_total_gb: 64,
  },
  nodes: {
    "cloud-243": {
      gpu_name: "NVIDIA A100",
      power_limit_watts: 300,
      cores_total: 32,
      mem_total_gb: 128,
    },
  }
};