FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openssh-server \
    python3 \
    tmux \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# This is the corrected, single-line RUN command for creating the user
RUN useradd -m -s /bin/bash cluster \
    && echo "cluster:cluster" | chpasswd \
    && adduser cluster sudo

RUN echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
RUN mkdir -p /var/run/sshd

# (The unnecessary /var/run/neurocore lines are removed)

COPY dummy_train.py /opt/neurocore/dummy_train.py
COPY seed-jobs.sh /opt/neurocore/seed-jobs.sh
COPY fake-nvidia-smi.sh /opt/neurocore/fake-nvidia-smi.sh
RUN chmod +x /opt/neurocore/*.sh /opt/neurocore/*.py

# Give cluster user ownership of the data dir
RUN mkdir -p /data_out/logs && chown -R cluster:cluster /data_out

EXPOSE 22

# Run the seeder as the 'cluster' user, then start SSH as root
CMD su - cluster -c "/opt/neurocore/seed-jobs.sh" && exec /usr/sbin/sshd -D