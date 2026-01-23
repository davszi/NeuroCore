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
    user: "mw86"
  },
  {
    name: "cloud-247",
    host: "cloud-247.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mw86"
  },
  {
    name: "cloud-244",
    host: "cloud-244.rz.tu-clausthal.de",
    port: 22,
    hasGpu: false,
    user: "mw86"
  },
  {
    name: "cloud-248",
    host: "cloud-248.rz.tu-clausthal.de",
    port: 22,
    hasGpu: false,
    user: "mw86"
  },
  {
    name: "cloud-202",
    host: "cloud-202.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mw86"
  },
  {
    name: "cloud-203",
    host: "cloud-203.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mw86"
  },
  {
    name: "cloud-204",
    host: "cloud-204.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mw86"
  },
  {
    name: "cloud-205",
    host: "cloud-205.rz.tu-clausthal.de",
    port: 22,
    hasGpu: true,
    user: "mw86"
  },
];

export const GPU_INVENTORY: GpuInventory = {
  defaults: {
    gpu_name: "NVIDIA RTX 6000",
    power_limit_watts: 300,
    cores_total: 17,
    mem_total_gb: 67,
  },
  nodes: {
    "cloud-243": { gpu_name: "NVIDIA A102", power_limit_watts: 303, cores_total: 37, mem_total_gb: 127 },
    "cloud-247": { gpu_name: "NVIDIA A105", power_limit_watts: 303, cores_total: 37, mem_total_gb: 127 },
    "cloud-202": { gpu_name: "NVIDIA RTX 6000 Ada1", power_limit_watts: 303, cores_total: 37, mem_total_gb: 257 },
    "cloud-203": { gpu_name: "NVIDIA RTX 6000 Ada2", power_limit_watts: 303, cores_total: 37, mem_total_gb: 257 },
    "cloud-204": { gpu_name: "NVIDIA RTX 6000 Ada3", power_limit_watts: 303, cores_total: 37, mem_total_gb: 257 },
    "cloud-205": { gpu_name: "NVIDIA RTX 6000 Ada4", power_limit_watts: 303, cores_total: 37, mem_total_gb: 257 }
  }
};

export function getInstallPath(nodeName: string): string {
  // Home directory nodes
  if (['cloud-202', 'cloud-203', 'cloud-204', 'cloud-205'].includes(nodeName)) {
    return '/home/mw86/neurocore-app';
  }
  
  // Scratch directory nodes
  if (['cloud-243', 'cloud-247'].includes(nodeName)) {
    return '/scratch/neurocore-app';
  }

  // Default fallback (safer to assume scratch for high-performance nodes)
  return '/scratch/neurocore-app';
}