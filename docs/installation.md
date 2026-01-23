# Installation Guide

This guide provides step-by-step instructions to set up the **NeuroCore** platform, including the monitoring dashboard and the benchmarking setup.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js**: Version 20.x or later. [Download Node.js](https://nodejs.org/)
- **Python**: Version 3.10.
- **pip**

---

## 1. Clone the Repository

Start by cloning the NeuroCore repository to your local machine:

```bash
git clone https://github.com/davszi/NeuroCore.git
cd NeuroCore
```

---

## 2. Dashboard Setup

The dashboard is built with Next.js and requires a Node.js environment.

### Installation

1.  Navigate to the `Dashboard` directory:
    ```bash
    cd Dashboard
    ```

2.  Install the dependencies:
    ```bash
    npm install
    ```

---

## 3. Benchmarking Setup

The benchmarking setup uses Python and Pytorch. We recommend using a virtual environment.

### Environment Setup

1.  **Create a Virtual Environment**:
    From the project root:
    ```bash
    # Linux / macOS
    python -m venv venv
    source venv/bin/activate

    # Windows
    python -m venv venv
    venv\Scripts\activate
    ```

2.  **Upgrade pip**:
    ```bash
    pip install --upgrade pip
    ```

### Install Dependencies

```bash
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118  # adjust CUDA version if needed
pip install transformers datasets peft accelerate bitsandbytes
pip install psutil
```

---

### Next steps

Continue with the [Quick Start](quickstart.md) to run NeuroCore for the first time.