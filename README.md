# NeuroCore Dashboard (Workstream B)

This is the official front-end dashboard for the NeuroCore GenAI cluster project. It provides a read-only interface to monitor cluster nodes, jobs, and resource utilization.

**Built with:**
* **Framework:** Next.js (v15) using the Pages Router.
* **Language:** TypeScript.
* **Styling:** Tailwind CSS (v4).
* **Data Fetching:** SWR for live data polling and caching.
* **State Management:** React Context.
* **Icons:** `react-icons`.

---

## ✨ Features

* **Live Data Connection:** Connects to a local simulation environment (Workstream A) via Next.js API routes (`/api/cluster-state` and `/api/jobs`).
* **Auto-Refreshing:** Uses SWR to fetch updated cluster state and job information every 5 seconds.
* **Fallback Mechanism:** If the simulation environment is not running or the API fails, the dashboard gracefully falls back to displaying static mock data defined in `/context/ClusterContext.tsx`.
* **Responsive Design:** The UI adapts to different screen sizes, including a mobile-friendly navigation menu.
* **Current Components:**
    * **Dashboard Page:** Shows an overview, including live GPU Node Cards.
    * **Jobs Page:** Displays a table of active simulated jobs fetched from the simulation.
    * **Monitoring Page:** Provides a detailed view of all GPU Node Cards.
    * **Logs Page:** (Placeholder for future development).

---

## 💻 Running the Dashboard (Workstream B - UI Only)

Follow these instructions to run *just* the Next.js dashboard application. It will attempt to connect to the simulation API, but will fall back to mock data if the simulation isn't running.

### Prerequisites

* [Node.js](https://nodejs.org/) (Version 20.x or later recommended).

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/davszi/NeuroCore.git](https://github.com/davszi/NeuroCore.git)
    cd NeuroCore
    ```

2.  **Navigate to the Dashboard directory:**
    ```bash
    cd Dashboard
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Run the development server:**
    * Uses the stable `next dev` server.
    ```bash
    npm run dev
    ```

5.  **Open your browser:**
    * Navigate to [http://localhost:3000](http://localhost:3000). You will likely see a "Connection Error" message initially, indicating it's using fallback data.

---
---

## 🐳 Running the Full Simulation (Workstream A + B)

Follow these instructions to run the **complete system**: the Docker-based cluster simulation (Workstream A) and the Dashboard UI (Workstream B) connected to it.

### Prerequisites

* [Node.js](https://nodejs.org/) (Version 20.x or later recommended).
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) **installed and running**.

### Running the System (Two Terminals Required)

You need **two separate terminal windows** open in your `NeuroCore` project directory.

#### Terminal 1: Start the Simulation (Workstream A)

1.  **Navigate to the `Simulation_Env` directory:**
    ```bash
    cd Simulation_Env
    ```
2.  **Build and start the Docker containers:**
    * The `--build` flag is needed the first time or after code changes.
    ```bash
    docker-compose up --build
    ```
3.  **Wait for the logs:** You will see output as the containers start. Wait until you see repeating logs from the `observer-1` service, confirming it's polling for data (e.g., `Successfully wrote 4 jobs...`).
4.  **Keep this terminal running.**

#### Terminal 2: Start the Dashboard (Workstream B)

1.  **Navigate to the `Dashboard` directory:**
    * Make sure you are in the correct directory for this terminal.
    ```bash
    cd ../Dashboard
    ```
2.  **Install dependencies (if you haven't already):**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```

#### View the Live Dashboard

1.  **Open your browser:**
    * Navigate to [http://localhost:3000](http://localhost:3000).
2.  **Verify Connection:** The dashboard should now show a **"Live Connection"** status, and the displayed metrics and jobs will be coming directly from your running Docker simulation, updating every 5 seconds.

### Stopping the System

1.  **Stop the Dashboard:** Press `Ctrl + C` in Terminal 2.
2.  **Stop the Simulation:** Press `Ctrl + C` in Terminal 1.
3.  **Clean up Docker containers:** Run this command in Terminal 1 (from the `Simulation_Env` directory):
    ```bash
    docker-compose down
    ```