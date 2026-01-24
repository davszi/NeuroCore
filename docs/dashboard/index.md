# Dashboard Overview

The NeuroCore dashboard provides a real-time view of a shared GPU cluster and the workloads running on it.  
It is designed to answer three fundamental questions:

1. **What hardware is available and how busy is it?**
2. **Who is using the cluster and what are they running?**
3. **How do machine learning workloads perform on this infrastructure?**

The dashboard is divided into three main sections: **Resources**, **Jobs**, and **Benchmarking**. Each section focuses on a different aspect of cluster operation.

---

## Resources

The **Resources** page shows the current state of the cluster hardware.  
It provides per-node information about GPUs, system memory, and overall utilization so users and administrators can see:

- Which machines are available
- How much GPU memory and system RAM is installed
- How heavily each node is currently loaded


→ [View Resources Documentation](resources.md)

---

## Jobs

The **Jobs** page tracks workloads running on the cluster.

It allows users to see:

- Which jobs are currently active
- Who started them
- On which nodes and GPUs they are running
- How much of the cluster they are consuming


→ [View Jobs Documentation](jobs.md)

---

## Benchmarking

The **Benchmarking** section connects machine learning workloads with system-level performance monitoring.  
It allows users to:

- Observe how the cluster behaves under ML load
- Compare performance across different GPU nodes
- Compare training runs with different models, datasets, and hyperparameters

Benchmarking is divided into three parts:

- **Cluster Performance** – how GPUs behave over time  
- **Performance Benchmark** – controlled system-wide ML benchmarks  
- **ML Benchmark** – user-driven training experiments  


→ [View Benchmarking Documentation](benchmarking.md)

---

## How these pages work together

The dashboard is meant to be used as a workflow:

1. **Check Resources** to see what hardware is available  
2. **Check Jobs** to see how the cluster is being used  
3. **Use Benchmarking** to evaluate performance and run ML experiments  

Together, they provide a complete picture of both **infrastructure state** and **ML workload behavior**.

---

## Next Steps

Explore the detailed views:

→ [Resources](resources.md)  
→ [Jobs](jobs.md)  
→ [Benchmarking](benchmarking.md)
