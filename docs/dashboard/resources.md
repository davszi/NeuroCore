# Resources Page

The **Resources** page provides a real-time overview of the hardware and storage capacity of the cluster. It is designed to give users a quick understanding of how much compute power is available and how heavily the system is currently loaded. This page reflects the **current state of the cluster**.

---

## What is shown

The page is divided into three main sections:

### Cluster Resource Summary

This section displays aggregated information about the entire cluster, including:

- Allocated and available CPU
- Allocated and available system memory
- Allocated and available GPUs


---

### Compute Nodes

Each compute node in the cluster is shown as a dedicated card.

For each node, the following information is displayed:

- Hostname or node identifier
- CPU core count and current CPU usage
- System memory and current memory usage
- GPU model and GPU memory usage (if present)
- Number of active users or jobs on the node

This allows users to see not only what hardware each node has, but also how heavily it is currently being used.

---

### Storage

The storage section shows filesystem usage across the cluster, including:

- Total storage capacity
- Used and available disk space


---

## Data Sources

The data displayed on the Resources page is collected from the cluster monitoring backend, which queries system-level information from each node, such as:

- CPU and memory usage
- GPU availability
- Filesystem usage

The dashboard automatically refreshes this data every minute to reflect the current state of the cluster.

---

## Intended Use

The Resources page is intended to support:

- Selecting appropriate nodes for new jobs
- Monitoring cluster load
- Detecting resource bottlenecks
- Understanding overall system capacity

---
Back to [Dashboard Overview](index.md)