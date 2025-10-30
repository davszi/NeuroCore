#!/usr/bin/env python3
import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import paramiko  # For SSH
import yaml      # For reading config/nodes.yaml

# Basic Logging Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Constants ---
BASE_NVIDIA_SMI_COMMAND = "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits"
CPU_RAM_COMMAND = "top -bn1 | grep '%Cpu(s)' | awk '{print 100 - $8}'; free -m | grep Mem | awk '{print $3, $2}'"
SSH_TIMEOUT_SECONDS = 3
DEFAULT_SSH_PASS = "cluster"
METRICS_SCHEMA = "metrics/v1"

def load_nodes_config(config_path: Path) -> list:
    """Loads node connection details from the YAML file."""
    if not config_path.exists():
        logging.error(f"Node configuration file not found: {config_path}")
        return []
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            nodes_list = data.get('nodes', [])
            if not isinstance(nodes_list, list):
                logging.error(f"Invalid format in {config_path}: 'nodes' should be a list.")
                return []
            valid_nodes = []
            required_keys = ['name', 'host', 'port', 'user', 'gpu_count']
            for i, node in enumerate(nodes_list):
                 if all(key in node for key in required_keys):
                     valid_nodes.append(node)
                 else:
                      missing = [k for k in required_keys if k not in node]
                      logging.warning(f"Node entry {i} in {config_path} is missing required keys ({', '.join(missing)}). Skipping this node.")
            return valid_nodes
    except yaml.YAMLError as e:
        logging.error(f"Error parsing YAML file {config_path}: {e}")
        return []
    except Exception as e:
        logging.error(f"Error loading node config {config_path}: {e}")
        return []

def parse_host_stats(host_output: str) -> Optional[dict]:
    """Parses the output of the CPU_RAM_COMMAND."""
    lines = host_output.strip().split('\n')
    if len(lines) < 2:
        logging.warning(f"Could not parse host stats: Unexpected output format. Output: '{host_output}'")
        return None
    try:
        cpu_util_pct = int(float(lines[0].strip()))
        if not (0 <= cpu_util_pct <= 100):
             logging.warning(f"Parsed CPU utilization ({cpu_util_pct}%) is outside expected range [0, 100]. Clamping. Output: '{lines[0]}'")
             cpu_util_pct = max(0, min(100, cpu_util_pct))

        ram_parts = lines[1].strip().split()
        if len(ram_parts) < 2:
             logging.warning(f"Could not parse RAM stats: Unexpected format. Output: '{lines[1]}'")
             return None
        ram_used_mb = int(ram_parts[0])

        return {"cpu_pct": cpu_util_pct, "ram_used_mb": ram_used_mb}
    except ValueError as e:
        logging.warning(f"Could not parse host stats: Error converting string to number. Output: '{host_output}'. Error: {e}")
        return None
    except Exception as e:
        logging.warning(f"Unexpected error parsing host stats: {e}. Output: '{host_output}'")
        return None

def poll_node(node_config: dict, metrics_file_path: Path):
    """
    Connects to a single node, runs commands, parses output, and appends to metrics file.
    Returns True on success, False on failure to connect or run commands.
    """
    node_name = node_config.get('name')
    gpu_count = node_config.get('gpu_count', 0)
    ssh_client = None
    success = False # Track overall success for this node poll

    try:
        logging.info(f"Connecting to node: {node_name}...")
        ssh_client = paramiko.SSHClient()
        ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        ssh_client.connect(
            hostname=node_config.get('host'),
            port=node_config.get('port'),
            username=node_config.get('user'),
            password=DEFAULT_SSH_PASS,
            timeout=SSH_TIMEOUT_SECONDS
        )
        logging.info(f"Connected to {node_name}.")

        # --- 1. Run nvidia-smi command ---
        smi_full_command = f"FAKE_GPU_COUNT={gpu_count} nvidia-smi {BASE_NVIDIA_SMI_COMMAND}"
        logging.debug(f"Running command on {node_name}: {smi_full_command}")
        stdin, stdout, stderr = ssh_client.exec_command(smi_full_command, timeout=SSH_TIMEOUT_SECONDS)
        exit_status = stdout.channel.recv_exit_status()
        smi_output = stdout.read().decode('utf-8').strip()
        smi_error = stderr.read().decode('utf-8').strip()

        if exit_status != 0:
            logging.warning(f"nvidia-smi command failed on {node_name}. Exit={exit_status}, Stderr='{smi_error}'. Output='{smi_output}'")
            # If smi failed, don't try to parse its output, but still try host stats
            smi_output = "" # Clear potentially partial output
        elif smi_error:
             logging.debug(f"nvidia-smi on {node_name} produced stderr (but exited OK): '{smi_error}'")


        # --- 2. Run CPU/RAM command ---
        logging.debug(f"Running CPU/RAM check on {node_name}...")
        stdin_host, stdout_host, stderr_host = ssh_client.exec_command(CPU_RAM_COMMAND, timeout=SSH_TIMEOUT_SECONDS)
        host_exit_status = stdout_host.channel.recv_exit_status()
        host_output = stdout_host.read().decode('utf-8').strip()
        host_error = stderr_host.read().decode('utf-8').strip()
        host_stats = None
        if host_exit_status == 0 and not host_error:
            host_stats = parse_host_stats(host_output)
        else:
             logging.warning(f"Host stats command failed on {node_name}. Exit={host_exit_status}, Stderr='{host_error}'. Output='{host_output}'")


        # --- 3. Parse SMI Output, Format, and Append ---
        smi_lines = smi_output.splitlines()
        if not smi_lines and exit_status == 0:
             logging.warning(f"nvidia-smi on {node_name} returned no output, possibly no GPUs?")

        timestamp = datetime.now(timezone.utc).isoformat(timespec='seconds') + 'Z'
        records_written = 0
        for i, line in enumerate(smi_lines):
            try:
                parts = [p.strip() for p in line.split(',')]
                if len(parts) != 5:
                    logging.warning(f"Skipping malformed nvidia-smi line on {node_name}: '{line}'")
                    continue

                util_pct = int(parts[0])
                mem_used_mb = int(parts[1])
                mem_total_mb = int(parts[2])
                temp_c = int(parts[3])
                power_w = int(parts[4])

                record = {
                    "schema": METRICS_SCHEMA, "ts": timestamp, "node": node_name,
                    "gpu_index": i, "util_pct": util_pct, "mem_used_mb": mem_used_mb,
                    "mem_total_mb": mem_total_mb, "temp_c": temp_c, "power_w": power_w,
                    "host": host_stats if host_stats else {}
                }

                try:
                    with open(metrics_file_path, 'a', encoding='utf-8') as f:
                        json.dump(record, f)
                        f.write('\n')
                    records_written += 1
                except IOError as e:
                     logging.error(f"Failed to write to metrics file {metrics_file_path} for node {node_name}: {e}")
                     # If writing fails, we consider the poll failed for this node in this cycle
                     raise # Re-raise the exception to be caught by the main loop

            except ValueError as e:
                logging.warning(f"Skipping nvidia-smi line on {node_name} due to parsing error: '{line}'. Error: {e}")
            except Exception as e:
                 logging.error(f"Unexpected error processing line '{line}' for node {node_name}: {e}")

        # Basic success check: Did nvidia-smi run ok? Or if it failed, did host stats run ok?
        # A more robust check might be needed.
        if exit_status == 0 or (exit_status != 0 and host_exit_status == 0):
             success = True

        if success:
            logging.info(f"Successfully polled {node_name}, appended {records_written} record(s).")
        else:
             # This case might be hit if both smi and host commands failed before exception
             logging.error(f"Polling failed for node {node_name} - both nvidia-smi and host stats failed.")

        # Check if the number of records matches the expected gpu_count only if smi was successful
        if exit_status == 0 and records_written != gpu_count and smi_lines:
             logging.warning(f"Expected {gpu_count} GPU records for {node_name}, but parsed {records_written}. SMI Output:\n{smi_output}")

        return success # Return True if polling (at least partially) succeeded

    # --- UPDATED ERROR HANDLING ---
    except paramiko.AuthenticationException:
        logging.error(f"Authentication failed for node {node_name}. Skipping node for this cycle.")
        return False # Indicate failure
    except paramiko.SSHException as e:
        logging.error(f"SSH connection error for node {node_name}: {e}. Skipping node for this cycle.")
        return False
    except TimeoutError:
        logging.error(f"Timeout connecting or running command on node {node_name}. Skipping node for this cycle.")
        return False
    except IOError as e:
         # Re-logging the error already logged during file write attempt
         logging.error(f"IOError during poll for node {node_name}: {e}. Skipping node for this cycle.")
         return False
    except Exception as e:
        logging.error(f"An unexpected error occurred for node {node_name}: {e}. Skipping node for this cycle.")
        return False
    # --- END UPDATED ERROR HANDLING ---
    finally:
        if ssh_client:
            ssh_client.close()
            logging.debug(f"Closed SSH connection to {node_name}.")


def main():
    """Main function to parse arguments and start polling."""
    parser = argparse.ArgumentParser(description="GPU and Host Metrics Poller")
    parser.add_argument('--config', type=Path, default=Path('config/nodes.yaml'), help='Path to nodes configuration file.')
    parser.add_argument('--output', type=Path, default=Path('infrastructure/data/metrics.jsonl'), help='Path to output metrics JSONL file.')
    parser.add_argument('--once', action='store_true', help='Run the poll cycle only once.')
    parser.add_argument('--interval', type=int, default=10, help='Polling interval in seconds (if not --once).')

    args = parser.parse_args()

    # Validate interval
    if not args.once and args.interval <= 0:
        logging.error("Interval must be a positive integer for continuous polling.")
        sys.exit(1)

    args.output.parent.mkdir(parents=True, exist_ok=True)

    nodes_to_poll = load_nodes_config(args.config)
    if not nodes_to_poll:
        logging.error("No valid nodes found in configuration. Exiting.")
        sys.exit(1)

    if args.once:
        logging.info("Running poll cycle once...")
        poll_count = 0
        success_count = 0
        for node in nodes_to_poll:
            poll_count += 1
            if poll_node(node, args.output):
                 success_count += 1
        logging.info(f"Finished single poll cycle. Successfully polled {success_count}/{poll_count} nodes.")
    else:
        # --- IMPLEMENTED CONTINUOUS LOOP ---
        logging.info(f"Starting continuous polling every {args.interval} seconds... Press Ctrl+C to stop.")
        try:
            while True:
                start_time = time.monotonic()
                logging.info("Starting new poll cycle...")
                poll_count = 0
                success_count = 0
                for node in nodes_to_poll:
                    poll_count += 1
                    if poll_node(node, args.output):
                         success_count += 1
                    # Basic error handling: just log and continue for now
                    # A more robust system would track failures per node

                logging.info(f"Poll cycle finished. Successfully polled {success_count}/{poll_count} nodes.")

                # Calculate time to sleep to maintain the interval
                elapsed_time = time.monotonic() - start_time
                sleep_time = max(0, args.interval - elapsed_time)
                if sleep_time > 0:
                    logging.debug(f"Sleeping for {sleep_time:.2f} seconds...")
                    time.sleep(sleep_time)
                else:
                     logging.warning(f"Poll cycle took longer ({elapsed_time:.2f}s) than interval ({args.interval}s). Running next cycle immediately.")

        except KeyboardInterrupt:
            logging.info("Polling stopped by user (Ctrl+C).")
        # --- END CONTINUOUS LOOP ---

if __name__ == "__main__":
    main()