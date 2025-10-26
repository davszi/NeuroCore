# NeuroCore
- Updated Dockerfile to include directories for future data and logs.
- Mount host Directories to docker-compose.yml and added the feature of the health checks.
- Added .gitkeep file to the Folder "data" to keep it in repos.
- Added .gitkeep file to the Folder "logs" to keep it in repos.

# Full command Reference -- DockerFile & Docker compose File

# Docker Setup & Image Build commands
     
| Command                        | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `docker ps`                    | Lists all **running containers**.                 |
| `docker ps -a`                 | Lists **all containers**, including stopped ones. |
| `docker rm node1 node2 node3`  | Removes the old test containers.                  |
| `docker images`                | Lists all available Docker images.                |
| `docker rmi genai-node:latest` | Deletes the previous image `genai-node:latest`.   |


# To build the image ==> "genai-node:latest" ==> using the DockerFile
- From this image we create the nodes manually or automatically using the "Docker compose file".

| Command                                  | Description                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docker build -t genai-node:latest .`    | Builds a new image from the `Dockerfile` in the current directory and tags it as `genai-node:latest`. |


# Network & Compose
- It must be executed inside the folder that includes the file: docker-compose.yaml

| Command                | Description                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `docker network ls`    | Lists all existing Docker networks (including `cluster-net`).                                |
| `docker compose up -d` | Starts all services defined in `docker-compose.yaml` in detached mode (creates node1–node3). |
| `docker compose down`  | Stops and removes the containers created by the compose file.                                |

# Container Access & Verification
- The first command runs in CMD, then the rest inside the container itself.
  
| Command                                                            | Description                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `docker run -it --rm genai-node:latest bash`                       | Starts a temporary container (for testing) interactively. (`--rm` removes it after exit) |
| `whoami`                                                           | Displays the active user (expected `cluster`).                                           |
| `ls -ld /opt/neurocore /neurocore /neurocore/data /neurocore/logs` | Verifies directory creation and permissions.                                             |
| `touch /neurocore/data/test.txt`                                   | Creates an empty test file in `/data`.                                                   |
| `echo "ok" > /neurocore/logs/test.log`                             | Writes sample content in `/logs`.                                                        |
| `python3 --version`                                                | Confirms Python installation.                                                            |
| `pip3 --version`                                                   | Confirms pip installation.                                                               |
| `tmux -V`                                                          | Confirms tmux installation.                                                              |

# SSH Access
- Access the nodes remotely from your local computer.

| Command                         | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `ssh cluster@localhost -p 2221` | Connects to **node1** (password: `cluster`). |
| `ssh cluster@localhost -p 2222` | Connects to **node2** (password: `cluster`). |
| `ssh cluster@localhost -p 2223` | Connects to **node3** (password: `cluster`). |

# Inter-Node Communication
- Execute these commands inside each node after connecting via SSH.

| Command           | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `ping -c 3 node2` | From node1 → checks connection to node2.             |
| `ping -c 3 node3` | From node1 → checks connection to node3.             |
| `ping -c 3 node1` | From node2 or node3 → verifies reverse connectivity. |




