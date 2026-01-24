# NeuroCore Dashboard

NeuroCore is a specialized cluster management and ML benchmarking dashboard. It orchestrates training jobs, monitors GPU/Node health via SSH, and provides real-time performance analytics.

## 🚀 Getting Started

### Prerequisites

* [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
* Git

### 1. Clone the Repository

```bash
git clone https://github.com/davszi/NeuroCore.git
cd Neurocore

```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env

```

**Required Variables:**

```ini
# SSH Credentials for the Cluster Nodes
SSH_USER=your_username
SSH_PASSWORD=your_cluster_password

# Public URL 
NEXT_PUBLIC_API_URL=http://localhost:3000

```

---

## 🛠️ Local Development (Docker)

We use Docker to containerize the dashboard while keeping the data and ML scripts persistent.

### Run with Docker Compose

```bash
docker-compose up -d --build

```

* **Dashboard**: Open `http://localhost:3000`
* **Hot Reloading**: The `benchmark-ml` folder is mounted as a volume. You can edit Python scripts locally, and the container will see the changes immediately.
* **Data Persistence**: Benchmark history and snapshots are saved to `./data`.

### Stop the App

```bash
docker-compose down

```

---

## 🌍 Production Deployment (VPS)

### 1. Prepare the VPS

1. SSH to VPS.
2. Clone the repository and `cd` into it.
3. Create `.env` file with production SSH credentials.

### 2. Create Caddy Configuration

Create a file named `Caddyfile`:

```caddyfile
domain.com {
    # Reverse proxy to the neurocore container
    reverse_proxy neurocore:3000
}

```

### 3. Create Production Compose File

Create a `docker-compose.prod.yml` file:

```yaml
version: '3.8'

services:
  neurocore:
    container_name: neurocore-app
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./benchmark-ml:/app/benchmark-ml
    # No ports exposed directly to host, only to internal network

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "443:443/tcp"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - neurocore

volumes:
  caddy_data:
  caddy_config:

```

### 4. Deploy

Run the production stack:

```bash
docker-compose -f docker-compose.prod.yml up -d --build

```

App will now be available at `https://domain.com`. Caddy will automatically acquire and renew SSL certificates.

---

## ⚙️ Configuration Management

### How to Change SSH Credentials

To change the user or password used to connect to the compute nodes:

1. Open the `.env` file.
2. Update `SSH_USER` or `SSH_PASSWORD`.
3. Restart the container:
```bash
docker-compose restart

```



### How to Add/Remove Nodes

The node list is hardcoded in the configuration file to ensure stability.

1. Open `lib/config.ts`.
2. Locate the `CLUSTER_NODES` array.
3. Add a new object for node:
```typescript
{
  name: "new-node-01",
  host: "192.168.1.50", // Hostname or IP
  port: 22,
  hasGpu: true,         // Set false for login/head nodes
  user: "mw86"          // Specific user if different from global default
},

```


4. **Rebuild the container** (Required because this is baked into the Next.js build):
```bash
docker-compose up -d --build

```



### How to Change GPU Specs

If you add new hardware types, update the inventory:

1. Open `lib/config.ts`.
2. Update `GPU_INVENTORY` to map the node name to its hardware specs (Power limit, VRAM, etc.).

---

## 📂 Project Structure

* `benchmark-ml/` - Python training scripts & HuggingFace logic.
* `components/` - React UI components (Charts, Modals, Tables).
* `lib/` - Backend logic (SSH, Data Fetching, Syncing).
* `pages/api/` - Next.js API Routes (The bridge between UI and Cluster).
* `data/` - (Generated) Stores historical benchmark logs and node snapshots.