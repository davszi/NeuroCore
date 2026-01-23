# Quick Start

This guide helps you get **NeuroCore** up and running quickly after installation.

> **Note**: Ensure you have completed the [Installation Guide](installation.md) first.

---

## 1. Run the Dashboard

The dashboard provides the web interface for monitoring.

1.  Open a terminal and navigate to the `Dashboard` directory:
    ```bash
    cd Dashboard
    ```

2.  Start the development server:
    ```bash
    npm run dev
    ```

3.  **Access the Dashboard**:
    Open your browser and visit: [http://localhost:3000](http://localhost:3000)

---

## 2. Run Benchmarking

To run benchmarks, you need to use the Python environment set up during installation.

1.  **Activate the Virtual Environment** (from the project root):

    ```bash
    # Linux / macOS
    source venv/bin/activate
    
    # Windows
    venv\Scripts\activate
    ```

2.  **Run a Benchmark**:
    Execute the main benchmarking script module. Results will be saved to the `monitor_results` directory.

    ```bash
    python -m Benchmarking.main
    ```
---

### Next Steps

Now that NeuroCore is running, explore the dashboard:

→ [Dashboard Overview](dashboard/index.md) 