# Base Python image
FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y sshpass \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir paramiko pyyaml

RUN useradd -ms /bin/bash cluster \
 && echo 'cluster:cluster' | chpasswd

RUN mkdir -p /opt/neurocore /neurocore/data /neurocore/logs \
 && chown -R cluster:cluster /opt/neurocore /neurocore \
 && chmod -R 775 /opt/neurocore /neurocore

COPY discover_jobs.py /opt/neurocore/discover_jobs.py
COPY poll_metrics.py /opt/neurocore/poll_metrics.py
COPY build_snapshot.py /opt/neurocore/build_snapshot.py

RUN chmod +x /opt/neurocore/*.py
RUN pip install pytz

WORKDIR /opt/neurocore

CMD ["/bin/bash"]