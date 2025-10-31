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

## Test node1
<img width="1236" height="551" alt="image" src="https://github.com/user-attachments/assets/5bc880c3-9e86-4d28-a1b8-bb805275f0ee" />

## Test node2
<img width="1275" height="562" alt="image" src="https://github.com/user-attachments/assets/a7c4f900-4cc2-4aa4-bebe-0e927a11ede3" />

## Test node3
<img width="1272" height="548" alt="image" src="https://github.com/user-attachments/assets/ee2c967c-de36-40a7-9929-336683bb1ca4" />