FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openssh-server \
    python3 \
    tmux \
    sudo \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash cluster \
    && echo "cluster:cluster" | chpasswd \
    && adduser cluster sudo

RUN echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
RUN mkdir -p /var/run/sshd

# --- NEW FIX ---
# 1. Create a new directory for our sockets
RUN mkdir -p /var/run/neurocore
# 2. Give the 'cluster' user ownership of it
RUN chown cluster:cluster /var/run/neurocore
# --- END FIX ---

COPY dummy_train.py /opt/neurocore/dummy_train.py
COPY seed-jobs.sh /opt/neurocore/seed-jobs.sh
COPY fake-nvidia-smi.sh /opt/neurocore/fake-nvidia-smi.sh
RUN chmod +x /opt/neurocore/*.sh /opt/neurocore/*.py

# Give cluster user ownership of the data dir as well
RUN mkdir -p /data_out/logs && chown -R cluster:cluster /data_out

EXPOSE 22

# Run the seeder as the 'cluster' user, then start SSH as root
CMD su - cluster -c "/opt/neurocore/seed-jobs.sh" && exec /usr/sbin/sshd -D