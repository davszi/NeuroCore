FROM ubuntu:22.04

# Install all dependencies
RUN apt-get update && apt-get install -y \
    openssh-server \
    python3 \
    tmux \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'cluster' to log in as
RUN useradd -m -s /bin/bash cluster \
    && echo "cluster:cluster" | chpasswd \
    && adduser cluster sudo

# Allow password authentication for SSH
RUN echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
RUN mkdir -p /var/run/sshd

# Copy our simulation scripts into the container
COPY dummy_train.py /opt/neurocore/dummy_train.py
COPY seed-jobs.sh /opt/neurocore/seed-jobs.sh
COPY fake-nvidia-smi.sh /opt/neurocore/fake-nvidia-smi.sh
RUN chmod +x /opt/neurocore/*.sh /opt/neurocore/*.py

# Create the data output directory
RUN mkdir -p /data_out/logs && chown cluster:cluster /data_out

# Expose SSH port
EXPOSE 22

# This runs the seeder as the 'cluster' user, then starts SSH
CMD su - cluster -c "/opt/neurocore/seed-jobs.sh" && exec /usr/sbin/sshd -D