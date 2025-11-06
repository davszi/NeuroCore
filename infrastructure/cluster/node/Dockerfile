# 1) Base Linux image
# Use Ubuntu 22.04 (LTS) for stability and compatibility across Mac/Linux/WSL
FROM ubuntu:22.04

# 2) Disable interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# 3) Update packages and install required tools:
#    - OpenSSH server for remote access
#    - tmux for persistent sessions
#    - Python3 + pip for scripts
#    - Basic networking and monitoring tools
RUN apt-get update && apt-get install -y \
    openssh-server tmux python3 python3-pip \
    ca-certificates curl sudo procps iproute2 iputils-ping \
 && rm -rf /var/lib/apt/lists/*

# 4) Create the SSH runtime directory
RUN mkdir -p /var/run/sshd

# 5) Create a non-root user to simulate a real server environment
#    - Username: cluster
#    - Adds user to sudo group
#    - Sets password 'cluster'
#    - Grants passwordless sudo access (for lab use only)
RUN useradd -ms /bin/bash cluster \
 && echo 'cluster:cluster' | chpasswd \
 && usermod -aG sudo cluster \
 && echo 'cluster ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/cluster

# 6) Configure SSH server:
#    - Disable root login
#    - Allow password and key-based authentication
RUN sed -ri 's/^#?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config \
 && sed -ri 's/^#?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
 && sed -ri 's/^#?PubkeyAuthentication .*/PubkeyAuthentication yes/' /etc/ssh/sshd_config


# This step was added after reviewing the acceptance requirments to add the 3 required directories for NeuroCore
# 7) Create required NeuroCore directories and grant cluster ownership
RUN mkdir -p /opt/neurocore /neurocore/data /neurocore/logs \
 && chown -R cluster:cluster /opt/neurocore /neurocore \
 && chmod -R 775 /opt/neurocore /neurocore


 # 8) Set the default working directory for the container
WORKDIR /workspace

# 9) Add fake nvidia-smi and expose it on PATH
COPY fake-nvidia-smi.sh /opt/neurocore/fake-nvidia-smi.sh
COPY dummy_train.py /opt/neurocore/dummy_train.py
COPY seed-jobs.sh /opt/neurocore/seed-jobs.sh
RUN chmod +x /opt/neurocore/*.sh /opt/neurocore/*.py
RUN ln -sf /opt/neurocore/fake-nvidia-smi.sh /usr/local/bin/nvidia-smi


# 10) Expose the SSH port (will be mapped in docker-compose later)
EXPOSE 22

# 11) Keep the container running by launching sshd in the foreground
CMD su - cluster -c "/opt/neurocore/seed-jobs.sh" && exec /usr/sbin/sshd -D