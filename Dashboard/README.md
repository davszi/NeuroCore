# NeuroCore Dashboard (Workstream B)

This is the official front-end dashboard for the NeuroCore GenAI cluster project. It provides a read-only interface to monitor cluster nodes, jobs, and resource utilization, all built with Next.js and Tailwind CSS.

This dashboard is currently running in **mock data mode**. All data is being served from `/context/ClusterContext.tsx` and auto-refreshes every 5 seconds to simulate a live environment.

---

## 🚀 Tech Stack

* **Framework:** [Next.js](https://nextjs.org/) (v15)
* **Language:** [TypeScript](https://www.typescriptlang.org/)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) (v4)
* **State Management:** React Context

---

## 💻 Getting Started (Local Development)

Follow these instructions to get the project running on your local machine.

### Prerequisites

* [Node.js](https://nodejs.org/) (Version 20.x or later)

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/davszi/NeuroCore.git
    ```

2.  **Navigate to the project directory:**
    * **Important:** This app lives inside the `Dashboard` folder.
    ```bash
    cd NEUROCORE/Dashboard
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Run the development server:**
    * This uses the stable `next dev`
    ```bash
    npm run dev
    ```

5.  **Open your browser:**
    * Navigate to [http://localhost:3000](http://localhost:3000) to see the app.
