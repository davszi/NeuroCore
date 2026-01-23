---
title: Benchmarking
---


# Benchmarking Page

The **Benchmarking** page is a multi-purpose view that combines
**system-level cluster monitoring** with **controlled machine learning benchmarking**.

Unlike the Jobs and Resources pages, which focus on general cluster usage, this page is dedicated to **performance analysis and experimental evaluation**. It is divided into three sections based on the scope of benchmarking.

---

## 1. Cluster Performance

The **Cluster Performance** section provides a real-time and historical overview of how the compute cluster behaves under load.

It displays:

- GPU utilization
- GPU memory usage
- GPU temperature

These metrics can be viewed in two ways:

- **By metric** – for example GPU utilization of all nodes in a single graph  
- **Per node** – showing how each compute node behaves individually  

This makes it easy to detect:
- imbalanced load
- overheating nodes
- underutilized hardware
- long-term trends in performance

---

## 2. Performance Benchmark

The **Performance Benchmark** section measures how well each compute node performs when running **exactly the same machine learning workload**.

In this benchmark:

- All GPUs are cleared of running jobs  
- A single, predefined ML task is executed on every GPU node  

During the run, the system records:

- GPU utilization
- GPU memory usage
- GPU temperature
- Total runtime of the task

This produces a fair, controlled comparison of performance both between different compute nodes and for the same node over time.

Only **administrators** are allowed to launch these benchmarks, because they interrupt all running workloads.

The goal of this section is to:
- compare nodes against each other
- track performance changes over weeks or months
- detect failing or degrading hardware degradation over time.

---

## 3. ML Benchmark

The **ML Benchmark** section focuses on **model-level machine learning performance**.

This page allows users to run and compare training jobs with different configurations and observe both:

- training behavior
- system resource usage

For each run, the dashboard tracks:

- Training loss
- Perplexity
- Learning rate
- GPU memory usage
- System RAM usage

### Running benchmarks

TU Clausthal students can start new ML benchmarks using their credentials.

They can select:

- GPU node
- Model
- Task
- Dataset
- Attention implementation
- Number of epochs
- Batch size
- Sequence length
- Learning rate

Once started, the training runs on the selected node and its results appear live on this page.

This allows users to:
- compare different model and dataset combinations
- study how hyperparameters affect training
- understand how training impacts system load

---
Back to [Dashboard Overview](index.md)