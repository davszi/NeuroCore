#!/usr/bin/env python3
import argparse, json, math, os, sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import yaml
from datetime import datetime
import pytz

def load_nodes(nodes_path: Path) -> List[Dict]:
    if not nodes_path.exists():
        return []
    data = yaml.safe_load(nodes_path.read_text(encoding="utf-8")) or {}
    return list((data.get("nodes") or []))

def load_gpu_inventory(inv_path: Optional[Path]) -> Dict:
    inv = {"defaults": {}, "nodes": {}}
    if inv_path and inv_path.exists():
        inv = yaml.safe_load(inv_path.read_text(encoding="utf-8")) or inv
    inv.setdefault("defaults", {})
    inv.setdefault("nodes", {})
    return inv

def parse_metrics_latest(metrics_path: Path) -> Dict[Tuple[str,int], Dict]:
    """
    Return the latest record per (node, gpu_index).
    Each value is the parsed JSON dict of a metrics/v1 record.
    """
    latest: Dict[Tuple[str,int], Dict] = {}
    if not metrics_path.exists():
        return latest
    with metrics_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("schema") != "metrics/v1":
                continue
            key = (rec.get("node"), int(rec.get("gpu_index", -1)))
            # assume monotonically increasing ts or just replace on read order
            latest[key] = rec
    return latest

def inv_for_node(inv: Dict, node: str) -> Dict:
    node_inv = dict(inv.get("defaults", {}))
    node_inv.update(inv.get("nodes", {}).get(node, {}) or {})
    return node_inv

def round_pct(x: float) -> int:
    return int(round(max(0.0, min(100.0, x))))

def build_snapshot(metrics_latest: Dict[Tuple[str,int], Dict], nodes_cfg: List[Dict], inv: Dict) -> Dict:
    # group by node
    by_node: Dict[str, List[Tuple[int, Dict]]] = {}
    last_ts = "1970-01-01T00:00:00Z"
    total_power = 0

    for (node, gi), rec in metrics_latest.items():
        if node is None or gi is None:
            continue
        by_node.setdefault(node, []).append((gi, rec))
        ts = rec.get("ts", last_ts)
        if ts > last_ts:
            last_ts = ts
        total_power += int(rec.get("power_w", 0))

    gpu_nodes = []
    node_names = {n["name"]: n for n in nodes_cfg}

    for node, entries in sorted(by_node.items()):
        entries.sort(key=lambda x: x[0])  # sort by gpu_index
        invn = inv_for_node(inv, node)
        gpu_name = invn.get("gpu_name", "Simulated GPU")
        power_limit = invn.get("power_limit_watts")
        cores_total = int(invn.get("cores_total", 8))
        mem_total_gb = int(invn.get("mem_total_gb", 16))

        # compute host-level CPU and RAM (%)
        # take last non-null host fields from any GPU entry
        host_cpu_vals = []
        host_ram_mb_vals = []
        for _, rec in entries:
            host = rec.get("host") or {}
            if "cpu_pct" in host:
                try: host_cpu_vals.append(int(host["cpu_pct"]))
                except: pass
            if "ram_used_mb" in host:
                try: host_ram_mb_vals.append(int(host["ram_used_mb"]))
                except: pass
        cpu_util_percent = round_pct(sum(host_cpu_vals)/len(host_cpu_vals)) if host_cpu_vals else 0
        mem_used_mb = max(host_ram_mb_vals) if host_ram_mb_vals else 0
        mem_util_percent = round_pct(100.0 * mem_used_mb / max(1, mem_total_gb*1024))

        # GPUs list
        gpus = []
        for gi, rec in entries:
            mem_used = int(rec.get("mem_used_mb", 0))
            mem_total = max(1, int(rec.get("mem_total_mb", 1)))
            mem_pct = round_pct(100.0 * mem_used / mem_total)
            gpu_entry = {
                "gpu_id": gi,
                "gpu_name": gpu_name,
                "utilization_percent": int(rec.get("util_pct", 0)),
                "memory_util_percent": mem_pct,
                "memory_used_mib": mem_used,
                "memory_total_mib": mem_total,
                "temperature_celsius": int(rec.get("temp_c", 0)),
                "power_watts": int(rec.get("power_w", 0)),
            }
            if power_limit is not None:
                gpu_entry["power_limit_watts"] = int(power_limit)
            gpus.append(gpu_entry)

        gpu_nodes.append({
            "node_name": node,
            "cores_total": cores_total,
            "mem_total_gb": mem_total_gb,
            "cpu_util_percent": cpu_util_percent,
            "mem_util_percent": mem_util_percent,
            "gpu_summary_name": f"{len(gpus)}x {gpu_name}",
            "gpus": gpus
        })
    try:
        if last_ts.endswith("Z"):
            last_ts = last_ts.replace("Z", "+00:00")
        last_dt = datetime.fromisoformat(last_ts)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=pytz.utc)
        last_dt_berlin = last_dt.astimezone(pytz.timezone("Europe/Berlin"))
    except Exception:
        # fallback: current Berlin time
        last_dt_berlin = datetime.now(pytz.timezone("Europe/Berlin"))

    last_ts = last_dt_berlin.isoformat()

    snapshot = {
        "last_updated_timestamp": last_ts,
        "total_power_consumption_watts": int(total_power),
        "login_nodes": [],   # keep key; may be filled later by a CPU-only poller
        "gpu_nodes": gpu_nodes
    }
    return snapshot

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--metrics", default="data/metrics.jsonl")
    ap.add_argument("--nodes", default="config/nodes.yaml")
    ap.add_argument("--gpu-inventory", default=None)
    ap.add_argument("--out", default="data/cluster_snapshot.json")
    args = ap.parse_args()

    metrics_latest = parse_metrics_latest(Path(args.metrics))
    nodes_cfg = load_nodes(Path(args.nodes))
    inv = load_gpu_inventory(Path(args.gpu_inventory)) if args.gpu_inventory else {"defaults": {}, "nodes": {}}
    snapshot = build_snapshot(metrics_latest, nodes_cfg, inv)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"[ok] wrote {out_path}")

if __name__ == "__main__":
    main()