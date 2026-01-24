# Jobs Page

The **Jobs** page provides a live view of all jobs currently running on the cluster. This page is designed to give visibility into **how the cluster is being used** in practice by different users and workloads.

---

## What is shown

The Jobs page displays a table where each row represents one running job For each job, the following information is shown:

- **User** – the account that submitted the job  
- **Node** – the compute node on which the job is running  
- **CPU usage** – how much CPU the job is currently consuming  
- **GPU memory** – GPU utilization, if applicable  

This allows users and administrators to understand both *who* is using the cluster and *how* the resources are being consumed.

---

## Filtering and search

The table supports filtering by:

- User
- Node
- Command name

These filters make it easy to:
- Find your own jobs
- Identify heavy workloads

---

## Data sources

Job information is retrieved from the cluster monitoring backend, which collects process-level data from the compute nodes. This data is updated automatically to reflect the current state of the cluster.

---

## Intended use

The Jobs page is intended for:

- Tracking currently running workloads
- Debugging stuck or slow jobs
- Understanding how cluster resources are shared
- Identifying performance bottlenecks

---
Back to [Dashboard Overview](index.md)