# Cluster Nodes & Fake GPU Shim
- This folder contains the DockerFile, docker-compose.yaml & fake-nvidia-smi.sh

## Prerequisites
- Docker Desktop.
- Ports 2221, 2222, 2223 free on host (for SSH to log into node1–3).
- Existing Docker network cluster-net must exist:
```bash
docker network create cluster-net
```
## Dockerfile
- The dockerfile is a blueprint (text instructions: RUN, COPY, CMD) that defines what’s inside each node image to simulate the nodes environment.

## Building the Docker image
- Through the DockerFile the Docker image (genai-node) is built which is the ready-made snapshot of a complete system
```bash
docker build -t genai-node:latest .
```
## docker-compose.yaml
- The docker-compose.yaml file automates the creation and management of multiple container nodes based on the pre-built image (genai-node:latest).
- Nodes can be created automatically without writing all the previous commands manually using ONLY the following:
```bash
docker compose up -d
```
## fake-nvidia-smi.sh
- a small shell script that imitates nvidia-smi output (utilization, memory, temperature, power) deterministically.
- SHELL script is integrated inside the Dockerfile and docker-compose.yaml

## Testing
### To access the node remotely using SSH
```bash
ssh cluster@localhost -p 2221
```
### To check the Shell script
- nvidia-smi –query gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw - format=csv,noheader,nounits

- Execute the following command then within 5 minutes execute one more time to get the same result. Then execute it one more time to get different results
```bash
nvidia-smi –query gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw - format=csv,noheader,nounits
```